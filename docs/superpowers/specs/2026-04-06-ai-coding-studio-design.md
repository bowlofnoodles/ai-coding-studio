# AI Coding Studio — 设计文档

## 概述

AI Coding Studio 是一个内部 Web 平台，允许前端开发者和非技术人员（产品/设计）通过自然语言对话，快速迭代小需求。用户选择 Git 仓库，输入一句需求，平台在远端沙箱中执行 AI Coding 任务，完成后自动发布到预览环境，用户在页面内 iframe 预览效果。不满意可继续对话迭代。

## 目标用户

- **前端开发者**：快速迭代修改不大的需求，省去手动编码、构建、部署的流程
- **非技术人员（产品/设计）**：用自然语言描述需求，直接看到效果

## 核心流程

1. 用户在前端选择 Git 仓库，输入需求
2. 后端从主分支切出新分支
3. 创建临时沙箱，clone 仓库并 checkout 新分支
4. 在沙箱内启动 AI Coding 引擎执行任务
5. 通过 WebSocket 实时推送 AI 执行过程（思考、文件搜索、代码编辑、终端输出）到前端
6. 执行完成后，commit + push 到远端分支
7. 调用发布 CLI 部署到预览环境
8. 前端 iframe 加载预览 URL
9. 销毁沙箱
10. 用户不满意 → 输入新指令 → 在同一分支上重复 3-9

关键点：**分支是持久的状态载体，沙箱是临时的执行环境**。每次任务发布后沙箱即销毁，下次迭代创建新沙箱 checkout 同一分支。

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                   Frontend (React)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ 仓库选择  │ │ 对话界面  │ │ iframe 预览面板  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│                     │ WebSocket (Socket.io)       │
└─────────────────────┼───────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────┐
│              Backend (NestJS)                     │
│  ┌──────────────────┼──────────────────────────┐ │
│  │          Task Orchestrator                   │ │
│  │  接收用户指令 → 协调沙箱 → 协调AI引擎 → 推流  │ │
│  └──────┬──────────────┬───────────────┬───────┘ │
│         │              │               │         │
│  ┌──────▼────────┐ ┌──▼───────────┐ ┌─▼──────┐  │
│  │ Git Provider  │ │   Sandbox    │ │   AI   │  │
│  │  (Interface)  │ │   Provider   │ │ Engine │  │
│  ├───────────────┤ │  (Interface) │ │Provider│  │
│  │ GitLabAdapter │ ├──────────────┤ │(Iface) │  │
│  │ GitHubAdapter │ │DockerAdapter │ ├────────┤  │
│  └───────────────┘ │InternalAdapt.│ │Claude  │  │
│                    │ (future)     │ │CodeAd. │  │
│                    └──────────────┘ │Internal│  │
│                                     │Ad.(fut)│  │
│                                     └────────┘  │
└──────────────────────────────────────────────────┘
```

## 三层可插拔抽象

### 1. Git Provider

统一接口对接不同 Git 平台，用户在设置页选择平台类型并配置对应 Token。

```typescript
interface GitProvider {
  listRepos(token: string): Promise<Repo[]>;
  cloneRepo(repo: Repo, targetDir: string, token: string): Promise<void>;
  createBranch(repo: Repo, baseBranch: string, newBranch: string, token: string): Promise<void>;
  push(repoDir: string, branch: string, token: string): Promise<void>;
}
```

当前实现：
- **GitLabAdapter** — 通过 GitLab REST API + PAT
- **GitHubAdapter** — 通过 GitHub REST API + PAT

### 2. Sandbox Provider

统一接口管理沙箱生命周期。

```typescript
interface SandboxProvider {
  create(config: SandboxConfig): Promise<Sandbox>;
  exec(sandbox: Sandbox, command: string): Promise<ExecResult>;
  destroy(sandbox: Sandbox): Promise<void>;
}
```

当前实现：
- **DockerAdapter** — 通过 dockerode 管理容器，基于预构建的沙箱基础镜像

未来扩展：
- **InternalAdapter** — 对接公司内部远程沙箱基础设施

### 3. AI Engine Provider

统一接口管理 AI Coding 引擎。输出为异步事件流，由各 Adapter 将引擎原始输出转译为平台统一事件协议。

```typescript
interface AIEngineProvider {
  execute(task: CodingTask): AsyncIterable<CodingEvent>;
  abort(taskId: string): Promise<void>;
}
```

`CodingEvent` 的具体类型定义将在实现阶段基于 Claude Code SDK 实际输出的事件格式来确定。各 Adapter 负责将引擎原始事件转译为统一格式。

当前实现：
- **ClaudeCodeAdapter** — 通过 @anthropic-ai/claude-code-sdk 以编程方式启动 Claude Code

未来扩展：
- **InternalCLIAdapter** — 对接公司内部 AI Coding CLI 工具

## 前端设计

### 技术栈

- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Zustand（状态管理）
- Socket.io client（实时通信）
- Vite（构建）

### 页面结构

**主工作区 — 左右分栏布局：**

左侧（45%）— 对话 + 执行区：
- 顶部：仓库选择器 + 自动生成的分支名（从 main 切出）
- 中部：对话流，展示用户消息 + AI 执行过程，按事件类型分块展示：
  - 思考过程（紫色边框）
  - 工具调用/文件搜索（橙色边框）
  - 文件变更 diff（绿色边框）
  - 终端输出
- 底部：输入框 + 发送按钮

右侧（55%）— iframe 预览区：
- 顶部：预览 URL + 刷新/新窗口按钮
- 内容区：iframe 加载预览环境 URL

**设置页：**
- Git 平台类型选择（GitLab / GitHub）
- PAT 配置
- AI 引擎选择
- 沙箱偏好

**任务历史页：**
- 历史任务列表
- 分支记录
- 可重新进入对话继续迭代

## 后端设计

### 技术栈

- NestJS + TypeScript
- @nestjs/websockets + Socket.io（WebSocket）
- TypeORM + MySQL
- dockerode（Docker API 客户端）
- @anthropic-ai/claude-code-sdk（Claude Code SDK）

### 模块划分

```
src/modules/
├── auth/              # 用户认证
├── git-provider/      # Git 平台交互（可插拔）
│   ├── git-provider.interface.ts
│   ├── gitlab.adapter.ts
│   └── github.adapter.ts
├── task/              # 任务生命周期管理
├── sandbox/           # 沙箱管理（可插拔）
│   ├── sandbox.interface.ts
│   ├── docker.adapter.ts
│   └── internal.adapter.ts (future)
├── engine/            # AI Coding 引擎（可插拔）
│   ├── engine.interface.ts
│   ├── claude-code.adapter.ts
│   └── internal.adapter.ts (future)
├── deploy/            # 发布管理（可插拔）
│   ├── deploy.interface.ts
│   ├── cicd.adapter.ts        # CI/CD 模式（GitHub Actions / GitLab CI）
│   └── cli.adapter.ts         # CLI 模式（内部发布工具）
└── stream/            # WebSocket 网关
```

### 4. Deploy Provider

发布也做可插拔抽象，支持不同的发布方式。

```typescript
interface DeployProvider {
  deploy(config: DeployConfig): Promise<DeployResult>;
  getStatus(deployId: string): Promise<DeployStatus>;
  retry(deployId: string): Promise<DeployResult>;
}

