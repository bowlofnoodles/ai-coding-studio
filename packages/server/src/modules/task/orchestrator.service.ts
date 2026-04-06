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

      // 4. Determine branch name
      let branchName = params.branchName;

      if (!branchName) {
        // Generate semantic branch name using Claude inside sandbox
        this.logger.log(`[Task ${taskId}] Generating branch name from prompt...`);
        const genResult = await this.sandboxProvider.exec(
          sandbox,
          `claude -p "Based on this task description, generate a short git branch name (lowercase, hyphens, no spaces, max 40 chars, prefix with ai-studio/). Task: ${params.prompt.replace(/"/g, '\\"').substring(0, 200)}. Reply with ONLY the branch name, nothing else." --dangerously-skip-permissions --max-turns 1 2>&1 | tail -1`,
        );
        const generated = genResult.stdout.trim();
        if (generated && generated.startsWith('ai-studio/') && !generated.includes(' ')) {
          branchName = generated;
        } else {
          // Fallback: simple slug from prompt
          const slug = params.prompt
            .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 30)
            .replace(/-$/, '');
          branchName = `ai-studio/${slug || Date.now()}`;
        }
        this.logger.log(`[Task ${taskId}] Generated branch name: ${branchName}`);

        // Update task record with the generated branch name
        await this.taskService.updateBranchName(taskId, branchName);

        // Notify frontend of the branch name
        this.streamGateway.emitTaskBranchName(taskId, branchName);
      }

      // 5. Checkout branch (existing or new)
      const checkoutResult = await this.sandboxProvider.exec(
        sandbox,
        `git checkout ${branchName} 2>&1 || git checkout -b ${branchName} origin/${params.baseBranch} 2>&1`,
      );
      this.logger.log(`[Task ${taskId}] Checkout result (exit ${checkoutResult.exitCode}): ${checkoutResult.stdout.substring(0, 200)}`);

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

      // 6. Check for changes, commit and push only if there are actual modifications
      await this.taskService.updateStatus(taskId, TaskStatus.COMPLETED);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.COMPLETED);

      // Check if AI made any file changes
      const diffResult = await this.sandboxProvider.exec(sandbox, 'git status --porcelain');
      const hasChanges = diffResult.stdout.trim().length > 0;

      if (hasChanges) {
        this.logger.log(`[Task ${taskId}] Changes detected, committing and pushing...`);
        const pushResult = await this.sandboxProvider.exec(
          sandbox,
          `git add -A && git diff --cached --stat && git commit -m "ai-coding-studio: ${params.prompt.substring(0, 60)}" && git push origin ${branchName} 2>&1`,
        );
        this.logger.log(`[Task ${taskId}] Push result (exit ${pushResult.exitCode}): ${pushResult.stdout.substring(0, 300)}`);
        if (pushResult.stderr) {
          this.logger.warn(`[Task ${taskId}] Push stderr: ${pushResult.stderr.substring(0, 200)}`);
        }
      } else {
        this.logger.log(`[Task ${taskId}] No file changes detected, skipping commit/push`);
      }

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
        // No deploy configured, mark as deployed directly
        this.logger.log(`[Task ${taskId}] No deploy configured, skipping deploy step`);
        await this.taskService.updateStatus(taskId, TaskStatus.DEPLOYED);
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
