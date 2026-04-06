# Plan 5: Docker 部署方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现平台容器化一键部署，包含沙箱基础镜像、前端 Nginx 镜像、后端 NestJS 镜像和 docker-compose 编排。

**Architecture:** 三个服务容器（web/server/mysql）+ 一个沙箱基础镜像。server 容器挂载宿主机 Docker socket 以创建沙箱容器。web 容器用 Nginx 托管前端静态资源并反向代理 API/WebSocket。

**Tech Stack:** Docker, docker-compose, Nginx, Node.js 20

---

### Task 1: 沙箱基础镜像

**Files:**
- Create: `docker/sandbox.Dockerfile`

- [ ] **Step 1: 创建 docker/sandbox.Dockerfile**

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code@latest

WORKDIR /workspace

# Default command: sleep (overridden at runtime)
CMD ["sleep", "600"]
```

- [ ] **Step 2: Commit**

```bash
git add docker/sandbox.Dockerfile
git commit -m "feat(docker): add sandbox base image Dockerfile"
```

---

### Task 2: 后端 Dockerfile

**Files:**
- Create: `docker/server.Dockerfile`

- [ ] **Step 1: 创建 docker/server.Dockerfile**

```dockerfile
FROM node:20-slim AS base
RUN npm install -g pnpm@9

# --- Build stage ---
FROM base AS build
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy package.json files for all packages
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build shared first, then server
RUN pnpm build:shared && pnpm build:server

# --- Production stage ---
FROM base AS production
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist

EXPOSE 3001

CMD ["node", "packages/server/dist/main.js"]
```

- [ ] **Step 2: Commit**

```bash
git add docker/server.Dockerfile
git commit -m "feat(docker): add server multi-stage Dockerfile"
```

---

### Task 3: 前端 Dockerfile + Nginx 配置

**Files:**
- Create: `docker/web.Dockerfile`
- Create: `docker/nginx.conf`

- [ ] **Step 1: 创建 docker/nginx.conf**

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://server:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket proxy
    location /socket.io/ {
        proxy_pass http://server:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 2: 创建 docker/web.Dockerfile**

```dockerfile
FROM node:20-slim AS base
RUN npm install -g pnpm@9

# --- Build stage ---
FROM base AS build
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

RUN pnpm build:shared && pnpm build:web

# --- Nginx stage ---
FROM nginx:alpine AS production

COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Commit**

```bash
git add docker/web.Dockerfile docker/nginx.conf
git commit -m "feat(docker): add web Dockerfile with Nginx config"
```

---

### Task 4: docker-compose 编排

**Files:**
- Create: `docker/docker-compose.yml`
- Create: `docker/.env.example`

- [ ] **Step 1: 创建 docker/.env.example**

```
MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=ai_coding_studio
DB_HOST=mysql
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=root
DB_DATABASE=ai_coding_studio
```

- [ ] **Step 2: 创建 docker/docker-compose.yml**

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-ai_coding_studio}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    build:
      context: ..
      dockerfile: docker/server.Dockerfile
    environment:
      DB_HOST: mysql
      DB_PORT: 3306
      DB_USERNAME: ${DB_USERNAME:-root}
      DB_PASSWORD: ${DB_PASSWORD:-root}
      DB_DATABASE: ${DB_DATABASE:-ai_coding_studio}
    ports:
      - "3001:3001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      mysql:
        condition: service_healthy

  web:
    build:
      context: ..
      dockerfile: docker/web.Dockerfile
    ports:
      - "80:80"
    depends_on:
      - server

volumes:
  mysql_data:
```

- [ ] **Step 3: Commit**

```bash
git add docker/docker-compose.yml docker/.env.example
git commit -m "feat(docker): add docker-compose with mysql, server, web services"
```

---

### Task 5: 添加 .dockerignore 和根目录 README

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: 创建 .dockerignore**

```
node_modules
dist
.git
.env
.env.local
*.log
.superpowers
docs
.claude
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```
