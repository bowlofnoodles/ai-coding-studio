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
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const socketPath = this.configService.get<string>('DOCKER_SOCKET', '');
    this.docker = socketPath ? new Docker({ socketPath }) : new Docker();
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY', '');
  }

  async *execute(task: CodingTask): AsyncIterable<CodingEvent> {
    if (!this.apiKey) {
      yield {
        type: 'error',
        message: 'ANTHROPIC_API_KEY not configured in server .env',
      };
      return;
    }

    this.activeExecs.set(task.taskId, { containerId: task.sandbox.id });

    try {
      yield {
        type: 'session_init',
        sessionId: task.taskId,
        model: 'claude-code',
      };

      const container = this.docker.getContainer(task.sandbox.id);

      // Run claude CLI in --print mode (non-interactive, JSON output)
      const exec = await container.exec({
        Cmd: [
          'claude',
          '--print',
          '--output-format', 'json',
          '--max-turns', '50',
          task.prompt,
        ],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: task.sandbox.workDir,
        Env: [`ANTHROPIC_API_KEY=${this.apiKey}`],
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
