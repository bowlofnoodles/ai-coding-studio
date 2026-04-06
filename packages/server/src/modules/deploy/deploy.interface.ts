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
