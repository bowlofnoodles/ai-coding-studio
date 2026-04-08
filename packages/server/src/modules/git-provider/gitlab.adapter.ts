import { Injectable } from '@nestjs/common';
import { Gitlab } from '@gitbeaker/rest';
import { execSync } from 'child_process';
import { GitProvider, Repo, Branch } from './git-provider.interface';

@Injectable()
export class GitLabAdapter implements GitProvider {
  private client: InstanceType<typeof Gitlab>;
  private token: string;
  private host: string;

  constructor() {
    this.token = '';
    this.host = 'https://gitlab.com';
    this.client = new Gitlab({ token: this.token, host: this.host });
  }

  configure(token: string, host?: string) {
    this.token = token;
    if (host) {
      this.host = host;
    }
    this.client = new Gitlab({ token: this.token, host: this.host });
  }

  async listRepos(): Promise<Repo[]> {
    const projects = await this.client.Projects.all({
      membership: true,
      orderBy: 'updated_at',
      sort: 'desc',
      perPage: 100,
    });

    return projects.map((project) => ({
      id: String(project.id),
      name: project.name,
      fullName: String(project.path_with_namespace),
      cloneUrl: String(project.http_url_to_repo),
      defaultBranch: String(project.default_branch ?? 'main'),
    }));
  }

  async listBranches(repoFullName: string): Promise<Branch[]> {
    const project = await this.client.Projects.show(repoFullName);
    const defaultBranch = String(project.default_branch ?? 'main');

    const branches = await this.client.Branches.all(repoFullName, {
      perPage: 100,
    });

    return branches.map((branch) => ({
      name: branch.name,
      isDefault: branch.name === defaultBranch,
    }));
  }

  async cloneRepo(cloneUrl: string, targetDir: string): Promise<void> {
    const authedUrl = cloneUrl.replace(
      'https://',
      `https://oauth2:${this.token}@`,
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
    await this.client.Branches.create(repoFullName, newBranch, baseBranch);
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
