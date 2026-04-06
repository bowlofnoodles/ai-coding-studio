# Plan 2: 后端四层 Provider 接口 + 实现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现后端四层可插拔 Provider（Git Provider、Sandbox Provider、AI Engine Provider、Deploy Provider），每层包含接口定义和至少一个具体实现。

**Architecture:** 每个 Provider 用 NestJS Module 封装，通过 Interface + Adapter 模式实现可插拔。使用 NestJS 依赖注入（自定义 provider token）切换具体实现。共享类型定义放在 shared 包中。

**Tech Stack:** NestJS, TypeORM, dockerode, @anthropic-ai/claude-agent-sdk, @octokit/rest, Socket.io

---

### Task 1: 添加 shared 包中的 Provider 相关类型

**Files:**
- Create: `packages/shared/src/types/coding-event.ts`
- Create: `packages/shared/src/types/provider-config.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: 创建 CodingEvent 统一事件类型 packages/shared/src/types/coding-event.ts**

基于 Claude Agent SDK 的 SDKMessage 类型，定义平台统一的事件协议：

```typescript
export type CodingEvent =
  | { type: 'session_init'; sessionId: string; model: string }
  | { type: 'thinking'; content: string }
  | { type: 'text'; content: string }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; output: string }
  | { type: 'complete'; result: string; durationMs: number; costUsd: number }
  | { type: 'error'; message: string; code?: string };
```

- [ ] **Step 2: 创建 Provider 配置类型 packages/shared/src/types/provider-config.ts**

```typescript
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
```

- [ ] **Step 3: 更新 packages/shared/src/types/index.ts**

```typescript
export type { User, CreateUserDto, UpdateUserDto, GitPlatform } from './user';
export type { Task, TaskMessage, CreateTaskDto } from './task';
export type { CodingEvent } from './coding-event';
export type {
  GitProviderConfig,
  SandboxConfig,
  DeployConfig,
  DeployResult,
  DeployStatus,
} from './provider-config';
```

- [ ] **Step 4: 构建验证**

Run: `cd packages/shared && pnpm build`
Expected: 无编译错误

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add CodingEvent and provider config types"
```

---

### Task 2: Git Provider 接口 + GitHub Adapter

**Files:**
- Create: `packages/server/src/modules/git-provider/git-provider.interface.ts`
- Create: `packages/server/src/modules/git-provider/github.adapter.ts`
- Create: `packages/server/src/modules/git-provider/git-provider.module.ts`
- Create: `packages/server/src/modules/git-provider/index.ts`

- [ ] **Step 1: 安装 @octokit/rest 依赖**

Run: `cd packages/server && pnpm add @octokit/rest`

- [ ] **Step 2: 创建 Git Provider 接口 packages/server/src/modules/git-provider/git-provider.interface.ts**

```typescript
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
```

- [ ] **Step 3: 创建 GitHub Adapter packages/server/src/modules/git-provider/github.adapter.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import { GitProvider, Repo } from './git-provider.interface';

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
```

- [ ] **Step 4: 创建 Git Provider Module packages/server/src/modules/git-provider/git-provider.module.ts**

```typescript
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
```

- [ ] **Step 5: 创建 packages/server/src/modules/git-provider/index.ts**

```typescript
export { GitProviderModule } from './git-provider.module';
export { GIT_PROVIDER_TOKEN } from './git-provider.interface';
export type { GitProvider, Repo } from './git-provider.interface';
export { GitHubAdapter } from './github.adapter';
```

- [ ] **Step 6: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/modules/git-provider/
git commit -m "feat(server): add Git Provider interface and GitHub adapter"
```

---

### Task 3: Sandbox Provider 接口 + Docker Adapter

**Files:**
- Create: `packages/server/src/modules/sandbox/sandbox.interface.ts`
- Create: `packages/server/src/modules/sandbox/docker.adapter.ts`
- Create: `packages/server/src/modules/sandbox/sandbox.module.ts`
- Create: `packages/server/src/modules/sandbox/index.ts`

- [ ] **Step 1: 安装 dockerode 及类型**

Run: `cd packages/server && pnpm add dockerode && pnpm add -D @types/dockerode`

- [ ] **Step 2: 创建 Sandbox 接口 packages/server/src/modules/sandbox/sandbox.interface.ts**

```typescript
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
```

