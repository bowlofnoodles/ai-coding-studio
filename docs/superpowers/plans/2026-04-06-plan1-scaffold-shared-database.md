# Plan 1: 项目脚手架 + Shared 类型 + 数据库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 pnpm monorepo 脚手架，包含 web（React+Vite）、server（NestJS）、shared 三个 package，配置数据库连接和基础表结构，确保整体可启动。

**Architecture:** pnpm workspace monorepo，web 和 server 通过 shared 包共享类型。server 使用 TypeORM 连接 MySQL，创建 users、tasks、task_messages 三张表。

**Tech Stack:** pnpm, React 18, Vite, Tailwind CSS, shadcn/ui, NestJS, TypeORM, MySQL, Socket.io, TypeScript

---

### Task 1: 初始化 Monorepo 根目录

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: 创建根 package.json**

```json
{
  "name": "ai-coding-studio",
  "private": true,
  "scripts": {
    "dev:web": "pnpm --filter @ai-coding-studio/web dev",
    "dev:server": "pnpm --filter @ai-coding-studio/server start:dev",
    "build:web": "pnpm --filter @ai-coding-studio/web build",
    "build:server": "pnpm --filter @ai-coding-studio/server build",
    "build:shared": "pnpm --filter @ai-coding-studio/shared build"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: 创建 .npmrc**

```
shamefully-hoist=true
```

- [ ] **Step 4: 创建 .gitignore**

```
node_modules/
dist/
.env
.env.local
*.log
.superpowers/
```

- [ ] **Step 5: 运行 pnpm install 验证 workspace 初始化**

Run: `pnpm install`
Expected: 成功执行，创建 pnpm-lock.yaml

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore .npmrc pnpm-lock.yaml
git commit -m "chore: init pnpm monorepo workspace"
```

---

### Task 2: 初始化 shared 包

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/task.ts`
- Create: `packages/shared/src/types/user.ts`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/constants/task-status.ts`
- Create: `packages/shared/src/constants/index.ts`

- [ ] **Step 1: 创建 packages/shared/package.json**

```json
{
  "name": "@ai-coding-studio/shared",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: 创建 packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: 创建任务状态常量 packages/shared/src/constants/task-status.ts**

```typescript
export const TaskStatus = {
  PENDING: 'pending',
  SANDBOX_READY: 'sandbox_ready',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  DEPLOYING: 'deploying',
  DEPLOYED: 'deployed',
  DEPLOY_FAILED: 'deploy_failed',
  FAILED: 'failed',
} as const;

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];
```

- [ ] **Step 4: 创建 packages/shared/src/constants/index.ts**

```typescript
export { TaskStatus, type TaskStatusType } from './task-status';
```

- [ ] **Step 5: 创建用户类型 packages/shared/src/types/user.ts**

```typescript
export type GitPlatform = 'gitlab' | 'github';

export interface User {
  id: number;
  username: string;
  gitPlatform: GitPlatform;
  aiEnginePreference: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  username: string;
  gitPlatform: GitPlatform;
  gitToken: string;
  aiEnginePreference?: string;
}

export interface UpdateUserDto {
  gitPlatform?: GitPlatform;
  gitToken?: string;
  aiEnginePreference?: string;
}
```

- [ ] **Step 6: 创建任务类型 packages/shared/src/types/task.ts**

```typescript
import { TaskStatusType } from '../constants/task-status';

export interface Task {
  id: number;
  userId: number;
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  prompt: string;
  status: TaskStatusType;
  previewUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskMessage {
  id: number;
  taskId: number;
  role: 'user' | 'ai';
  content: string;
  eventsJson: string | null;
  createdAt: Date;
}

export interface CreateTaskDto {
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  prompt: string;
}
```

- [ ] **Step 7: 创建 packages/shared/src/types/index.ts**

```typescript
export type { User, CreateUserDto, UpdateUserDto, GitPlatform } from './user';
export type { Task, TaskMessage, CreateTaskDto } from './task';
```

- [ ] **Step 8: 创建 packages/shared/src/index.ts**

```typescript
export * from './types';
export * from './constants';
```

- [ ] **Step 9: 安装依赖并构建验证**

Run: `cd packages/shared && pnpm install && pnpm build`
Expected: 成功编译到 dist/，无 TypeScript 错误

- [ ] **Step 10: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package with types and constants"
```

---

### Task 3: 初始化 server 包（NestJS）

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/tsconfig.build.json`
- Create: `packages/server/nest-cli.json`
- Create: `packages/server/src/main.ts`
- Create: `packages/server/src/app.module.ts`
- Create: `packages/server/.env.example`

- [ ] **Step 1: 创建 packages/server/package.json**

```json
{
  "name": "@ai-coding-studio/server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/websockets": "^10.0.0",
    "@nestjs/platform-socket.io": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "typeorm": "^0.3.20",
    "mysql2": "^3.9.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "socket.io": "^4.7.0",
    "@ai-coding-studio/shared": "workspace:*"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: 创建 packages/server/tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: 创建 packages/server/tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 4: 创建 packages/server/nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: 创建 packages/server/.env.example**

```
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=root
DB_DATABASE=ai_coding_studio
```

- [ ] **Step 6: 创建 packages/server/src/app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

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
  ],
})
export class AppModule {}
```

- [ ] **Step 7: 创建 packages/server/src/main.ts**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.listen(3001);
  console.log('Server running on http://localhost:3001');
}
bootstrap();
```

