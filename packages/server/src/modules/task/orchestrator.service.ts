import { Injectable, Inject, Logger } from '@nestjs/common';
import { TaskStatus } from '@ai-coding-studio/shared';
import { TaskService } from './task.service';
import { StreamGateway } from '../stream';
import { GIT_PROVIDER_TOKEN, GitHubAdapter } from '../git-provider';
import {
  SANDBOX_PROVIDER_TOKEN,
  SandboxProvider,
  Sandbox,
} from '../sandbox';
import { AI_ENGINE_PROVIDER_TOKEN, AIEngineProvider } from '../engine';
import {
  DEPLOY_PROVIDER_TOKEN,
  DeployProvider,
} from '../deploy';
import { AuthService } from '../auth';

const MAX_DEPLOY_RETRIES = 2;

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly authService: AuthService,
    private readonly streamGateway: StreamGateway,
    @Inject(GIT_PROVIDER_TOKEN)
    private readonly gitProvider: GitHubAdapter,
    @Inject(SANDBOX_PROVIDER_TOKEN)
    private readonly sandboxProvider: SandboxProvider,
    @Inject(AI_ENGINE_PROVIDER_TOKEN)
    private readonly engineProvider: AIEngineProvider,
    @Inject(DEPLOY_PROVIDER_TOKEN)
    private readonly deployProvider: DeployProvider,
  ) {}

  async createAndExecuteTask(params: {
    userId: number;
    repoUrl: string;
    repoFullName: string;
    branchName: string;
    baseBranch: string;
    prompt: string;
    previewUrlTemplate: string;
    apiKey: string;
  }): Promise<number> {
    const task = await this.taskService.create({
      userId: params.userId,
      repoUrl: params.repoUrl,
      branchName: params.branchName,
      baseBranch: params.baseBranch,
      prompt: params.prompt,
    });

    await this.taskService.addMessage({
      taskId: task.id,
      role: 'user',
      content: params.prompt,
    });

    // Fire and forget — execute async, errors are pushed via WebSocket
    this.runTask(task.id, params).catch((error) => {
      this.logger.error(`Task ${task.id} uncaught error: ${error}`);
    });

    return task.id;
  }

  private async runTask(
    taskId: number,
    params: {
      userId: number;
      repoUrl: string;
      repoFullName: string;
      branchName: string;
      baseBranch: string;
      prompt: string;
      previewUrlTemplate: string;
      apiKey: string;
    },
  ): Promise<void> {
    // Wait briefly for the client to subscribe to the WebSocket room
    await new Promise((resolve) => setTimeout(resolve, 500));

    let sandbox: Sandbox | null = null;

    try {
      // 1. Setup
      this.logger.log(`[Task ${taskId}] Starting — repo: ${params.repoFullName}, branch: ${params.branchName}`);

      const user = await this.authService.findById(params.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 2. Create sandbox
      await this.taskService.updateStatus(taskId, TaskStatus.SANDBOX_READY);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.SANDBOX_READY);

      sandbox = await this.sandboxProvider.create({});
      this.logger.log(`[Task ${taskId}] Sandbox created: ${sandbox.id.substring(0, 12)}`);

      // 3. Clone repo into sandbox
      this.logger.log(`[Task ${taskId}] Cloning repo into sandbox...`);

      const authedUrl = params.repoUrl.replace(
        'https://',
        `https://x-access-token:${user.gitToken}@`,
      );

      const cloneResult = await this.sandboxProvider.exec(
        sandbox,
        `git clone ${authedUrl} . 2>&1`,
      );
      this.logger.log(`[Task ${taskId}] Clone result (exit ${cloneResult.exitCode}): ${cloneResult.stdout.substring(0, 200)}`);

      // Configure git user for commits
      await this.sandboxProvider.exec(
        sandbox,
        'git config user.email "ai-coding-studio@bot" && git config user.name "AI Coding Studio"',
      );

      // If user selected an existing branch, checkout it
      if (params.branchName) {
        const checkoutResult = await this.sandboxProvider.exec(
          sandbox,
          `git checkout ${params.branchName} 2>&1`,
        );
        this.logger.log(`[Task ${taskId}] Checkout existing branch: ${params.branchName} (exit ${checkoutResult.exitCode})`);
      }

      // 4. Write CLAUDE.md to instruct Claude Code on git workflow
      const branchInstruction = params.branchName
        ? `You are on branch "${params.branchName}". Work on this branch directly.`
        : `You are on the default branch. Create a new branch from it with a semantic name prefixed with "ai-studio/" (e.g. ai-studio/fix-header-height). The branch name should be descriptive of the task in English, lowercase, hyphens only.`;

      const claudeMd = `# AI Coding Studio Instructions

## Git Workflow (MANDATORY)

${branchInstruction}

After completing the coding task, you MUST:
1. If you created a new branch, you are already on it.
2. Stage all changes: \`git add -A\`
3. Commit with a clear message describing what was changed.
4. Push to remote: \`git push origin HEAD\`

If there are no file changes, skip commit and push.

IMPORTANT:
- Always complete the git workflow (commit + push) before finishing.
- Use meaningful commit messages.
- Do NOT ask for permission — just do it.

## Task
Complete the user's request below. Read the codebase first to understand context, then make the changes.
`;

      await this.sandboxProvider.exec(
        sandbox,
        `cat > CLAUDE.md << 'CLAUDE_MD_EOF'\n${claudeMd}\nCLAUDE_MD_EOF`,
      );
      this.logger.log(`[Task ${taskId}] CLAUDE.md written to sandbox`);

      // 5. Execute AI coding task
      await this.taskService.updateStatus(taskId, TaskStatus.EXECUTING);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.EXECUTING);
      this.logger.log(`[Task ${taskId}] Starting AI execution...`);

      const events: string[] = [];

      for await (const event of this.engineProvider.execute({
        taskId: String(taskId),
        prompt: params.prompt,
        sandbox,
      })) {
        this.streamGateway.emitTaskEvent(taskId, event);
        events.push(JSON.stringify(event));

        if (event.type === 'error') {
          this.logger.error(`[Task ${taskId}] AI Engine error: ${event.message}`);
        }
      }

      this.logger.log(`[Task ${taskId}] AI execution finished, ${events.length} events`);

      // 6. Read branch name from sandbox (Claude Code may have created a new one)
      const branchResult = await this.sandboxProvider.exec(
        sandbox,
        'git branch --show-current',
      );
      const actualBranch = branchResult.stdout.trim();
      this.logger.log(`[Task ${taskId}] Current branch after execution: ${actualBranch}`);

      // Update task with actual branch name if it changed
      if (actualBranch && actualBranch !== params.branchName) {
        await this.taskService.updateBranchName(taskId, actualBranch);
        this.streamGateway.emitTaskBranchName(taskId, actualBranch);
      }

      await this.taskService.updateStatus(taskId, TaskStatus.COMPLETED);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.COMPLETED);

      await this.taskService.addMessage({
        taskId: taskId,
        role: 'ai',
        content: 'Task completed',
        eventsJson: JSON.stringify(events),
      });

      // 7. Deploy (skip if previewUrlTemplate is empty or not configured)
      if (params.previewUrlTemplate && !params.previewUrlTemplate.includes('example.com')) {
        await this.taskService.updateStatus(taskId, TaskStatus.DEPLOYING);
        this.streamGateway.emitTaskStatus(taskId, TaskStatus.DEPLOYING);
        this.logger.log(`[Task ${taskId}] Starting deploy...`);

        let deployResult = await this.deployProvider.deploy({
          repoFullName: params.repoFullName,
          branch: params.branchName,
          previewUrlTemplate: params.previewUrlTemplate,
        });

        let retries = 0;
        while (deployResult.status === 'failed' && retries < MAX_DEPLOY_RETRIES) {
          retries++;
          this.logger.warn(`[Task ${taskId}] Deploy failed, retry ${retries}/${MAX_DEPLOY_RETRIES}`);
          deployResult = await this.deployProvider.retry(deployResult.deployId);
        }

        if (deployResult.status === 'success') {
          await this.taskService.updateStatus(
            taskId,
            TaskStatus.DEPLOYED,
            deployResult.previewUrl ?? undefined,
          );
          this.streamGateway.emitTaskStatus(
            taskId,
            TaskStatus.DEPLOYED,
            deployResult.previewUrl ?? undefined,
          );
        } else {
          await this.taskService.updateStatus(taskId, TaskStatus.DEPLOY_FAILED);
          this.streamGateway.emitTaskError(
            taskId,
            `Deploy failed after ${MAX_DEPLOY_RETRIES} retries: ${deployResult.logs}`,
          );
        }
      } else {
        // No deploy configured — collect summary and diff info
        this.logger.log(`[Task ${taskId}] No deploy configured, collecting summary...`);

        const branch = actualBranch || params.branchName;

        // Get latest commit hash and changed files summary
        const commitResult = await this.sandboxProvider.exec(
          sandbox,
          'git rev-parse HEAD 2>/dev/null',
        );
        const commitHash = commitResult.stdout.trim();

        const logResult = await this.sandboxProvider.exec(
          sandbox,
          'git log --oneline -1 2>/dev/null && git diff HEAD~1 --stat 2>/dev/null || echo "No commits"',
        );

        // Construct commit URL: https://github.com/{repo}/commit/{hash}
        let commitUrl = '';
        if (params.repoFullName && commitHash) {
          const user = await this.authService.findById(params.userId);
          const platform = user?.gitPlatform ?? 'github';
          if (platform === 'github') {
            commitUrl = `https://github.com/${params.repoFullName}/commit/${commitHash}`;
          } else {
            commitUrl = `https://gitlab.com/${params.repoFullName}/-/commit/${commitHash}`;
          }
        }

        await this.taskService.updateStatus(taskId, TaskStatus.DEPLOYED);
        this.streamGateway.emitTaskSummary(taskId, {
          branch,
          baseBranch: params.baseBranch,
          commitUrl,
          commitHash,
          changedFiles: logResult.stdout.trim(),
          repoFullName: params.repoFullName,
        });
        this.streamGateway.emitTaskStatus(taskId, TaskStatus.DEPLOYED);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Task ${taskId} failed: ${message}`);
      await this.taskService.updateStatus(taskId, TaskStatus.FAILED);
      this.streamGateway.emitTaskError(taskId, message);
    } finally {
      if (sandbox) {
        try {
          await this.sandboxProvider.destroy(sandbox);
        } catch (error) {
          this.logger.error(`Failed to destroy sandbox: ${error}`);
        }
      }
    }
  }
}
