# Plan 3: Task Orchestrator + WebSocket 网关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现任务编排核心逻辑（Task Orchestrator）和 WebSocket 实时事件推送网关，串联四层 Provider 完成完整的任务执行链路：创建任务 → 切分支 → 创建沙箱 → AI 执行 → commit & push → 发布 → 销毁沙箱。

**Architecture:** Task Module 管理任务 CRUD 和生命周期状态，Orchestrator Service 协调四层 Provider 执行任务，Stream Module 通过 Socket.io WebSocket 网关向前端推送实时事件。Auth Module 提供基础用户认证。

**Tech Stack:** NestJS, TypeORM, Socket.io, @nestjs/websockets

---

### Task 1: Auth Module — 基础用户认证

**Files:**
- Create: `packages/server/src/modules/auth/auth.service.ts`
- Create: `packages/server/src/modules/auth/auth.controller.ts`
- Create: `packages/server/src/modules/auth/auth.module.ts`
- Create: `packages/server/src/modules/auth/index.ts`

- [ ] **Step 1: 创建 packages/server/src/modules/auth/auth.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async findById(id: number): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async createUser(data: {
    username: string;
    gitPlatform: string;
    gitToken: string;
    aiEnginePreference?: string;
  }): Promise<UserEntity> {
    const user = this.userRepo.create({
      username: data.username,
      gitPlatform: data.gitPlatform,
      gitToken: data.gitToken,
      aiEnginePreference: data.aiEnginePreference ?? 'claude-code',
    });
    return this.userRepo.save(user);
  }

  async updateUser(
    id: number,
    data: Partial<{
      gitPlatform: string;
      gitToken: string;
      aiEnginePreference: string;
    }>,
  ): Promise<UserEntity | null> {
    await this.userRepo.update(id, data);
    return this.findById(id);
  }
}
```

- [ ] **Step 2: 创建 packages/server/src/modules/auth/auth.controller.ts**

```typescript
import { Controller, Get, Post, Put, Body, Param, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body()
    body: {
      username: string;
      gitPlatform: string;
      gitToken: string;
      aiEnginePreference?: string;
    },
  ) {
    return this.authService.createUser(body);
  }

  @Post('login')
  async login(@Body() body: { username: string }) {
    const user = await this.authService.findByUsername(body.username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { id: user.id, username: user.username };
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const user = await this.authService.findById(Number(id));
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { gitToken, ...rest } = user;
    return rest;
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      gitPlatform: string;
      gitToken: string;
      aiEnginePreference: string;
    }>,
  ) {
    const user = await this.authService.updateUser(Number(id), body);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { gitToken, ...rest } = user;
    return rest;
  }
}
```

- [ ] **Step 3: 创建 packages/server/src/modules/auth/auth.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../entities';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 4: 创建 packages/server/src/modules/auth/index.ts**

```typescript
export { AuthModule } from './auth.module';
export { AuthService } from './auth.service';
```

- [ ] **Step 5: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/modules/auth/
git commit -m "feat(server): add Auth module with user CRUD"
```

---

### Task 2: Task Module — 任务 CRUD 和生命周期

**Files:**
- Create: `packages/server/src/modules/task/task.service.ts`
- Create: `packages/server/src/modules/task/task.controller.ts`
- Create: `packages/server/src/modules/task/task.module.ts`
- Create: `packages/server/src/modules/task/index.ts`

- [ ] **Step 1: 创建 packages/server/src/modules/task/task.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity, TaskMessageEntity } from '../../entities';
import { TaskStatus } from '@ai-coding-studio/shared';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
    @InjectRepository(TaskMessageEntity)
    private readonly messageRepo: Repository<TaskMessageEntity>,
  ) {}

  async create(data: {
    userId: number;
    repoUrl: string;
    branchName: string;
    baseBranch: string;
    prompt: string;
  }): Promise<TaskEntity> {
    const task = this.taskRepo.create({
      ...data,
      status: TaskStatus.PENDING,
    });
    return this.taskRepo.save(task);
  }

  async findById(id: number): Promise<TaskEntity | null> {
    return this.taskRepo.findOne({
      where: { id },
      relations: ['messages'],
    });
  }

  async findByUserId(userId: number): Promise<TaskEntity[]> {
    return this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByBranch(userId: number, branchName: string): Promise<TaskEntity[]> {
    return this.taskRepo.find({
      where: { userId, branchName },
      relations: ['messages'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(
    id: number,
    status: string,
    previewUrl?: string,
  ): Promise<void> {
    const update: Partial<TaskEntity> = { status };
    if (previewUrl !== undefined) {
      update.previewUrl = previewUrl;
    }
    await this.taskRepo.update(id, update);
  }

  async addMessage(data: {
    taskId: number;
    role: string;
    content: string;
    eventsJson?: string;
  }): Promise<TaskMessageEntity> {
    const message = this.messageRepo.create(data);
    return this.messageRepo.save(message);
  }
}
```

- [ ] **Step 2: 创建 packages/server/src/modules/task/task.controller.ts**

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { TaskService } from './task.service';

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  async listTasks(@Query('userId') userId: string) {
    return this.taskService.findByUserId(Number(userId));
  }

  @Get(':id')
  async getTask(@Param('id') id: string) {
    const task = await this.taskService.findById(Number(id));
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  @Get('branch/:branchName')
  async getTasksByBranch(
    @Param('branchName') branchName: string,
    @Query('userId') userId: string,
  ) {
    return this.taskService.findByBranch(Number(userId), branchName);
  }
}
```

- [ ] **Step 3: 创建 packages/server/src/modules/task/task.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity, TaskMessageEntity } from '../../entities';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity, TaskMessageEntity])],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
```

- [ ] **Step 4: 创建 packages/server/src/modules/task/index.ts**

```typescript
export { TaskModule } from './task.module';
export { TaskService } from './task.service';
```

- [ ] **Step 5: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/modules/task/
git commit -m "feat(server): add Task module with CRUD and lifecycle management"
```

