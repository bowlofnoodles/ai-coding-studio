import { Module } from '@nestjs/common';
import { GitHubAdapter } from './github.adapter';
import { GitLabAdapter } from './gitlab.adapter';
import { GitProviderFactory } from './git-provider.factory';
import { GIT_PROVIDER_TOKEN } from './git-provider.interface';
import { GitProviderController } from './git-provider.controller';
import { AuthModule } from '../auth';

@Module({
  imports: [AuthModule],
  controllers: [GitProviderController],
  providers: [
    GitHubAdapter,
    GitLabAdapter,
    GitProviderFactory,
    {
      provide: GIT_PROVIDER_TOKEN,
      useExisting: GitHubAdapter,
    },
  ],
  exports: [GIT_PROVIDER_TOKEN, GitHubAdapter, GitLabAdapter, GitProviderFactory],
})
export class GitProviderModule {}
