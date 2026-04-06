<div align="center">

# 🤖 AI Coding Studio

**一句话需求，AI 帮你写代码、发布、预览，全程在浏览器里完成。**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 💡 这是什么

AI Coding Studio 是一个面向前端团队的 Web 平台。产品经理或开发者在页面上选择一个 Git 仓库，用自然语言描述想要的修改，平台会自动在远端沙箱里完成 AI 编码、提交、发布，你直接在页面里预览效果。不满意？继续说，AI 在同一分支上迭代。

**传统流程：**
> 提需求 → 排期 → 写代码 → 本地测试 → PR → Review → 合并 → 发布 → 验证

**用了 AI Coding Studio：**
> 💬 输入一句话 → 🤖 AI 自动编码提交发布 → 👀 页面里直接预览

## 🎯 适用场景

- 🧑‍💻 **前端开发者** — 快速迭代"改文案、调样式、加字段"这类小需求
- 🎨 **产品/设计人员** — 自然语言描述需求，不用等排期，即时看效果

## 🤔 为什么不直接用 GitHub Copilot Workspace / Claude Code？

| | GitHub Copilot Workspace | Claude App (连接 GitHub) | AI Coding Studio |
|---|---|---|---|
| **私有部署** | 不支持，SaaS only | 不支持，SaaS only | 可私有部署，代码不出内网 |
| **内部 Git 平台** | 仅 GitHub | 仅 GitHub | GitHub + GitLab，可扩展 |
| **AI 引擎** | 仅 Copilot | 仅 Claude | 可插拔（Claude Code、内部 AI 工具） |
| **发布集成** | 无 | 无 | 内置 CI/CD + CLI 发布，可集成内部发布系统 |
| **页面内预览** | 有 | 无 | 支持 iframe 预览或变更摘要 |
| **沙箱环境** | 托管 | 托管 | 自主可控（Docker / 内部沙箱） |
| **非技术人员** | 需要理解 PR 流程 | 需要理解 GitHub 操作 | 一句话 → 看效果，零门槛 |
| **定制能力** | 无 | 无 | 通过 CLAUDE.md 定制 AI 行为、Git 工作流 |
| **成本控制** | GitHub 定价 | Anthropic 定价 | 支持 MiniMax 等第三方代理，自选模型 |

**核心优势：自主可控 + 可定制 + 可集成内部基础设施。** 对于有内部 GitLab、内部发布系统、内部 AI 工具的团队，AI Coding Studio 是一个可以深度定制的自建方案，而不是受限于 SaaS 平台的能力边界。

## 🖥️ 界面预览

```
┌─ 左侧：对话区 ────────────────┐  ┌─ 右侧：预览区 ────────────┐
│  平台 GitHub | 引擎 Claude Code │  │                            │
│                                │  │  ┌──────────────────────┐  │
│  📦 my-org/web-app             │  │  │                      │  │
│  🌿 ai-studio/fix-header  ▼   │  │  │   iframe 实时预览      │  │
│                                │  │  │   修改后的页面效果      │  │
│  👤 把 header 改成 48px         │  │  │                      │  │
│                                │  │  └──────────────────────┘  │
│  🤖 💭 分析需求...              │  │                            │
│     🔧 Read src/Header.tsx      │  │                            │
│     🔧 Edit src/Header.tsx      │  │                            │
│     ✅ 完成 | 18.7s | $0.21    │  │                            │
│                                │  │                            │
│  [输入下一个需求...]             │  │                            │
└────────────────────────────────┘  └────────────────────────────┘
```

## ⚡ 核心流程

```
💬 输入需求
    ↓
📦 创建沙箱 → git clone 仓库
    ↓
🌿 Claude Code 自动创建语义化分支 (ai-studio/fix-header-height)
   （或 checkout 用户选择的已有分支继续迭代）
    ↓
🤖 Claude Code 在沙箱内执行编码任务（通过 CLAUDE.md 约束 git 工作流）
   ├── 读代码、理解上下文
   ├── 修改文件          ← WebSocket 实时推送到前端
   ├── git add + commit
   └── git push origin HEAD
    ↓
🚀 触发发布（CI/CD 或 CLI，可跳过）
    ↓
👀 前端 iframe 加载预览 → 🗑️ 销毁沙箱
    ↓
😐 不满意？继续输入 → 同一分支迭代（选择已有分支 → 重复上述流程）
```

