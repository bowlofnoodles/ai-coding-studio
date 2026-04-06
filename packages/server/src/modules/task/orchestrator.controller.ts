import { Controller, Post, Body } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post('execute')
  async execute(
    @Body()
    body: {
      userId: number;
      repoUrl: string;
      repoFullName: string;
      branchName: string;
      baseBranch: string;
      prompt: string;
      previewUrlTemplate: string;
      apiKey: string;
    },
  ) {
    const taskId = await this.orchestratorService.createAndExecuteTask(body);
    return { status: 'accepted', taskId };
  }
}
