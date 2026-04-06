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
