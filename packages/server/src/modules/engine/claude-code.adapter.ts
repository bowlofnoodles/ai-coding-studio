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

    // Build env vars for Claude Code inside the container
    // Supports both direct Anthropic API and MiniMax proxy
    this.claudeEnv = [];
    this.claudeModel = '';

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY', '');
    const authToken = this.configService.get<string>('ANTHROPIC_AUTH_TOKEN', '');
    const baseUrl = this.configService.get<string>('ANTHROPIC_BASE_URL', '');
    const model = this.configService.get<string>('ANTHROPIC_MODEL', '');

    if (authToken) {
      // MiniMax proxy mode
      this.claudeEnv.push(`ANTHROPIC_AUTH_TOKEN=${authToken}`);
    } else if (apiKey) {
      // Direct Anthropic API mode
      this.claudeEnv.push(`ANTHROPIC_API_KEY=${apiKey}`);
    }

    if (baseUrl) {
      this.claudeEnv.push(`ANTHROPIC_BASE_URL=${baseUrl}`);
    }
    if (model) {
      this.claudeModel = model;
      this.claudeEnv.push(`ANTHROPIC_MODEL=${model}`);
      this.claudeEnv.push(`ANTHROPIC_SMALL_FAST_MODEL=${model}`);
    }

    // Disable non-essential traffic (recommended for proxy usage)
    const disableTraffic = this.configService.get<string>('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '');
    if (disableTraffic) {
      this.claudeEnv.push(`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=${disableTraffic}`);
    }

    // API timeout
    const timeout = this.configService.get<string>('API_TIMEOUT_MS', '');
    if (timeout) {
      this.claudeEnv.push(`API_TIMEOUT_MS=${timeout}`);
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

      // Build claude CLI command
      const cmd = [
        'claude',
        '--print',
        '--output-format', 'json',
        '--max-turns', '50',
      ];
      if (this.claudeModel) {
        cmd.push('--model', this.claudeModel);
      }
      cmd.push(task.prompt);

      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: task.sandbox.workDir,
        Env: this.claudeEnv,
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      yield { type: 'thinking', content: '正在执行 AI 编码任务...' };

      // Collect output from the container
      const output = await this.collectOutput(stream);

      if (output.stderr) {
        this.logger.warn(`Claude Code stderr: ${output.stderr}`);
      }

      // Try to parse JSON output
      const lines = output.stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          // Claude --print --output-format json outputs result objects
          if (parsed.type === 'result') {
            yield {
              type: 'text',
              content: parsed.result || parsed.content || line,
            };
          } else if (parsed.role === 'assistant') {
            // Handle assistant messages
            const content = Array.isArray(parsed.content)
              ? parsed.content
                  .map((b: { type: string; text?: string }) =>
                    b.type === 'text' ? b.text : '',
                  )
                  .filter(Boolean)
                  .join('\n')
              : String(parsed.content || '');
            if (content) {
              yield { type: 'text', content };
            }
          } else {
            yield { type: 'text', content: line };
          }
        } catch {
          // Not JSON, treat as plain text
          if (line.trim()) {
            yield { type: 'text', content: line };
          }
        }
      }

      const inspect = await exec.inspect();
      if (inspect.ExitCode !== 0) {
        yield {
          type: 'error',
          message: `Claude Code exited with code ${inspect.ExitCode}: ${output.stderr || output.stdout}`,
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
    } finally {
      this.activeExecs.delete(task.taskId);
    }
  }

  async abort(taskId: string): Promise<void> {
    const active = this.activeExecs.get(taskId);
    if (active) {
      // Kill any running claude process in the container
      const container = this.docker.getContainer(active.containerId);
      try {
        await container.exec({
          Cmd: ['pkill', '-f', 'claude'],
          AttachStdout: false,
          AttachStderr: false,
        });
      } catch {
        // container might be gone
      }
      this.activeExecs.delete(taskId);
      this.logger.log(`Task aborted: ${taskId}`);
    }
  }

  private collectOutput(
    stream: NodeJS.ReadableStream,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let stdout = '';
        let stderr = '';
        let offset = 0;

        while (offset < buffer.length) {
          if (offset + 8 > buffer.length) break;
          const streamType = buffer[offset];
          const length = buffer.readUInt32BE(offset + 4);
          offset += 8;

          if (offset + length > buffer.length) break;
          const payload = buffer.subarray(offset, offset + length).toString();
          if (streamType === 1) stdout += payload;
          else if (streamType === 2) stderr += payload;
          offset += length;
        }

        resolve({ stdout, stderr });
      });
      stream.on('error', reject);
    });
  }
}
