import { Module } from '@nestjs/common';
import { GitHubAdapter } from './github.adapter';
import { GIT_PROVIDER_TOKEN } from './git-provider.interface';

@Module({
  providers: [
    GitHubAdapter,
    {
      provide: GIT_PROVIDER_TOKEN,
      useExisting: GitHubAdapter,
    },
  ],
  exports: [GIT_PROVIDER_TOKEN, GitHubAdapter],
})
export class GitProviderModule {}
