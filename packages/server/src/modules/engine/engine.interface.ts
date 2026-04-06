import { CodingEvent } from '@ai-coding-studio/shared';

export interface CodingTask {
  taskId: string;
  prompt: string;
  workDir: string;
  apiKey: string;
}

export interface AIEngineProvider {
  execute(task: CodingTask): AsyncIterable<CodingEvent>;
  abort(taskId: string): Promise<void>;
}

export const AI_ENGINE_PROVIDER_TOKEN = 'AI_ENGINE_PROVIDER';