- [ ] **Step 8: 安装依赖**

Run: `cd packages/server && pnpm install`
Expected: 成功安装所有依赖

- [ ] **Step 9: 验证 TypeScript 编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 10: Commit**

```bash
git add packages/server/
git commit -m "feat: add NestJS server package with TypeORM config"
```

---

### Task 4: 创建数据库 Entity

**Files:**
- Create: `packages/server/src/entities/user.entity.ts`
- Create: `packages/server/src/entities/task.entity.ts`
- Create: `packages/server/src/entities/task-message.entity.ts`
- Create: `packages/server/src/entities/index.ts`

- [ ] **Step 1: 创建 User Entity packages/server/src/entities/user.entity.ts**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100, unique: true })
  username: string;

  @Column({ name: 'git_platform', length: 20 })
  gitPlatform: string;

  @Column({ name: 'git_token', length: 500 })
  gitToken: string;

  @Column({ name: 'ai_engine_preference', length: 50, default: 'claude-code' })
  aiEnginePreference: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => TaskEntity, (task) => task.user)
  tasks: TaskEntity[];
}
```

- [ ] **Step 2: 创建 Task Entity packages/server/src/entities/task.entity.ts**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { TaskMessageEntity } from './task-message.entity';

@Entity('tasks')
export class TaskEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'repo_url', length: 500 })
  repoUrl: string;

  @Column({ name: 'branch_name', length: 200 })
  branchName: string;

  @Column({ name: 'base_branch', length: 200, default: 'main' })
  baseBranch: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ length: 30, default: 'pending' })
  status: string;

  @Column({ name: 'preview_url', length: 500, nullable: true })
  previewUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.tasks)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @OneToMany(() => TaskMessageEntity, (message) => message.task)
  messages: TaskMessageEntity[];
}
```

- [ ] **Step 3: 创建 TaskMessage Entity packages/server/src/entities/task-message.entity.ts**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('task_messages')
export class TaskMessageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  taskId: number;

  @Column({ length: 10 })
  role: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'events_json', type: 'longtext', nullable: true })
  eventsJson: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => TaskEntity, (task) => task.messages)
  @JoinColumn({ name: 'task_id' })
  task: TaskEntity;
}
```

- [ ] **Step 4: 创建 packages/server/src/entities/index.ts**

```typescript
export { UserEntity } from './user.entity';
export { TaskEntity } from './task.entity';
export { TaskMessageEntity } from './task-message.entity';
```

- [ ] **Step 5: 验证编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/entities/
git commit -m "feat: add User, Task, TaskMessage entities"
```

---

### Task 5: 初始化 web 包（React + Vite + Tailwind + shadcn/ui）

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.app.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/index.css`
- Create: `packages/web/src/vite-env.d.ts`
- Create: `packages/web/components.json`

- [ ] **Step 1: 创建 packages/web/package.json**

```json
{
  "name": "@ai-coding-studio/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "zustand": "^4.5.0",
    "socket.io-client": "^4.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "class-variance-authority": "^0.7.0",
    "lucide-react": "^0.370.0",
    "@ai-coding-studio/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: 创建 packages/web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 packages/web/tsconfig.app.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 创建 packages/web/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 5: 创建 packages/web/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Coding Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 创建 packages/web/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: 创建 packages/web/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 8: 创建 packages/web/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: 创建 packages/web/src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 10: 创建 packages/web/src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Workspace() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-2xl font-bold">AI Coding Studio</h1>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workspace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 11: 创建 packages/web/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 12: 创建 shadcn/ui 配置 packages/web/components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 13: 安装依赖**

Run: `cd packages/web && pnpm install`
Expected: 成功安装所有依赖

- [ ] **Step 14: 创建 shadcn/ui 工具函数 packages/web/src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 15: 启动 dev server 验证**

Run: `cd packages/web && pnpm dev`
Expected: Vite dev server 在 http://localhost:3000 启动，页面显示 "AI Coding Studio"

- [ ] **Step 16: Commit**

```bash
git add packages/web/
git commit -m "feat: add React web package with Vite, Tailwind, shadcn/ui"
```

---

### Task 6: 验证整体 Monorepo 可用

**Files:**
- Modify: `packages/web/src/App.tsx` (验证 shared 包引用)

- [ ] **Step 1: 在 web 包中验证 shared 类型引用**

修改 `packages/web/src/App.tsx`，在顶部添加 import 验证 shared 包可用：

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TaskStatus } from '@ai-coding-studio/shared';

function Workspace() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI Coding Studio</h1>
          <p className="text-gray-400 mt-2">Status: {TaskStatus.PENDING}</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workspace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: 先构建 shared 包，再启动 web dev 验证**

Run: `pnpm build:shared && pnpm dev:web`
Expected: 页面显示 "AI Coding Studio" 和 "Status: pending"

- [ ] **Step 3: 验证 server 包编译**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: verify monorepo cross-package imports"
```