---

### Task 3: Stream Module — WebSocket 网关

**Files:**
- Create: `packages/server/src/modules/stream/stream.gateway.ts`
- Create: `packages/server/src/modules/stream/stream.module.ts`
- Create: `packages/server/src/modules/stream/index.ts`

- [ ] **Step 1: 创建 packages/server/src/modules/stream/stream.gateway.ts**

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CodingEvent } from '@ai-coding-studio/shared';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StreamGateway.name);
  private clientTaskMap = new Map<string, string>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    client.on('subscribe', (taskId: string) => {
      client.join(`task:${taskId}`);
      this.clientTaskMap.set(client.id, taskId);
      this.logger.log(`Client ${client.id} subscribed to task ${taskId}`);
    });

    client.on('unsubscribe', (taskId: string) => {
      client.leave(`task:${taskId}`);
      this.clientTaskMap.delete(client.id);
    });
  }

  handleDisconnect(client: Socket) {
    this.clientTaskMap.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitTaskEvent(taskId: number, event: CodingEvent) {
    this.server.to(`task:${taskId}`).emit('task:event', {
      taskId,
      event,
      timestamp: Date.now(),
    });
  }

  emitTaskStatus(taskId: number, status: string, previewUrl?: string) {
    this.server.to(`task:${taskId}`).emit('task:status', {
      taskId,
      status,
      previewUrl,
      timestamp: Date.now(),
    });
  }

  emitTaskError(taskId: number, message: string) {
    this.server.to(`task:${taskId}`).emit('task:error', {
      taskId,
      message,
      timestamp: Date.now(),
    });
  }
}
```

- [ ] **Step 2: 创建 packages/server/src/modules/stream/stream.module.ts**

```typescript
import { Module, Global } from '@nestjs/common';
import { StreamGateway } from './stream.gateway';

@Global()
@Module({
  providers: [StreamGateway],
  exports: [StreamGateway],
})
export class StreamModule {}
```

- [ ] **Step 3: 创建 packages/server/src/modules/stream/index.ts**

```typescript
export { StreamModule } from './stream.module';
export { StreamGateway } from './stream.gateway';
```

- [ ] **Step 4: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/modules/stream/
git commit -m "feat(server): add WebSocket stream gateway for real-time events"
```

---

### Task 4: Orchestrator Service — 核心任务编排

**Files:**
- Create: `packages/server/src/modules/task/orchestrator.service.ts`
- Create: `packages/server/src/modules/task/orchestrator.controller.ts`
- Modify: `packages/server/src/modules/task/task.module.ts`
- Modify: `packages/server/src/modules/task/index.ts`

- [ ] **Step 1: 创建 packages/server/src/modules/task/orchestrator.service.ts**

这是核心编排逻辑，串联所有 Provider 执行完整的任务链路。