- [ ] **Step 3: 创建 Docker Adapter packages/server/src/modules/sandbox/docker.adapter.ts**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { SandboxProvider, Sandbox, ExecResult } from './sandbox.interface';

const DEFAULT_IMAGE = 'ai-coding-studio-sandbox:latest';
const DEFAULT_TIMEOUT = 600_000; // 10 minutes

@Injectable()
export class DockerAdapter implements SandboxProvider {
  private readonly logger = new Logger(DockerAdapter.name);
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async create(config: {
    image?: string;
    timeout?: number;
  }): Promise<Sandbox> {
    const image = config.image ?? DEFAULT_IMAGE;
    const workDir = '/workspace';

    const container = await this.docker.createContainer({
      Image: image,
      Cmd: ['sleep', String((config.timeout ?? DEFAULT_TIMEOUT) / 1000)],
      WorkingDir: workDir,
      HostConfig: {
        Memory: 2 * 1024 * 1024 * 1024, // 2GB
        CpuPeriod: 100_000,
        CpuQuota: 200_000, // 2 CPU cores
        NetworkMode: 'bridge',
      },
    });

    await container.start();
    this.logger.log(`Sandbox created: ${container.id.substring(0, 12)}`);

    return {
      id: container.id,
      workDir,
    };
  }

  async exec(sandbox: Sandbox, command: string): Promise<ExecResult> {
    const container = this.docker.getContainer(sandbox.id);

    const exec = await container.exec({
      Cmd: ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: sandbox.workDir,
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    const output = await this.collectOutput(stream);

    const inspect = await exec.inspect();

    return {
      exitCode: inspect.ExitCode ?? 1,
      stdout: output.stdout,
      stderr: output.stderr,
    };
  }

  async copyTo(
    sandbox: Sandbox,
    localPath: string,
    containerPath: string,
  ): Promise<void> {
    const container = this.docker.getContainer(sandbox.id);
    const fs = await import('fs');
    const tar = await import('stream');

    // Use docker cp via exec as a simpler approach
    await this.exec(sandbox, `mkdir -p ${containerPath}`);

    // Use put archive
    const pack = await import('child_process');
    pack.execSync(
      `docker cp ${localPath}/. ${sandbox.id}:${containerPath}`,
      { stdio: 'pipe' },
    );
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    const container = this.docker.getContainer(sandbox.id);
    try {
      await container.stop({ t: 5 });
    } catch {
      // container might already be stopped
    }
    await container.remove({ force: true });
    this.logger.log(`Sandbox destroyed: ${sandbox.id.substring(0, 12)}`);
  }

  private collectOutput(
    stream: NodeJS.ReadableStream,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      // Docker multiplexed stream: first 8 bytes are header
      // byte 0: stream type (1=stdout, 2=stderr)
      // bytes 4-7: payload length (big-endian)
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let offset = 0;

        while (offset < buffer.length) {
          if (offset + 8 > buffer.length) break;
          const streamType = buffer[offset];
          const length = buffer.readUInt32BE(offset + 4);
          offset += 8;

          if (offset + length > buffer.length) break;
          const payload = buffer.subarray(offset, offset + length).toString();
          if (streamType === 1) stdout += payload;
          else if (streamType === 2) stderr += payload;
          offset += length;
        }

        resolve({ stdout, stderr });
      });
      stream.on('error', reject);
    });
  }
}
```

- [ ] **Step 4: 创建 Sandbox Module packages/server/src/modules/sandbox/sandbox.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { DockerAdapter } from './docker.adapter';
import { SANDBOX_PROVIDER_TOKEN } from './sandbox.interface';

@Module({
  providers: [
    DockerAdapter,
    {
      provide: SANDBOX_PROVIDER_TOKEN,
      useExisting: DockerAdapter,
    },
  ],
  exports: [SANDBOX_PROVIDER_TOKEN, DockerAdapter],
})
export class SandboxModule {}
```

- [ ] **Step 5: 创建 packages/server/src/modules/sandbox/index.ts**

```typescript
export { SandboxModule } from './sandbox.module';
export { SANDBOX_PROVIDER_TOKEN } from './sandbox.interface';
export type { SandboxProvider, Sandbox, ExecResult } from './sandbox.interface';
export { DockerAdapter } from './docker.adapter';
```

