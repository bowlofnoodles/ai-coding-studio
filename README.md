# AI Coding Studio

> 一句话需求，AI 帮你写代码、发布、预览，全程在浏览器里完成。

AI Coding Studio 是一个面向前端团队的内部 Web 平台。产品经理或开发者只需要在页面上选择一个 Git 仓库，用自然语言描述想要的修改（比如"把首页 header 高度改成 48px"），平台就会自动在远端沙箱里拉起 AI 编码引擎完成代码修改，构建发布到预览环境，你在页面右侧即可直接看到效果。不满意？继续输入下一句，AI 在同一个分支上继续迭代。

## 它解决什么问题

前端团队经常面对大量"改个文案"、"调个样式"、"加个字段"这类小需求。传统流程是：

```
产品提需求 → 排期 → 开发写代码 → 本地测试 → 提交 PR → Code Review → 合并 → 构建发布 → 验证
```

AI Coding Studio 把这个流程压缩为：

```
在页面上输入一句话 → AI 自动完成编码、提交、发布 → 直接在页面预览效果
```

**适用场景：**
- 前端开发者快速迭代修改不大的需求，省去手动编码、构建、部署的流程
- 产品/设计人员用自然语言直接描述需求，不需要等排期，即时看到效果

## 它是怎么工作的

```
┌─ 浏览器 ──────────────────────────────────────────────────────────┐
│                                                                    │
│  ┌─ 左侧：对话区 ──────────┐  ┌─ 右侧：预览区 ───────────────┐  │
│  │                          │  │                               │  │
│  │  [仓库] my-org/web-app   │  │   ┌─────────────────────┐    │  │
│  │  [分支] ai-studio/xxxx   │  │   │                     │    │  │
│  │                          │  │   │   iframe 实时预览     │    │  │
│  │  你: 把 header 改成 48px  │  │   │   修改后的页面效果     │    │  │
│  │                          │  │   │                     │    │  │
│  │  AI: 💭 分析需求...       │  │   └─────────────────────┘    │  │
│  │      🔍 搜索 Header.tsx   │  │                               │  │
│  │      📝 修改 height: 48px │  │                               │  │
│  │      ✅ 完成，已发布       │  │                               │  │
│  │                          │  │                               │  │
│  │  [输入下一个需求...]       │  │                               │  │
│  └──────────────────────────┘  └───────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**完整执行链路：**

1. 用户选择 Git 仓库，输入自然语言需求
2. 后端从主分支自动切出新分支
3. 创建临时 Docker 沙箱容器，clone 仓库代码
4. 在沙箱内启动 AI 编码引擎（Claude Code SDK）执行任务
5. 前端通过 WebSocket **实时展示** AI 的思考过程、文件搜索、代码编辑
6. 执行完成 → 自动 commit + push 到远端分支
7. 触发发布（CI/CD 或内部 CLI），失败自动重试
8. 发布成功 → 前端 iframe 加载预览 URL
9. 销毁沙箱容器
10. 用户不满意 → 继续输入 → 在同一分支上重复 3-9

**核心设计原则：分支是持久的状态载体，沙箱是临时的执行环境。** 每次任务完成后沙箱即销毁，代码变更保存在 Git 分支上。下次迭代时创建新沙箱，checkout 同一分支继续。

## 架构设计

```
┌────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                  │
│         仓库选择 ｜ 对话 + 实时执行流 ｜ iframe 预览        │
│                         │ WebSocket                        │
└─────────────────────────┼──────────────────────────────────┘
                          │
┌─────────────────────────┼──────────────────────────────────┐
│                  Backend (NestJS)                           │
│                                                            │
│   ┌──────────────────────────────────────────────────┐     │
│   │            Task Orchestrator (编排核心)            │     │
│   │  接收需求 → 切分支 → 建沙箱 → AI执行 → 发布 → 清理  │     │
│   └────────┬──────────┬──────────┬──────────┬────────┘     │
│            │          │          │          │               │
│   ┌────────▼──┐ ┌─────▼────┐ ┌──▼──────┐ ┌▼────────┐     │
│   │    Git    │ │ Sandbox  │ │   AI    │ │  Deploy │     │
│   │ Provider  │ │ Provider │ │ Engine  │ │ Provider│     │
│   ├───────────┤ ├──────────┤ ├─────────┤ ├─────────┤     │
│   │ ✅ GitHub │ │ ✅ Docker│ │✅ Claude│ │ ✅ CI/CD│     │
│   │ 🔜 GitLab│ │ 🔜 内部  │ │  Code   │ │ ✅ CLI  │     │
│   │          │ │   沙箱   │ │🔜 内部  │ │         │     │
│   └──────────┘ └──────────┘ │  AI CLI │ └─────────┘     │
│                             └─────────┘                   │
└───────────────────────────────────────────────────────────┘
                          │
               ┌──────────┼──────────┐
               │    临时沙箱容器       │
               │   Node.js + Git +   │
               │   Claude Code CLI   │
               └─────────────────────┘