```typescript
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

  async executeTask(params: {
    userId: number;
    repoUrl: string;
    repoFullName: string;
    branchName: string;
    baseBranch: string;
    prompt: string;
    previewUrlTemplate: string;
    apiKey: string;
  }): Promise<void> {
    // 1. Create task record
    const task = await this.taskService.create({
      userId: params.userId,
      repoUrl: params.repoUrl,
      branchName: params.branchName,
      baseBranch: params.baseBranch,
      prompt: params.prompt,
    });

    // Save user message
    await this.taskService.addMessage({
      taskId: task.id,
      role: 'user',
      content: params.prompt,
    });

    let sandbox: Sandbox | null = null;

    try {
      // 2. Configure git provider with user token
      const user = await this.authService.findById(params.userId);
      if (user) {
        this.gitProvider.configure(user.gitToken);
      }

      // 3. Create branch (ignore error if already exists for iteration)
      try {
        await this.gitProvider.createBranch(
          params.repoFullName,
          params.baseBranch,
          params.branchName,
        );
      } catch {
        this.logger.log(`Branch ${params.branchName} may already exist, continuing`);
      }

      // 4. Create sandbox
      await this.taskService.updateStatus(task.id, TaskStatus.SANDBOX_READY);
      this.streamGateway.emitTaskStatus(task.id, TaskStatus.SANDBOX_READY);

      sandbox = await this.sandboxProvider.create({});

      // 5. Clone repo into sandbox
      await this.sandboxProvider.exec(
        sandbox,
        `git clone --branch ${params.branchName} ${params.repoUrl} .`,
      );

      // 6. Execute AI coding task
      await this.taskService.updateStatus(task.id, TaskStatus.EXECUTING);
      this.streamGateway.emitTaskStatus(task.id, TaskStatus.EXECUTING);

      const events: string[] = [];

      for await (const event of this.engineProvider.execute({
        taskId: String(task.id),
        prompt: params.prompt,
        workDir: sandbox.workDir,
        apiKey: params.apiKey,
      })) {
        // Push event to frontend in real-time
        this.streamGateway.emitTaskEvent(task.id, event);
        events.push(JSON.stringify(event));
      }

      // 7. Commit and push
      await this.taskService.updateStatus(task.id, TaskStatus.COMPLETED);
      this.streamGateway.emitTaskStatus(task.id, TaskStatus.COMPLETED);

      await this.sandboxProvider.exec(
        sandbox,
        'git add -A && git commit -m "AI coding: task completed" --allow-empty && git push origin HEAD',
      );

      // Save AI message with events
      await this.taskService.addMessage({
        taskId: task.id,
        role: 'ai',
        content: 'Task completed',
        eventsJson: JSON.stringify(events),
      });

      // 8. Deploy
      await this.taskService.updateStatus(task.id, TaskStatus.DEPLOYING);
      this.streamGateway.emitTaskStatus(task.id, TaskStatus.DEPLOYING);

      let deployResult = await this.deployProvider.deploy({
        repoFullName: params.repoFullName,
        branch: params.branchName,
        previewUrlTemplate: params.previewUrlTemplate,
      });

      // Retry on failure
      let retries = 0;
      while (deployResult.status === 'failed' && retries < MAX_DEPLOY_RETRIES) {
        retries++;
        this.logger.warn(`Deploy failed, retry ${retries}/${MAX_DEPLOY_RETRIES}`);
        deployResult = await this.deployProvider.retry(deployResult.deployId);
      }

      if (deployResult.status === 'success') {
        await this.taskService.updateStatus(
          task.id,
          TaskStatus.DEPLOYED,
          deployResult.previewUrl ?? undefined,
        );
        this.streamGateway.emitTaskStatus(
          task.id,
          TaskStatus.DEPLOYED,
          deployResult.previewUrl ?? undefined,
        );
      } else {
        await this.taskService.updateStatus(task.id, TaskStatus.DEPLOY_FAILED);
        this.streamGateway.emitTaskError(
          task.id,
          `Deploy failed after ${MAX_DEPLOY_RETRIES} retries: ${deployResult.logs}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Task ${task.id} failed: ${message}`);
      await this.taskService.updateStatus(task.id, TaskStatus.FAILED);
      this.streamGateway.emitTaskError(task.id, message);
    } finally {
      // 9. Destroy sandbox
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
```

- [ ] **Step 2: 创建 packages/server/src/modules/task/orchestrator.controller.ts**

```typescript
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
    // Fire and forget — results are streamed via WebSocket
    this.orchestratorService.executeTask(body);
    return { status: 'accepted' };
  }
}
```

- [ ] **Step 3: 更新 packages/server/src/modules/task/task.module.ts**

```typescript
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
```

- [ ] **Step 4: 更新 packages/server/src/modules/task/index.ts**

```typescript
export { TaskModule } from './task.module';
export { TaskService } from './task.service';
export { OrchestratorService } from './orchestrator.service';
```

- [ ] **Step 5: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/modules/task/
git commit -m "feat(server): add Orchestrator service for end-to-end task execution"
```

---

### Task 5: 更新 AppModule 注册所有新模块

**Files:**
- Modify: `packages/server/src/app.module.ts`

- [ ] **Step 1: 更新 app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth';
import { GitProviderModule } from './modules/git-provider';
import { SandboxModule } from './modules/sandbox';
import { EngineModule } from './modules/engine';
import { DeployModule } from './modules/deploy';
import { TaskModule } from './modules/task';
import { StreamModule } from './modules/stream';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', 'root'),
        database: configService.get<string>('DB_DATABASE', 'ai_coding_studio'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
    StreamModule,
    AuthModule,
    GitProviderModule,
    SandboxModule,
    EngineModule,
    DeployModule,
    TaskModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/app.module.ts
git commit -m "feat(server): register Auth, Task, Stream modules in AppModule"
```
