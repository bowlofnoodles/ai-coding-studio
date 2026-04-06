import { Module } from '@nestjs/common';
import { ClaudeCodeAdapter } from './claude-code.adapter';
import { AI_ENGINE_PROVIDER_TOKEN } from './engine.interface';

@Module({
  providers: [
    ClaudeCodeAdapter,
    {
      provide: AI_ENGINE_PROVIDER_TOKEN,
      useExisting: ClaudeCodeAdapter,
    },
  ],
  exports: [AI_ENGINE_PROVIDER_TOKEN, ClaudeCodeAdapter],
})
export class EngineModule {}
