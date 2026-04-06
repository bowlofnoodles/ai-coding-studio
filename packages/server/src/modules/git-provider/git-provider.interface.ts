export interface Repo {
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
}

export interface GitProvider {
  listRepos(): Promise<Repo[]>;
  cloneRepo(cloneUrl: string, targetDir: string): Promise<void>;
  createBranch(repoFullName: string, baseBranch: string, newBranch: string): Promise<void>;
  commitAndPush(repoDir: string, branch: string, message: string): Promise<void>;
}

export const GIT_PROVIDER_TOKEN = 'GIT_PROVIDER';