```

### 四层可插拔架构

平台的核心能力被抽象为四个 Provider 层，每层通过接口（Interface）+ 适配器（Adapter）模式实现，可以独立替换和扩展：

| 层级 | 职责 | 当前实现 | 可扩展 |
|------|------|---------|--------|
| **Git Provider** | 仓库列表、clone、分支管理、push | GitHub (Octokit) | GitLab |
| **Sandbox Provider** | 创建/销毁隔离执行环境 | Docker (dockerode) | 内部远程沙箱平台 |
| **AI Engine** | 在沙箱内执行 AI 编码任务，输出事件流 | Claude Code (Agent SDK) | 内部 AI Coding CLI |
| **Deploy Provider** | 触发构建发布，轮询状态 | CI/CD (GitHub Actions) / CLI | 其他发布系统 |

新增一个适配器只需实现对应接口，在 Module 中注册即可，无需改动上层逻辑。

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, Socket.io Client |
| 后端 | NestJS, TypeORM, MySQL, Socket.io, dockerode |
| AI 引擎 | @anthropic-ai/claude-agent-sdk |
| 部署 | Docker, docker-compose, Nginx |
| 包管理 | pnpm workspace (monorepo) |

## 项目结构

```
ai-coding-studio/
├── packages/
│   ├── web/                      # 前端 React 应用
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── workspace/    # 主工作区（对话 + 实时执行流 + 预览）
│   │   │   │   ├── settings/     # 设置页（注册、Token、引擎配置）
│   │   │   │   └── history/      # 任务历史（查看记录、继续迭代）
│   │   │   ├── stores/           # Zustand 状态管理（用户、工作区）
│   │   │   ├── hooks/            # useSocket（WebSocket 事件监听）
│   │   │   ├── lib/              # API 客户端、工具函数
│   │   │   └── components/       # shadcn/ui 组件
│   │   └── package.json
│   │
│   ├── server/                   # 后端 NestJS 服务
│   │   ├── src/
│   │   │   ├── entities/         # TypeORM 实体（User, Task, TaskMessage）
│   │   │   └── modules/
│   │   │       ├── auth/         # 用户注册、登录、配置管理
│   │   │       ├── git-provider/ # Git 平台交互（仓库列表、clone、分支）
│   │   │       ├── sandbox/      # 沙箱容器生命周期管理
│   │   │       ├── engine/       # AI 编码引擎（Claude Code SDK 集成）
│   │   │       ├── deploy/       # 发布管理（CI/CD 触发 + 状态轮询）
│   │   │       ├── task/         # 任务 CRUD + Orchestrator（核心编排）
│   │   │       └── stream/       # WebSocket 网关（实时事件推送）
│   │   └── package.json
│   │
│   └── shared/                   # 前后端共享的类型定义和常量
│       └── package.json
│
└── docker/
    ├── sandbox.Dockerfile        # 沙箱基础镜像（Node.js + Git + Claude Code）
    ├── server.Dockerfile         # 后端多阶段构建镜像
    ├── web.Dockerfile            # 前端构建 + Nginx 托管镜像
    ├── nginx.conf                # Nginx 配置（SPA + API/WS 反向代理）
    ├── docker-compose.yml        # 一键编排（MySQL + Server + Web）
    └── .env.example
```

## 快速开始

### 前置条件

- Node.js >= 18
- pnpm >= 9
- Docker（用于沙箱容器和 MySQL）

### 构建沙箱镜像

无论哪种启动方式，都需要先构建沙箱基础镜像（只需一次）。这个镜像是 AI 编码任务的运行环境，内置了 Node.js、Git 和 Claude Code CLI：

```bash
docker build -f docker/sandbox.Dockerfile -t ai-coding-studio-sandbox:latest .
```

### 方式一：本地开发

适合开发调试，前后端分别启动，支持热更新。

**1. 启动 MySQL**

```bash
docker run -d --name ai-coding-studio-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=ai_coding_studio \
  -p 3306:3306 \
  mysql:8.0
