export interface Sandbox {
  id: string;
  workDir: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxProvider {
  create(config: { image?: string; timeout?: number }): Promise<Sandbox>;
  exec(sandbox: Sandbox, command: string): Promise<ExecResult>;
  copyTo(sandbox: Sandbox, localPath: string, containerPath: string): Promise<void>;
  destroy(sandbox: Sandbox): Promise<void>;
}

export const SANDBOX_PROVIDER_TOKEN = 'SANDBOX_PROVIDER';
