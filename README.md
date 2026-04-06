# AI Coding Studio

内部 Web 平台，通过自然语言对话驱动 AI Coding，快速迭代前端需求。

选择 Git 仓库 → 输入需求 → 远端沙箱 AI 编码 → 自动发布 → 页面内预览 → 不满意继续迭代。

## 架构

```
┌─────────────────────────────────────────────────┐
│              Frontend (React + Vite)             │
│   仓库选择 ｜ 对话 + 实时执行流 ｜ iframe 预览   │
│                    │ WebSocket                   │
└────────────────────┼────────────────────────────┘
                     │
┌────────────────────┼────────────────────────────┐
│             Backend (NestJS)                     │
│          Task Orchestrator (编排核心)             │
│     ┌──────────┬──────────┬──────────┐          │
│     │   Git    │ Sandbox  │    AI    │          │
│     │ Provider │ Provider │  Engine  │          │
│     ├──────────┼──────────┼──────────┤          │
│     │ GitHub   │ Docker   │ Claude   │          │
│     │ GitLab*  │ Internal*│ Code SDK │          │
│     └──────────┴──────────┤ Internal*│          │
│                           └──────────┘          │
│     ┌──────────┐                                │
│     │  Deploy  │                                │
│     │ Provider │                                │
│     ├──────────┤                                │
│     │ CI/CD    │                                │
│     │ CLI      │                                │
│     └──────────┘                                │
└─────────────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          │   临时沙箱容器       │
          │  Node.js + Git +    │
          │  Claude Code CLI    │
          └─────────────────────┘

* 标记为未来扩展
```

**四层可插拔抽象：**

| 层级 | 当前实现 | 可扩展 |
|------|---------|--------|
| Git Provider | GitHub | GitLab |
| Sandbox Provider | Docker | 内部远程沙箱 |
| AI Engine | Claude Code SDK | 内部 AI CLI |
| Deploy Provider | CI/CD (GitHub Actions) / CLI | 其他发布方式 |

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
│   ├── web/                  # 前端
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── workspace/    # 主工作区（对话 + 预览）
│   │   │   │   ├── settings/     # 设置页
│   │   │   │   └── history/      # 任务历史
│   │   │   ├── stores/           # Zustand 状态管理
│   │   │   ├── hooks/            # useSocket 等
│   │   │   ├── lib/              # API 客户端、工具函数
│   │   │   └── components/       # shadcn/ui 组件
│   │   └── package.json
│   ├── server/               # 后端
│   │   ├── src/
│   │   │   ├── entities/         # TypeORM 实体
│   │   │   └── modules/
│   │   │       ├── auth/         # 用户认证
│   │   │       ├── git-provider/ # Git 平台交互
│   │   │       ├── sandbox/      # 沙箱管理
│   │   │       ├── engine/       # AI 引擎
│   │   │       ├── deploy/       # 发布管理
│   │   │       ├── task/         # 任务 CRUD + Orchestrator
│   │   │       └── stream/       # WebSocket 网关
│   │   └── package.json
│   └── shared/               # 共享类型和常量
│       └── package.json
└── docker/
    ├── sandbox.Dockerfile        # 沙箱基础镜像
    ├── server.Dockerfile         # 后端镜像
    ├── web.Dockerfile            # 前端镜像
    ├── nginx.conf                # Nginx 配置
    ├── docker-compose.yml        # 容器编排
    └── .env.example
```

## 快速开始

### 前置条件

- Node.js >= 18
- pnpm >= 9
- Docker（用于沙箱容器）
- MySQL 8.0（本地开发可用 Docker 启动）

### 构建沙箱镜像

无论本地开发还是容器部署，都需要先构建沙箱镜像（只需一次）：

```bash
docker build -f docker/sandbox.Dockerfile -t ai-coding-studio-sandbox:latest .
```

### 方式一：本地开发

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

Server 运行在 `http://localhost:3001`。首次启动会自动通过 TypeORM synchronize 创建数据库表。

**4. 启动前端**

```bash
cd packages/web
pnpm dev
```

前端运行在 `http://localhost:3000`，Vite 自动代理 `/api` 和 `/socket.io` 到后端 3001 端口。

### 方式二：Docker Compose 部署

**1. 配置环境变量**

```bash
cd docker
cp .env.example .env
# 按需编辑 .env
```

**2. 一键启动**

```bash
docker compose up -d
```

首次启动会自动构建 web 和 server 镜像。启动顺序：MySQL（健康检查通过）→ Server → Web。

**3. 访问**

前端页面：`http://localhost:3030`

**常用命令：**

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f server
docker compose logs -f web

# 重新构建并启动（代码变更后）
docker compose up -d --build

# 停止
docker compose down

# 停止并清除数据
docker compose down -v
```

## 使用方式

### 1. 注册配置

首次使用需要在「设置」页完成：

- 输入用户名注册
- 选择 Git 平台（GitHub / GitLab）
- 填写 Personal Access Token
- 选择 AI 引擎（当前支持 Claude Code）
- 配置预览 URL 模板（如 `https://{branch}.preview.example.com`）

### 2. 执行任务

在「工作区」页：

1. **选择仓库** — 下拉选择有权限的仓库，系统自动从主分支切出新分支
2. **输入需求** — 用自然语言描述要做的修改
3. **查看执行过程** — 左侧实时展示 AI 的思考过程、文件搜索、代码编辑、终端输出
4. **预览效果** — 执行完成并发布后，右侧 iframe 自动加载预览
5. **迭代修改** — 不满意可继续输入新指令，在同一分支上迭代

### 3. 查看历史

在「历史」页可以查看所有任务记录，点击「继续迭代」可回到工作区在原分支上继续修改。

## 核心流程

```
用户输入需求
    ↓
从主分支切出新分支（或复用已有分支）
    ↓
创建临时沙箱容器，clone 仓库并 checkout 分支
    ↓
在沙箱内启动 AI Engine 执行编码任务
    ↓ （WebSocket 实时推送执行事件到前端）
    ↓
执行完成 → commit + push 到远端分支
    ↓
触发发布（CI/CD 或 CLI）
    ↓ 失败自动重试，最多 2 次
    ↓
发布成功 → 前端 iframe 加载预览 URL
    ↓
销毁沙箱容器
    ↓
用户继续对话 → 在同一分支上重复上述流程
```

关键设计：**分支是持久的状态载体，沙箱是临时的执行环境。**

## 环境变量

### Server (.env)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | `localhost` | MySQL 地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USERNAME` | `root` | MySQL 用户名 |
| `DB_PASSWORD` | `root` | MySQL 密码 |
| `DB_DATABASE` | `ai_coding_studio` | 数据库名 |
| `SANDBOX_IMAGE` | `ai-coding-studio-sandbox:latest` | 沙箱 Docker 镜像名 |

### Docker Compose (.env)

继承上述 Server 变量，额外包含：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_ROOT_PASSWORD` | `root` | MySQL root 密码 |
| `MYSQL_DATABASE` | `ai_coding_studio` | 初始化数据库名 |

## License

MIT
