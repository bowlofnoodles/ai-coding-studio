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