> 💡 **分支是持久的状态载体，沙箱是临时的执行环境。** 任务完成即销毁沙箱，代码保留在分支上。Git 操作（创建分支、commit、push）全部由 Claude Code 在沙箱内完成，通过 `CLAUDE.md` 文件约束行为。

## 🏗️ 架构

```
┌─────────── Frontend (React + Vite) ──────────────────────────┐
│        仓库选择 ｜ 分支选择 ｜ 对话 + 实时执行流 ｜ iframe 预览 │
└──────────────────────────┬───────────────────────────────────┘
                      WebSocket (Socket.io)
┌──────────────────────────┴───────────────────────────────────┐
│                    Backend (NestJS)                           │
│                                                              │
│   ┌────────────── Task Orchestrator (编排核心) ────────────┐  │
│   │  clone 仓库 → 写入 CLAUDE.md → 启动 AI → 读取结果     │  │
│   │                                                        │  │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │  │
│   │  │   Git   │ │ Sandbox │ │   AI    │ │   Deploy    │ │  │
│   │  │Provider │ │Provider │ │ Engine  │ │  Provider   │ │  │
│   │  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────────┤ │  │
│   │  │✅GitHub │ │✅Docker │ │✅Claude │ │✅CI/CD      │ │  │
│   │  │🔜GitLab │ │🔜内部   │ │  Code   │ │✅CLI        │ │  │
│   │  │         │ │  沙箱   │ │🔜内部AI │ │             │ │  │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘ │  │
│   └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │                              │
    ┌────┴────┐                ┌────────┴────────┐
    │  MySQL  │                │  临时沙箱容器     │
    │ 任务记录 │                │  Node.js + Git + │
    └─────────┘                │  Claude Code CLI │
                               └─────────────────┘
```

**🔌 四层可插拔架构** — 每层通过 Interface + Adapter 模式，可独立替换扩展：

| 层级 | 当前实现 | 可扩展 |
|------|---------|--------|
| 🔗 Git Provider | GitHub (Octokit) | GitLab |
| 📦 Sandbox Provider | Docker (dockerode) | 内部远程沙箱 |
| 🤖 AI Engine | Claude Code CLI (`-p` + `stream-json`) | 内部 AI CLI |
| 🚀 Deploy Provider | CI/CD (GitHub Actions) / CLI | 其他发布系统 |

## 🛠️ 技术栈

| | 技术 |
|---|------|
| 🖥️ 前端 | React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · Zustand · Socket.io |
| ⚙️ 后端 | NestJS · TypeORM · MySQL · Socket.io · dockerode |
| 🤖 AI | Claude Code CLI (在沙箱容器内通过 `-p --output-format stream-json` 执行) |
| 🐳 部署 | Docker · docker-compose · Nginx |
| 📦 包管理 | pnpm workspace (monorepo) |

## 🚀 快速开始

### 前置条件

- 📗 Node.js >= 18
- 📦 pnpm >= 9
- 🐳 Docker

### 1️⃣ 构建沙箱镜像（只需一次）

沙箱是 AI 编码任务的运行环境，内置 Node.js + Git + Claude Code CLI，以非 root 用户 (`coder`) 运行：

```bash
docker build -f docker/sandbox.Dockerfile -t ai-coding-studio-sandbox:latest .
```

### 2️⃣ 启动服务

<details>
<summary>🔧 <strong>方式一：本地开发</strong>（支持热更新）</summary>

```bash
# 启动 MySQL（复用 docker-compose 配置）
cd docker && docker compose up -d mysql && cd ..

# 安装依赖
pnpm install

# 启动后端（终端 1）
cd packages/server
cp .env.example .env   # 必须配置 Claude Code 凭据，见下方环境变量说明
pnpm start:dev         # nodemon + ts-node，文件变化自动重启

# 启动前端（终端 2）
cd packages/web
pnpm dev
```

