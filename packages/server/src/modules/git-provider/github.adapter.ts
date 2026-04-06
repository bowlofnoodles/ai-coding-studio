import { Injectable } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import { GitProvider, Repo, Branch } from './git-provider.interface';

@Injectable()
export class GitHubAdapter implements GitProvider {
  private octokit: Octokit;
  private token: string;

  constructor() {
    this.token = '';
    this.octokit = new Octokit();
  }

  configure(token: string) {
    this.token = token;
    this.octokit = new Octokit({ auth: token });
  }

  async listRepos(): Promise<Repo[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });

    return data.map((repo) => ({
      id: String(repo.id),
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url ?? '',
      defaultBranch: repo.default_branch ?? 'main',
    }));
  }

  async listBranches(repoFullName: string): Promise<Branch[]> {
    const [owner, repo] = repoFullName.split('/');
    const { data: repoData } = await this.octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    const { data } = await this.octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });

    return data.map((branch) => ({
      name: branch.name,
      isDefault: branch.name === defaultBranch,
    }));
  }

  async cloneRepo(cloneUrl: string, targetDir: string): Promise<void> {
    const authedUrl = cloneUrl.replace(
      'https://',
      `https://x-access-token:${this.token}@`,
    );
    execSync(`git clone --depth 1 ${authedUrl} ${targetDir}`, {
      stdio: 'pipe',
    });
  }

  async createBranch(
    repoFullName: string,
    baseBranch: string,
    newBranch: string,
  ): Promise<void> {
    const [owner, repo] = repoFullName.split('/');
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranch}`,
      sha: ref.object.sha,
    });
  }

  async commitAndPush(
    repoDir: string,
    branch: string,
    message: string,
  ): Promise<void> {
    const commands = [
      `cd ${repoDir}`,
      'git add -A',
      `git commit -m "${message}" --allow-empty`,
      `git push origin ${branch}`,
    ].join(' && ');

    execSync(commands, { stdio: 'pipe' });
  }
}
