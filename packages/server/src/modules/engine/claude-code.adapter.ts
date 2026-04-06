import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { CodingEvent } from '@ai-coding-studio/shared';
import { AIEngineProvider, CodingTask } from './engine.interface';

@Injectable()
export class ClaudeCodeAdapter implements AIEngineProvider {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  private abortControllers = new Map<string, AbortController>();

  async *execute(task: CodingTask): AsyncIterable<CodingEvent> {
    const abortController = new AbortController();
    this.abortControllers.set(task.taskId, abortController);

    try {
      const stream = query({
        prompt: task.prompt,
        options: {
          cwd: task.workDir,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          abortController,
          env: {
            ANTHROPIC_API_KEY: task.apiKey,
            ...process.env,
          },
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: 'Complete the task efficiently. Commit your changes when done.',
          },
        },
      });

      for await (const message of stream) {
        const events = this.mapMessage(message);
        for (const event of events) {
          yield event;
        }
      }
    } finally {
      this.abortControllers.delete(task.taskId);
    }
  }

  async abort(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
      this.logger.log(`Task aborted: ${taskId}`);
    }
  }

  private mapMessage(message: SDKMessage): CodingEvent[] {
    const events: CodingEvent[] = [];

    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          events.push({
            type: 'session_init',
            sessionId: message.session_id,
            model: message.model,
          });
        }
        break;

      case 'assistant':
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'thinking') {
              events.push({
                type: 'thinking',
                content: block.thinking,
              });
            } else if (block.type === 'text') {
              events.push({
                type: 'text',
                content: block.text,
              });
            } else if (block.type === 'tool_use') {
              events.push({
                type: 'tool_use',
                toolName: block.name,
                input: block.input as Record<string, unknown>,
              });
            }
          }
        }
        break;

      case 'result':
        if (message.subtype === 'success') {
          events.push({
            type: 'complete',
            result: message.result,
            durationMs: message.duration_ms,
            costUsd: message.total_cost_usd,
          });
        } else {
          events.push({
            type: 'error',
            message: message.errors?.join('; ') ?? 'Unknown error',
            code: message.subtype,
          });
        }
        break;
    }

    return events;
  }
}
