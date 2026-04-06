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

## 🖥️ 界面预览

```
┌─ 左侧：对话区 ────────────────┐  ┌─ 右侧：预览区 ────────────┐
│                                │  │                            │
│  📦 my-org/web-app             │  │  ┌──────────────────────┐  │
│  🌿 ai-studio/fix-header       │  │  │                      │  │
│                                │  │  │   iframe 实时预览      │  │
│  👤 把 header 改成 48px         │  │  │   修改后的页面效果      │  │
│                                │  │  │                      │  │
│  🤖 💭 分析需求...              │  │  └──────────────────────┘  │
│     🔍 搜索 Header.tsx          │  │                            │
│     📝 修改 height: 48px       │  │                            │
│     ✅ 完成，已发布              │  │                            │
│                                │  │                            │
│  [输入下一个需求...]             │  │                            │
└────────────────────────────────┘  └────────────────────────────┘
```

## ⚡ 核心流程

```
💬 输入需求 → 🌿 切分支 → 📦 创建沙箱 → 🤖 AI 编码
                                              ↓
         🗑️ 销毁沙箱 ← 👀 预览效果 ← 🚀 自动发布 ← ✅ 提交代码
                                              ↓
                                    😐 不满意？继续说 → 🔄 同一分支迭代
```

> 💡 **分支是持久的状态载体，沙箱是临时的执行环境。** 任务完成即销毁沙箱，代码保留在分支上。

## 🏗️ 架构

```
┌─────────── Frontend (React + Vite) ──────────────────────────┐
│        仓库选择 ｜ 对话 + 实时执行流 ｜ iframe 预览            │
└──────────────────────────┬───────────────────────────────────┘
                      WebSocket
┌──────────────────────────┴───────────────────────────────────┐
│                    Backend (NestJS)                           │
│                                                              │
│   ┌────────────── Task Orchestrator (编排核心) ────────────┐  │
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
```

**🔌 四层可插拔架构** — 每层通过 Interface + Adapter 模式，可独立替换扩展：

| 层级 | 当前实现 | 可扩展 |
|------|---------|--------|
| 🔗 Git Provider | GitHub | GitLab |
| 📦 Sandbox Provider | Docker | 内部远程沙箱 |
| 🤖 AI Engine | Claude Code SDK | 内部 AI CLI |
| 🚀 Deploy Provider | CI/CD / CLI | 其他发布系统 |

## 🛠️ 技术栈

| | 技术 |
|---|------|
| 🖥️ 前端 | React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · Zustand · Socket.io |
| ⚙️ 后端 | NestJS · TypeORM · MySQL · Socket.io · dockerode |
| 🤖 AI | @anthropic-ai/claude-agent-sdk |
| 🐳 部署 | Docker · docker-compose · Nginx |
| 📦 包管理 | pnpm workspace (monorepo) |

## 🚀 快速开始

### 前置条件

- 📗 Node.js >= 18
- 📦 pnpm >= 9
- 🐳 Docker

### 1️⃣ 构建沙箱镜像（只需一次）

沙箱是 AI 编码任务的运行环境，内置 Node.js + Git + Claude Code CLI：

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
cp .env.example .env
pnpm start:dev

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
cp .env.example .env
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

1. 📋 打开「设置」页 → 注册用户 → 配置 Git Token
2. 🏠 回到「工作区」→ 选择仓库 → 输入需求
3. 👀 观察 AI 实时执行过程 → 预览效果 → 继续迭代

## 📁 项目结构

```
ai-coding-studio/
├── 📂 packages/
│   ├── 📂 web/               # 前端 React 应用
│   │   └── src/
│   │       ├── pages/        # 工作区 · 设置 · 历史
│   │       ├── stores/       # 状态管理 (Zustand)
│   │       ├── hooks/        # WebSocket Hook
│   │       └── components/   # UI 组件 (shadcn/ui)
│   ├── 📂 server/            # 后端 NestJS 服务
│   │   └── src/modules/
│   │       ├── auth/         # 用户认证
│   │       ├── git-provider/ # Git 平台对接
│   │       ├── sandbox/      # 沙箱管理
│   │       ├── engine/       # AI 引擎
│   │       ├── deploy/       # 发布管理
│   │       ├── task/         # 任务编排 (Orchestrator)
│   │       └── stream/       # WebSocket 推送
│   └── 📂 shared/            # 共享类型和常量
└── 📂 docker/                # Docker 配置
    ├── sandbox.Dockerfile    # 沙箱镜像
    ├── server.Dockerfile     # 后端镜像
    ├── web.Dockerfile        # 前端镜像
    └── docker-compose.yml    # 服务编排
```

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | `localhost` | MySQL 地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USERNAME` | `root` | MySQL 用户名 |
| `DB_PASSWORD` | `root` | MySQL 密码 |
| `DB_DATABASE` | `ai_coding_studio` | 数据库名 |
| `SANDBOX_IMAGE` | `ai-coding-studio-sandbox:latest` | 沙箱镜像名称 |

## 📄 License

[MIT](LICENSE)