interface DeployResult {
  deployId: string;
  status: 'success' | 'failed';
  previewUrl?: string;
  logs?: string;
}
```

当前实现：
- **CICDAdapter** — push 到分支后通过 Git 平台 CI/CD 自动触发（GitHub Actions / GitLab CI），通过 API 轮询运行状态
- **CLIAdapter** — 在沙箱销毁前调用内部发布 CLI（如 `xxx-cli deploy --branch feature-xxx`），解析 CLI 输出获取发布状态

**发布流程（通用）：**
1. AI 执行完成，代码 commit + push 到远端分支
2. 调用 DeployProvider.deploy()，由具体 Adapter 执行发布逻辑
3. 轮询 DeployProvider.getStatus() 获取发布状态
4. 构建失败 → 自动重试（最多 2 次）
5. 重试仍失败 → 状态更新为 deploy_failed，在对话流中展示失败信息（包含错误日志摘要），用户可查看详情或手动重试

**预览 URL：** 用户在设置页为仓库配置固定的预览域名模板（如 `https://{branch}.preview.company.com`），发布成功后按模板拼接出预览 URL。

**对话中的发布状态展示：**
- deploying → 显示"正在构建发布..."（带 loading 状态）
- deployed → 显示"发布成功"，右侧 iframe 自动加载预览
- deploy_failed → 显示"发布失败：{错误摘要}"，提供"重试"按钮

### 数据模型

**users 表：**
- id, username, git_platform (gitlab/github), git_token (加密存储), ai_engine_preference, created_at, updated_at

**tasks 表：**
- id, user_id, repo_url, branch_name, base_branch, prompt, status (pending/sandbox_ready/executing/completed/deploying/deployed/failed), preview_url, created_at, updated_at

**task_messages 表：**
- id, task_id, role (user/ai), content, events_json (AI 执行事件快照), created_at

### 任务状态流转

```
pending → sandbox_ready → executing → completed → deploying → deployed
                                                       ↓            ↓
                                                  deploy_failed   用户继续对话 → pending (新任务，同一分支)
                                                       ↓
                                                  自动重试(最多2次) → deployed / deploy_failed(最终)
任何阶段均可 → failed (非发布类错误)
```

## 部署方案

平台自身支持容器化一键部署：

```
docker/
├── sandbox.Dockerfile        # 沙箱基础镜像（Node.js + Git + Claude Code CLI）
├── web.Dockerfile            # 前端（Nginx 托管静态资源 + 反向代理）
├── server.Dockerfile         # 后端（NestJS）
└── docker-compose.yml        # 编排：web + server + mysql
```

docker-compose 服务：
- **web** — Nginx 容器，serve 前端构建产物，反向代理 /api 和 /socket.io 到 server
- **server** — NestJS 容器，挂载宿主机 Docker socket（`/var/run/docker.sock`）用于创建沙箱容器
- **mysql** — MySQL 8.0，数据持久化到 named volume

部署命令：`docker compose up -d`

## 项目结构

Monorepo（pnpm workspace）：

```
ai-coding-studio/
├── package.json
├── pnpm-workspace.yaml
├── packages/
│   ├── web/                  # 前端
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   │   ├── workspace/
│   │   │   │   ├── settings/
│   │   │   │   └── history/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   └── types/
│   │   └── package.json
│   ├── server/               # 后端
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── git-provider/
│   │   │   │   ├── task/
│   │   │   │   ├── sandbox/
│   │   │   │   ├── engine/
│   │   │   │   ├── deploy/
│   │   │   │   └── stream/
│   │   │   └── main.ts
│   │   └── package.json
│   └── shared/               # 共享类型和常量
│       ├── src/
│       │   ├── types/
│       │   └── constants/
│       └── package.json
└── docker/
    ├── sandbox.Dockerfile
    ├── web.Dockerfile
    ├── server.Dockerfile
    └── docker-compose.yml
```
