export interface GitProviderConfig {
  platform: 'gitlab' | 'github';
  token: string;
  baseUrl?: string;
}

export interface SandboxConfig {
  type: 'docker' | 'internal';
  image?: string;
  timeout?: number;
}

export interface DeployConfig {
  type: 'cicd' | 'cli';
  repoUrl: string;
  branch: string;
  previewUrlTemplate: string;
  cliCommand?: string;
}

export interface DeployResult {
  deployId: string;
  status: 'success' | 'failed';
  previewUrl: string | null;
  logs: string | null;
}

export type DeployStatus = 'pending' | 'running' | 'success' | 'failed';
