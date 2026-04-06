import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity, TaskMessageEntity } from '../../entities';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { OrchestratorService } from './orchestrator.service';
import { OrchestratorController } from './orchestrator.controller';
import { AuthModule } from '../auth';
import { GitProviderModule } from '../git-provider';
import { SandboxModule } from '../sandbox';
import { EngineModule } from '../engine';
import { DeployModule } from '../deploy';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskEntity, TaskMessageEntity]),
    AuthModule,
    GitProviderModule,
    SandboxModule,
    EngineModule,
    DeployModule,
  ],
  controllers: [TaskController, OrchestratorController],
  providers: [TaskService, OrchestratorService],
  exports: [TaskService, OrchestratorService],
})
export class TaskModule {}
