import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { CodingEvent } from '@ai-coding-studio/shared';
import { AIEngineProvider, CodingTask } from './engine.interface';

@Injectable()
export class ClaudeCodeAdapter implements AIEngineProvider {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  private docker: Docker;
  private activeExecs = new Map<string, { containerId: string }>();
  private readonly claudeEnv: string[];
  private readonly claudeModel: string;

  constructor(private readonly configService: ConfigService) {
    const socketPath = this.configService.get<string>('DOCKER_SOCKET', '');
    this.docker = socketPath ? new Docker({ socketPath }) : new Docker();

    this.claudeEnv = [];
    this.claudeModel = '';

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY', '');
    const authToken = this.configService.get<string>('ANTHROPIC_AUTH_TOKEN', '');
    const baseUrl = this.configService.get<string>('ANTHROPIC_BASE_URL', '');
    const model = this.configService.get<string>('ANTHROPIC_MODEL', '');

    if (authToken) {
      this.claudeEnv.push(`ANTHROPIC_AUTH_TOKEN=${authToken}`);
    } else if (apiKey) {
      this.claudeEnv.push(`ANTHROPIC_API_KEY=${apiKey}`);
    }

    if (baseUrl) {
      this.claudeEnv.push(`ANTHROPIC_BASE_URL=${baseUrl}`);
    }
    if (model) {
      this.claudeModel = model;
      this.claudeEnv.push(`ANTHROPIC_MODEL=${model}`);
    }

    const modelEnvKeys = [
      'ANTHROPIC_SMALL_FAST_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    ];
    for (const key of modelEnvKeys) {
      const val = this.configService.get<string>(key, '') || model;
      if (val) {
        this.claudeEnv.push(`${key}=${val}`);
      }
    }

    const envPassthrough = [
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      'API_TIMEOUT_MS',
    ];
    for (const key of envPassthrough) {
      const val = this.configService.get<string>(key, '');
      if (val) {
        this.claudeEnv.push(`${key}=${val}`);
      }
    }
  }

  async *execute(task: CodingTask): AsyncIterable<CodingEvent> {
    if (this.claudeEnv.length === 0) {
      yield {
        type: 'error',
        message: 'Claude Code credentials not configured. Set ANTHROPIC_API_KEY (direct) or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (MiniMax proxy) in server .env',
      };
      return;
    }

    this.activeExecs.set(task.taskId, { containerId: task.sandbox.id });

    try {
      yield {
        type: 'session_init',
        sessionId: task.taskId,
        model: this.claudeModel || 'claude-code',
      };

      const container = this.docker.getContainer(task.sandbox.id);

      // Use -p (prompt mode) with --dangerously-skip-permissions
      // This runs Claude Code in non-interactive agent mode that ACTUALLY executes tools
      // Unlike --print which only returns text without taking actions
      const cmd = [
        'claude',
        '-p', task.prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--max-turns', '50',
        '--dangerously-skip-permissions',
      ];
      if (this.claudeModel) {
        cmd.push('--model', this.claudeModel);
      }

      this.logger.log(`[Task ${task.taskId}] ========== CLAUDE CODE START ==========`);
      this.logger.log(`[Task ${task.taskId}] Sandbox: ${task.sandbox.id.substring(0, 12)}`);
      this.logger.log(`[Task ${task.taskId}] Prompt: ${task.prompt}`);
      this.logger.log(`[Task ${task.taskId}] Command: ${cmd.join(' ')}`);
      this.logger.log(`[Task ${task.taskId}] Env vars: ${this.claudeEnv.map((e) => e.split('=')[0]).join(', ')}`);

      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: task.sandbox.workDir,
        Env: this.claudeEnv,
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      yield { type: 'thinking', content: '正在执行 AI 编码任务...' };

      // Stream output in real-time instead of collecting all at once
      const events = await this.streamOutput(stream, task.taskId);
      for (const event of events) {
        yield event;
      }

      const inspect = await exec.inspect();
      this.logger.log(`[Task ${task.taskId}] Claude Code exit code: ${inspect.ExitCode}`);

      if (inspect.ExitCode !== 0) {
        yield {
          type: 'error',
          message: `Claude Code exited with code ${inspect.ExitCode}`,
          code: `exit_${inspect.ExitCode}`,
        };
      } else {
        yield {
          type: 'complete',
          result: 'AI 编码任务完成',
          durationMs: 0,
          costUsd: 0,
        };
      }

      this.logger.log(`[Task ${task.taskId}] ========== CLAUDE CODE END ==========`);
    } finally {
      this.activeExecs.delete(task.taskId);
    }
  }

  async abort(taskId: string): Promise<void> {
    const active = this.activeExecs.get(taskId);
    if (active) {
      const container = this.docker.getContainer(active.containerId);
      try {
        const killExec = await container.exec({
          Cmd: ['pkill', '-f', 'claude'],
          AttachStdout: false,
          AttachStderr: false,
        });
        await killExec.start({ Detach: true });
      } catch {
        // container might be gone
      }
      this.activeExecs.delete(taskId);
      this.logger.log(`Task aborted: ${taskId}`);
    }
  }

  private streamOutput(
    stream: NodeJS.ReadableStream,
    taskId: string,
  ): Promise<CodingEvent[]> {
    return new Promise((resolve, reject) => {
      const events: CodingEvent[] = [];
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const processChunk = (data: Buffer) => {
        // Docker multiplexed stream: 8-byte header + payload
        let offset = 0;
        while (offset < data.length) {
          if (offset + 8 > data.length) break;
          const streamType = data[offset];
          const length = data.readUInt32BE(offset + 4);
          offset += 8;

          if (offset + length > data.length) break;
          const payload = data.subarray(offset, offset + length).toString();
          offset += length;

          if (streamType === 1) {
            // stdout
            stdoutBuffer += payload;
            this.logger.log(`[Task ${taskId}] [stdout] ${payload.trimEnd()}`);

            // Try to parse stream-json lines
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.trim()) continue;
              const event = this.parseStreamLine(line, taskId);
              if (event) events.push(event);
            }
          } else if (streamType === 2) {
            // stderr
            stderrBuffer += payload;
            this.logger.warn(`[Task ${taskId}] [stderr] ${payload.trimEnd()}`);
          }
        }
      };

      stream.on('data', processChunk);

      stream.on('end', () => {
        // Process remaining buffer
        if (stdoutBuffer.trim()) {
          const event = this.parseStreamLine(stdoutBuffer, taskId);
          if (event) events.push(event);
        }
        if (stderrBuffer.trim()) {
          this.logger.warn(`[Task ${taskId}] [stderr final] ${stderrBuffer.trimEnd()}`);
        }
        resolve(events);
      });

      stream.on('error', reject);
    });
  }

  private parseStreamLine(line: string, taskId: string): CodingEvent | null {
    try {
      const parsed = JSON.parse(line);

      // stream-json format emits different message types
      if (parsed.type === 'system' && parsed.subtype === 'init') {
        return {
          type: 'session_init',
          sessionId: parsed.session_id || taskId,
          model: parsed.model || this.claudeModel,
        };
      }

      if (parsed.type === 'assistant') {
        const content = parsed.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'thinking' && block.thinking) {
              return { type: 'thinking', content: block.thinking };
            }
            if (block.type === 'text' && block.text) {
              return { type: 'text', content: block.text };
            }
            if (block.type === 'tool_use') {
              return {
                type: 'tool_use',
                toolName: block.name,
                input: block.input ?? {},
              };
            }
          }
        }
      }

      if (parsed.type === 'result') {
        if (parsed.subtype === 'success') {
          return {
            type: 'complete',
            result: parsed.result || 'Done',
            durationMs: parsed.duration_ms || 0,
            costUsd: parsed.total_cost_usd || 0,
          };
        } else {
          return {
            type: 'error',
            message: parsed.errors?.join('; ') || 'Unknown error',
            code: parsed.subtype,
          };
        }
      }

      // Fallback: output raw line as text
      this.logger.log(`[Task ${taskId}] [json] ${line.substring(0, 200)}`);
      return null;
    } catch {
      // Not JSON, output as plain text
      if (line.trim()) {
        this.logger.log(`[Task ${taskId}] [raw] ${line.substring(0, 200)}`);
        return { type: 'text', content: line };
      }
      return null;
    }
  }
}