```

**2. 安装依赖**

```bash
pnpm install
```

**3. 启动后端**

```bash
cd packages/server
cp .env.example .env   # 按需修改数据库配置
pnpm start:dev
```

Server 运行在 `http://localhost:3001`，首次启动自动创建数据库表。

**4. 启动前端**（新开一个终端）

```bash
cd packages/web
pnpm dev
```

前端运行在 `http://localhost:3000`，Vite 自动代理 `/api` 和 `/socket.io` 到后端。

### 方式二：Docker Compose 部署

适合快速部署和演示，一条命令启动所有服务。

```bash
# 配置环境变量
cd docker
cp .env.example .env

# 一键启动（首次会自动构建镜像）
docker compose up -d
```

访问 `http://localhost:3030`

```bash
# 常用命令
docker compose ps                # 查看服务状态
docker compose logs -f server    # 查看后端日志
docker compose up -d --build     # 代码变更后重新构建
docker compose down              # 停止服务
docker compose down -v           # 停止并清除数据库数据
```

## 使用指南

### 第一步：注册和配置

打开页面后，先到「设置」页完成初始配置：

1. **注册账号** — 输入用户名
2. **选择 Git 平台** — GitHub 或 GitLab
3. **填写 Token** — 你的 Personal Access Token（用于访问仓库）
4. **选择 AI 引擎** — 当前支持 Claude Code
5. **配置预览 URL** — 预览域名模板，如 `https://{branch}.preview.example.com`

### 第二步：执行 AI 编码任务

进入「工作区」页：

1. **选择仓库** — 下拉列表会展示你有权限的所有仓库
2. **确认分支** — 系统自动从主分支切出新分支（如 `ai-studio/1712345678`）
3. **输入需求** — 用自然语言描述，比如：
   - "把首页 header 的高度从 64px 改成 48px，logo 相应缩小"
   - "在用户列表页添加一个搜索框，支持按用户名模糊搜索"
   - "修复移动端导航栏折叠后点击无响应的问题"
4. **观察执行** — 左侧实时展示 AI 的完整执行过程：
   - 💭 思考分析（紫色）— AI 理解你的需求
   - 🔧 工具调用（橙色）— 搜索文件、读取代码
   - 📝 文件编辑（绿色）— 修改代码，展示 diff
   - ✅ 完成确认 — 提交、发布状态
5. **预览效果** — 发布完成后，右侧 iframe 自动加载预览页面
6. **继续迭代** — 不满意就继续输入，在同一分支上修改

### 第三步：查看历史

「历史」页展示所有任务记录，包含仓库、分支、状态和时间。点击「继续迭代」可以回到工作区在原分支上继续修改。

## 环境变量

### Server (.env)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | `localhost` | MySQL 地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USERNAME` | `root` | MySQL 用户名 |
| `DB_PASSWORD` | `root` | MySQL 密码 |
| `DB_DATABASE` | `ai_coding_studio` | 数据库名 |
| `SANDBOX_IMAGE` | `ai-coding-studio-sandbox:latest` | 沙箱 Docker 镜像名称 |

### Docker Compose (.env)

包含上述 Server 变量，额外增加：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_ROOT_PASSWORD` | `root` | MySQL root 密码 |
| `MYSQL_DATABASE` | `ai_coding_studio` | 初始化数据库名 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 注册用户 |
| `POST` | `/api/auth/login` | 登录 |
| `GET` | `/api/auth/users/:id` | 获取用户信息 |
| `PUT` | `/api/auth/users/:id` | 更新用户配置 |
| `GET` | `/api/repos?userId=` | 获取用户的仓库列表 |
| `GET` | `/api/tasks?userId=` | 获取任务历史 |
| `GET` | `/api/tasks/:id` | 获取任务详情 |
| `POST` | `/api/orchestrator/execute` | 提交 AI 编码任务 |
| `WebSocket` | `/socket.io/` | 实时事件推送（task:event, task:status, task:error） |

## License

MIT
