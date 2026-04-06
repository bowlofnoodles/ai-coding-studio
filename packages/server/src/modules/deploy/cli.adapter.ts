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
        timeout: 300_000,
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
