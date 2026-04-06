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
      const user = await this.authService.findById(params.userId);
      if (user) {
        this.gitProvider.configure(user.gitToken);
      }

      try {
        await this.gitProvider.createBranch(
          params.repoFullName,
          params.baseBranch,
          params.branchName,
        );
      } catch {
        this.logger.log(`Branch ${params.branchName} may already exist, continuing`);
      }

      await this.taskService.updateStatus(taskId, TaskStatus.SANDBOX_READY);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.SANDBOX_READY);

      sandbox = await this.sandboxProvider.create({});

      await this.sandboxProvider.exec(
        sandbox,
        `git clone --branch ${params.branchName} ${params.repoUrl} .`,
      );

      await this.taskService.updateStatus(taskId, TaskStatus.EXECUTING);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.EXECUTING);

      const events: string[] = [];

      for await (const event of this.engineProvider.execute({
        taskId: String(taskId),
        prompt: params.prompt,
        workDir: sandbox.workDir,
        apiKey: params.apiKey,
      })) {
        this.streamGateway.emitTaskEvent(taskId, event);
        events.push(JSON.stringify(event));
      }

      await this.taskService.updateStatus(taskId, TaskStatus.COMPLETED);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.COMPLETED);

      await this.sandboxProvider.exec(
        sandbox,
        'git add -A && git commit -m "AI coding: task completed" --allow-empty && git push origin HEAD',
      );

      await this.taskService.addMessage({
        taskId: taskId,
        role: 'ai',
        content: 'Task completed',
        eventsJson: JSON.stringify(events),
      });

      await this.taskService.updateStatus(taskId, TaskStatus.DEPLOYING);
      this.streamGateway.emitTaskStatus(taskId, TaskStatus.DEPLOYING);

      let deployResult = await this.deployProvider.deploy({
        repoFullName: params.repoFullName,
        branch: params.branchName,
        previewUrlTemplate: params.previewUrlTemplate,
      });

      let retries = 0;
      while (deployResult.status === 'failed' && retries < MAX_DEPLOY_RETRIES) {
        retries++;
        this.logger.warn(`Deploy failed, retry ${retries}/${MAX_DEPLOY_RETRIES}`);
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