访问 `http://localhost:3000`

</details>

<details>
<summary>🐳 <strong>方式二：Docker Compose</strong>（一键部署）</summary>

```bash
cd docker
cp .env.example .env   # 必须配置 Claude Code 凭据
docker compose up -d
```

访问 `http://localhost:3030`

```bash
docker compose ps                # 查看状态
docker compose logs -f server    # 查看日志
docker compose up -d --build     # 重新构建
docker compose down              # 停止
```

</details>

### 3️⃣ 开始使用

1. 📋 打开「设置」页 → 注册用户 → 配置 GitHub Token
2. 🏠 回到「工作区」→ 选择仓库 → 选择分支（或留空自动创建）→ 输入需求
3. 👀 实时观察 AI 思考、搜索、编辑文件 → 自动 commit & push
4. 🔄 不满意？选择同一分支继续输入 → AI 在已有代码基础上迭代

## 📁 项目结构

```
ai-coding-studio/
├── 📂 packages/
│   ├── 📂 web/               # 前端 React 应用
│   │   └── src/
│   │       ├── pages/        # 工作区 · 设置 · 历史
│   │       ├── stores/       # 状态管理 (Zustand: user, workspace)
│   │       ├── hooks/        # useSocket (WebSocket 事件监听)
│   │       ├── lib/          # API 客户端 · cn 工具函数
│   │       └── components/   # UI 组件 (shadcn/ui)
│   ├── 📂 server/            # 后端 NestJS 服务
│   │   ├── src/
│   │   │   ├── entities/     # TypeORM 实体 (User, Task, TaskMessage)
│   │   │   └── modules/
│   │   │       ├── auth/         # 用户注册、登录、配置
│   │   │       ├── git-provider/ # Git 平台 (仓库列表、分支列表)
│   │   │       ├── sandbox/      # 沙箱容器生命周期 (Docker)
│   │   │       ├── engine/       # AI 引擎 (Claude Code stream-json)
│   │   │       ├── deploy/       # 发布 (CI/CD + CLI)
│   │   │       ├── task/         # Orchestrator + 任务 CRUD
│   │   │       └── stream/       # WebSocket 网关
│   │   └── logs/             # Claude Code 原始 stream-json 日志
│   └── 📂 shared/            # 共享类型 (CodingEvent, TaskStatus...)
└── 📂 docker/
    ├── sandbox.Dockerfile    # 沙箱镜像 (Node.js + Git + Claude Code + coder 用户)
    ├── server.Dockerfile     # 后端镜像
    ├── web.Dockerfile        # 前端镜像 + Nginx
    ├── nginx.conf            # SPA + API/WS 反向代理
    └── docker-compose.yml    # 服务编排 (mysql + server + web)
```

## ⚙️ 环境变量

### 数据库 & 沙箱

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | `localhost` | MySQL 地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USERNAME` | `root` | MySQL 用户名 |
| `DB_PASSWORD` | `root` | MySQL 密码 |
| `DB_DATABASE` | `ai_coding_studio` | 数据库名 |
| `SANDBOX_IMAGE` | `ai-coding-studio-sandbox:latest` | 沙箱 Docker 镜像 |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket 路径（Rancher Desktop 用 `~/.rd/docker.sock`） |

### Claude Code 凭据（二选一）

**直接使用 Anthropic API：**

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key |

**通过 MiniMax 代理：**

| 变量 | 值 |
|------|------|
| `ANTHROPIC_BASE_URL` | `https://api.minimaxi.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | MiniMax API Key |
| `ANTHROPIC_MODEL` | `MiniMax-M2.7` |
| `ANTHROPIC_SMALL_FAST_MODEL` | `MiniMax-M2.7` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `MiniMax-M2.7` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `MiniMax-M2.7` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `MiniMax-M2.7` |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `1` |
| `API_TIMEOUT_MS` | `3000000` |

## 🔍 调试

每次任务执行会将 Claude Code 的原始 `stream-json` 输出保存到 `packages/server/logs/task-{id}-{timestamp}.jsonl`，可用于排查 AI 执行细节。

## 📄 License

[MIT](LICENSE)
