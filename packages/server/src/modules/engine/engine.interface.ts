import { CodingEvent } from '@ai-coding-studio/shared';
import { Sandbox } from '../sandbox/sandbox.interface';

export interface CodingTask {
  taskId: string;
  prompt: string;
  sandbox: Sandbox;
}

export interface AIEngineProvider {
  execute(task: CodingTask): AsyncIterable<CodingEvent>;
  abort(taskId: string): Promise<void>;
}

export const AI_ENGINE_PROVIDER_TOKEN = 'AI_ENGINE_PROVIDER';
