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
