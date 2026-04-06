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

      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: task.sandbox.workDir,
        Env: this.claudeEnv,
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      yield { type: 'thinking', content: '正在执行 AI 编码任务...' };

      // Real-time streaming via async generator
      for await (const event of this.streamEvents(stream, task.taskId)) {
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

  /**
   * Async generator that yields CodingEvents as they arrive from the Docker stream.
   * This is truly streaming - events are yielded immediately when received.
   */
  private async *streamEvents(
    stream: NodeJS.ReadableStream,
    taskId: string,
  ): AsyncGenerator<CodingEvent> {
    // Use a queue + resolve pattern for async iteration over stream events
    const queue: CodingEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;
    let stdoutBuffer = '';

    const pushEvent = (event: CodingEvent) => {
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    const processPayload = (payload: string) => {
      stdoutBuffer += payload;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        this.logger.log(`[Task ${taskId}] [stdout] ${line.substring(0, 300)}`);
        const events = this.parseStreamLine(line, taskId);
        for (const event of events) pushEvent(event);
      }
    };

    stream.on('data', (chunk: Buffer) => {
      // Docker multiplexed stream: 8-byte header + payload
      let offset = 0;
      while (offset < chunk.length) {
        if (offset + 8 > chunk.length) break;
        const streamType = chunk[offset];
        const length = chunk.readUInt32BE(offset + 4);
        offset += 8;

        if (offset + length > chunk.length) break;
        const payload = chunk.subarray(offset, offset + length).toString();
        offset += length;

        if (streamType === 1) {
          processPayload(payload);
        } else if (streamType === 2) {
          this.logger.warn(`[Task ${taskId}] [stderr] ${payload.trimEnd()}`);
        }
      }
    });

    stream.on('end', () => {
      // Process remaining buffer
      if (stdoutBuffer.trim()) {
        this.logger.log(`[Task ${taskId}] [stdout final] ${stdoutBuffer.substring(0, 300)}`);
        const events = this.parseStreamLine(stdoutBuffer, taskId);
        for (const event of events) pushEvent(event);
      }
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    stream.on('error', (err) => {
      this.logger.error(`[Task ${taskId}] Stream error: ${err.message}`);
      pushEvent({ type: 'error', message: err.message });
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    // Yield events as they arrive
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (done) {
        break;
      } else {
        // Wait for next event
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    }
  }

  private parseStreamLine(line: string, _taskId: string): CodingEvent[] {
    try {
      const parsed = JSON.parse(line);
      const events: CodingEvent[] = [];

      if (parsed.type === 'system' && parsed.subtype === 'init') {
        events.push({
          type: 'session_init',
          sessionId: parsed.session_id || _taskId,
          model: parsed.model || this.claudeModel,
        });
        return events;
      }

      if (parsed.type === 'assistant') {
        const content = parsed.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'thinking' && block.thinking) {
              events.push({ type: 'thinking', content: block.thinking });
            } else if (block.type === 'text' && block.text) {
              events.push({ type: 'text', content: block.text });
            } else if (block.type === 'tool_use') {
              events.push({
                type: 'tool_use',
                toolName: block.name,
                input: block.input ?? {},
              });
            }
          }
        }
        return events;
      }

      if (parsed.type === 'result') {
        if (parsed.subtype === 'success') {
          events.push({
            type: 'complete',
            result: parsed.result || 'Done',
            durationMs: parsed.duration_ms || 0,
            costUsd: parsed.total_cost_usd || 0,
          });
        } else {
          events.push({
            type: 'error',
            message: parsed.errors?.join('; ') || 'Unknown error',
            code: parsed.subtype,
          });
        }
        return events;
      }

      return events;
    } catch {
      if (line.trim()) {
        return [{ type: 'text', content: line }];
      }
      return [];
    }
  }
}
