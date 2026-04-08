import { Injectable } from '@nestjs/common';
import { GitHubAdapter } from './github.adapter';
import { GitLabAdapter } from './gitlab.adapter';
import { GitProvider } from './git-provider.interface';

@Injectable()
export class GitProviderFactory {
  constructor(
    private readonly githubAdapter: GitHubAdapter,
    private readonly gitlabAdapter: GitLabAdapter,
  ) {}

  create(platform: string, token: string, host?: string): GitProvider {
    if (platform === 'gitlab') {
      this.gitlabAdapter.configure(token, host);
      return this.gitlabAdapter;
    }

    this.githubAdapter.configure(token);
    return this.githubAdapter;
  }
}