- [ ] **Step 6: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/modules/sandbox/
git commit -m "feat(server): add Sandbox Provider interface and Docker adapter"
```

---

### Task 4: AI Engine Provider 接口 + Claude Code Adapter

**Files:**
- Create: `packages/server/src/modules/engine/engine.interface.ts`
- Create: `packages/server/src/modules/engine/claude-code.adapter.ts`
- Create: `packages/server/src/modules/engine/engine.module.ts`
- Create: `packages/server/src/modules/engine/index.ts`

- [ ] **Step 1: 安装 Claude Agent SDK**

Run: `cd packages/server && pnpm add @anthropic-ai/claude-agent-sdk`

- [ ] **Step 2: 创建 Engine 接口 packages/server/src/modules/engine/engine.interface.ts**

```typescript
import { CodingEvent } from '@ai-coding-studio/shared';

export interface CodingTask {
  taskId: string;
  prompt: string;
  workDir: string;
  apiKey: string;
}

export interface AIEngineProvider {
  execute(task: CodingTask): AsyncIterable<CodingEvent>;
  abort(taskId: string): Promise<void>;
}

export const AI_ENGINE_PROVIDER_TOKEN = 'AI_ENGINE_PROVIDER';
```

- [ ] **Step 3: 创建 Claude Code Adapter packages/server/src/modules/engine/claude-code.adapter.ts**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { CodingEvent } from '@ai-coding-studio/shared';
import { AIEngineProvider, CodingTask } from './engine.interface';

@Injectable()
export class ClaudeCodeAdapter implements AIEngineProvider {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  private abortControllers = new Map<string, AbortController>();

  async *execute(task: CodingTask): AsyncIterable<CodingEvent> {
    const abortController = new AbortController();
    this.abortControllers.set(task.taskId, abortController);

    try {
      const stream = query({
        prompt: task.prompt,
        options: {
          cwd: task.workDir,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          abortController,
          env: {
            ANTHROPIC_API_KEY: task.apiKey,
            ...process.env,
          },
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: 'Complete the task efficiently. Commit your changes when done.',
          },
        },
      });

      for await (const message of stream) {
        const events = this.mapMessage(message);
        for (const event of events) {
          yield event;
        }
      }
    } finally {
      this.abortControllers.delete(task.taskId);
    }
  }

  async abort(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
      this.logger.log(`Task aborted: ${taskId}`);
    }
  }

  private mapMessage(message: SDKMessage): CodingEvent[] {
    const events: CodingEvent[] = [];

    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          events.push({
            type: 'session_init',
            sessionId: message.session_id,
            model: message.model,
          });
        }
        break;

      case 'assistant':
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'thinking') {
              events.push({
                type: 'thinking',
                content: block.thinking,
              });
            } else if (block.type === 'text') {
              events.push({
                type: 'text',
                content: block.text,
              });
            } else if (block.type === 'tool_use') {
              events.push({
                type: 'tool_use',
                toolName: block.name,
                input: block.input as Record<string, unknown>,
              });
            }
          }
        }
        break;

      case 'result':
        if (message.subtype === 'success') {
          events.push({
            type: 'complete',
            result: message.result,
            durationMs: message.duration_ms,
            costUsd: message.total_cost_usd,
          });
        } else {
          events.push({
            type: 'error',
            message: message.errors?.join('; ') ?? 'Unknown error',
            code: message.subtype,
          });
        }
        break;
    }

    return events;
  }
}
```

- [ ] **Step 4: 创建 Engine Module packages/server/src/modules/engine/engine.module.ts**

```typescript
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
```

- [ ] **Step 5: 创建 packages/server/src/modules/engine/index.ts**

```typescript
export { EngineModule } from './engine.module';
export { AI_ENGINE_PROVIDER_TOKEN } from './engine.interface';
export type { AIEngineProvider, CodingTask } from './engine.interface';
export { ClaudeCodeAdapter } from './claude-code.adapter';
```

