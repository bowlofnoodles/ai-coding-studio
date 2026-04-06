export interface Repo {
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
}

export interface Branch {
  name: string;
  isDefault: boolean;
}

export interface GitProvider {
  listRepos(): Promise<Repo[]>;
  listBranches(repoFullName: string): Promise<Branch[]>;
  cloneRepo(cloneUrl: string, targetDir: string): Promise<void>;
  createBranch(repoFullName: string, baseBranch: string, newBranch: string): Promise<void>;
  commitAndPush(repoDir: string, branch: string, message: string): Promise<void>;
}

export const GIT_PROVIDER_TOKEN = 'GIT_PROVIDER';