- [ ] **Step 6: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/modules/engine/
git commit -m "feat(server): add AI Engine Provider interface and Claude Code adapter"
```

---

### Task 5: Deploy Provider 接口 + CICD Adapter + CLI Adapter

**Files:**
- Create: `packages/server/src/modules/deploy/deploy.interface.ts`
- Create: `packages/server/src/modules/deploy/cicd.adapter.ts`
- Create: `packages/server/src/modules/deploy/cli.adapter.ts`
- Create: `packages/server/src/modules/deploy/deploy.module.ts`
- Create: `packages/server/src/modules/deploy/index.ts`

- [ ] **Step 1: 创建 Deploy 接口 packages/server/src/modules/deploy/deploy.interface.ts**

```typescript
import { DeployResult, DeployStatus } from '@ai-coding-studio/shared';

export interface DeployProvider {
  deploy(config: {
    repoFullName: string;
    branch: string;
    previewUrlTemplate: string;
  }): Promise<DeployResult>;
  getStatus(deployId: string): Promise<DeployStatus>;
  retry(deployId: string): Promise<DeployResult>;
}

export const DEPLOY_PROVIDER_TOKEN = 'DEPLOY_PROVIDER';
```

- [ ] **Step 2: 创建 CICD Adapter packages/server/src/modules/deploy/cicd.adapter.ts**

该 adapter 通过 GitHub Actions API 触发 workflow 并轮询状态。

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { DeployResult, DeployStatus } from '@ai-coding-studio/shared';
import { DeployProvider } from './deploy.interface';

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5_000;

@Injectable()
export class CICDAdapter implements DeployProvider {
  private readonly logger = new Logger(CICDAdapter.name);
  private octokit: Octokit;
  private deployRuns = new Map<string, { owner: string; repo: string; runId: number }>();

  constructor() {
    this.octokit = new Octokit();
  }

  configure(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async deploy(config: {
    repoFullName: string;
    branch: string;
    previewUrlTemplate: string;
  }): Promise<DeployResult> {
    const [owner, repo] = config.repoFullName.split('/');
    const deployId = `deploy-${Date.now()}`;

    // Find the latest workflow run triggered by the push
    const status = await this.waitForRun(owner, repo, config.branch, deployId);

    const previewUrl = config.previewUrlTemplate.replace(
      '{branch}',
      config.branch,
    );

    return {
      deployId,
      status: status === 'success' ? 'success' : 'failed',
      previewUrl: status === 'success' ? previewUrl : null,
      logs: status === 'success' ? null : `Deploy ${status}`,
    };
  }

  async getStatus(deployId: string): Promise<DeployStatus> {
    const run = this.deployRuns.get(deployId);
    if (!run) return 'failed';

    const { data } = await this.octokit.actions.getWorkflowRun({
      owner: run.owner,
      repo: run.repo,
      run_id: run.runId,
    });

    switch (data.status) {
      case 'queued':
      case 'in_progress':
      case 'waiting':
        return 'running';
      case 'completed':
        return data.conclusion === 'success' ? 'success' : 'failed';
      default:
        return 'pending';
    }
  }

  async retry(deployId: string): Promise<DeployResult> {
    const run = this.deployRuns.get(deployId);
    if (!run) {
      return {
        deployId,
        status: 'failed',
        previewUrl: null,
        logs: 'No previous deploy run found',
      };
    }

    await this.octokit.actions.reRunWorkflow({
      owner: run.owner,
      repo: run.repo,
      run_id: run.runId,
    });

    const status = await this.pollRunStatus(run.owner, run.repo, run.runId);

    return {
      deployId,
      status: status === 'success' ? 'success' : 'failed',
      previewUrl: null,
      logs: status === 'success' ? null : `Retry ${status}`,
    };
  }

  private async waitForRun(
    owner: string,
    repo: string,
    branch: string,
    deployId: string,
  ): Promise<string> {
    // Wait for a workflow run to appear for this branch
    let runId: number | null = null;

    for (let i = 0; i < 12; i++) {
      await this.sleep(5_000);

      const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        per_page: 1,
        event: 'push',
      });

      if (data.workflow_runs.length > 0) {
        const run = data.workflow_runs[0];
        // Only use runs created in the last 2 minutes
        const createdAt = new Date(run.created_at).getTime();
        if (Date.now() - createdAt < 120_000) {
          runId = run.id;
          break;
        }
      }
    }

    if (runId === null) {
      return 'failed';
    }

    this.deployRuns.set(deployId, { owner, repo, runId });
    return this.pollRunStatus(owner, repo, runId);
  }

  private async pollRunStatus(
    owner: string,
    repo: string,
    runId: number,
  ): Promise<string> {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      const { data } = await this.octokit.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });

      if (data.status === 'completed') {
        return data.conclusion ?? 'failed';
      }

      await this.sleep(POLL_INTERVAL_MS);
    }

    return 'failed';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 3: 创建 CLI Adapter packages/server/src/modules/deploy/cli.adapter.ts**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { DeployResult, DeployStatus } from '@ai-coding-studio/shared';
import { DeployProvider } from './deploy.interface';

@Injectable()
export class CLIAdapter implements DeployProvider {
  private readonly logger = new Logger(CLIAdapter.name);
  private deployStatuses = new Map<string, DeployStatus>();
  private deployConfigs = new Map<
    string,
    { command: string; branch: string; previewUrlTemplate: string }
  >();

  async deploy(config: {
    repoFullName: string;
    branch: string;
    previewUrlTemplate: string;
    cliCommand?: string;
  }): Promise<DeployResult> {
    const deployId = `cli-deploy-${Date.now()}`;
    const command = config.cliCommand ?? `deploy-cli deploy --branch ${config.branch}`;

    this.deployConfigs.set(deployId, {
      command,
      branch: config.branch,
      previewUrlTemplate: config.previewUrlTemplate,
    });

    try {
      this.deployStatuses.set(deployId, 'running');

      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 300_000, // 5 minutes
        stdio: 'pipe',
      });

      this.deployStatuses.set(deployId, 'success');

      const previewUrl = config.previewUrlTemplate.replace(
        '{branch}',
        config.branch,
      );

      this.logger.log(`CLI deploy succeeded: ${deployId}`);

      return {
        deployId,
        status: 'success',
        previewUrl,
        logs: output,
      };
    } catch (error) {
      this.deployStatuses.set(deployId, 'failed');
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`CLI deploy failed: ${message}`);

      return {
        deployId,
        status: 'failed',
        previewUrl: null,
        logs: message,
      };
    }
  }

  async getStatus(deployId: string): Promise<DeployStatus> {
    return this.deployStatuses.get(deployId) ?? 'failed';
  }

  async retry(deployId: string): Promise<DeployResult> {
    const config = this.deployConfigs.get(deployId);
    if (!config) {
      return {
        deployId,
        status: 'failed',
        previewUrl: null,
        logs: 'No previous deploy config found',
      };
    }

    return this.deploy({
      repoFullName: '',
      branch: config.branch,
      previewUrlTemplate: config.previewUrlTemplate,
      cliCommand: config.command,
    });
  }
}
```

- [ ] **Step 4: 创建 Deploy Module packages/server/src/modules/deploy/deploy.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { CICDAdapter } from './cicd.adapter';
import { CLIAdapter } from './cli.adapter';
import { DEPLOY_PROVIDER_TOKEN } from './deploy.interface';

@Module({
  providers: [
    CICDAdapter,
    CLIAdapter,
    {
      provide: DEPLOY_PROVIDER_TOKEN,
      useExisting: CICDAdapter,
    },
  ],
  exports: [DEPLOY_PROVIDER_TOKEN, CICDAdapter, CLIAdapter],
})
export class DeployModule {}
```

- [ ] **Step 5: 创建 packages/server/src/modules/deploy/index.ts**

```typescript
export { DeployModule } from './deploy.module';
export { DEPLOY_PROVIDER_TOKEN } from './deploy.interface';
export type { DeployProvider } from './deploy.interface';
export { CICDAdapter } from './cicd.adapter';
export { CLIAdapter } from './cli.adapter';
```

- [ ] **Step 6: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/modules/deploy/
git commit -m "feat(server): add Deploy Provider interface with CICD and CLI adapters"
```

---

### Task 6: 注册所有 Provider Module 到 AppModule

**Files:**
- Modify: `packages/server/src/app.module.ts`

- [ ] **Step 1: 更新 app.module.ts 导入所有 Provider Module**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GitProviderModule } from './modules/git-provider';
import { SandboxModule } from './modules/sandbox';
import { EngineModule } from './modules/engine';
import { DeployModule } from './modules/deploy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', 'root'),
        database: configService.get<string>('DB_DATABASE', 'ai_coding_studio'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
    GitProviderModule,
    SandboxModule,
    EngineModule,
    DeployModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/app.module.ts
git commit -m "feat(server): register all provider modules in AppModule"
```
