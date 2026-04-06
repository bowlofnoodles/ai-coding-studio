# Plan 4: 前端页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现前端三个核心页面（主工作区、设置页、任务历史页），包含路由、状态管理、WebSocket 连接、API 调用层。

**Architecture:** React Router 管理路由，Zustand 管理全局状态（用户信息、当前任务、WebSocket 事件流），Socket.io client 连接后端实时接收事件。页面组件使用 shadcn/ui + Tailwind 构建。

**Tech Stack:** React 18, TypeScript, React Router, Zustand, Socket.io client, Tailwind CSS, shadcn/ui, lucide-react

---

### Task 1: API 客户端 + Socket Hook

**Files:**
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/hooks/useSocket.ts`

- [ ] **Step 1: 创建 API 客户端 packages/web/src/lib/api.ts**

```typescript
const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || res.statusText);
  }

  return res.json();
}

export const api = {
  auth: {
    register: (data: { username: string; gitPlatform: string; gitToken: string }) =>
      request<{ id: number; username: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (username: string) =>
      request<{ id: number; username: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    getUser: (id: number) =>
      request<Record<string, unknown>>(`/auth/users/${id}`),
    updateUser: (id: number, data: Record<string, unknown>) =>
      request<Record<string, unknown>>(`/auth/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  tasks: {
    list: (userId: number) =>
      request<Array<Record<string, unknown>>>(`/tasks?userId=${userId}`),
    get: (id: number) =>
      request<Record<string, unknown>>(`/tasks/${id}`),
    execute: (data: {
      userId: number;
      repoUrl: string;
      repoFullName: string;
      branchName: string;
      baseBranch: string;
      prompt: string;
      previewUrlTemplate: string;
      apiKey: string;
    }) =>
      request<{ status: string }>('/orchestrator/execute', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  repos: {
    list: (userId: number) =>
      request<Array<{ id: string; name: string; fullName: string; cloneUrl: string; defaultBranch: string }>>(`/repos?userId=${userId}`),
  },
};
```

- [ ] **Step 2: 创建 Socket Hook packages/web/src/hooks/useSocket.ts**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { CodingEvent } from '@ai-coding-studio/shared';

interface TaskEvent {
  taskId: number;
  event: CodingEvent;
  timestamp: number;
}

interface TaskStatus {
  taskId: number;
  status: string;
  previewUrl?: string;
  timestamp: number;
}

interface TaskError {
  taskId: number;
  message: string;
  timestamp: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const subscribe = useCallback((taskId: number) => {
    socketRef.current?.emit('subscribe', String(taskId));
  }, []);

  const unsubscribe = useCallback((taskId: number) => {
    socketRef.current?.emit('unsubscribe', String(taskId));
  }, []);

  const onTaskEvent = useCallback(
    (callback: (data: TaskEvent) => void) => {
      socketRef.current?.on('task:event', callback);
      return () => {
        socketRef.current?.off('task:event', callback);
      };
    },
    [],
  );

  const onTaskStatus = useCallback(
    (callback: (data: TaskStatus) => void) => {
      socketRef.current?.on('task:status', callback);
      return () => {
        socketRef.current?.off('task:status', callback);
      };
    },
    [],
  );

  const onTaskError = useCallback(
    (callback: (data: TaskError) => void) => {
      socketRef.current?.on('task:error', callback);
      return () => {
        socketRef.current?.off('task:error', callback);
      };
    },
    [],
  );

  return { subscribe, unsubscribe, onTaskEvent, onTaskStatus, onTaskError };
}
```

- [ ] **Step 3: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/api.ts packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): add API client and WebSocket hook"
```

---

### Task 2: Zustand Store — 全局状态管理

**Files:**
- Create: `packages/web/src/stores/user.ts`
- Create: `packages/web/src/stores/workspace.ts`

- [ ] **Step 1: 创建用户 Store packages/web/src/stores/user.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  userId: number | null;
  username: string | null;
  setUser: (userId: number, username: string) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      setUser: (userId, username) => set({ userId, username }),
      clearUser: () => set({ userId: null, username: null }),
    }),
    {
      name: 'ai-coding-studio-user',
    },
  ),
);
```

- [ ] **Step 2: 创建工作区 Store packages/web/src/stores/workspace.ts**

```typescript
import { create } from 'zustand';
import type { CodingEvent } from '@ai-coding-studio/shared';

interface Repo {
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
}

interface WorkspaceState {
  // Repo selection
  repos: Repo[];
  selectedRepo: Repo | null;
  branchName: string;
  setRepos: (repos: Repo[]) => void;
  selectRepo: (repo: Repo) => void;
  setBranchName: (name: string) => void;

  // Task execution
  currentTaskId: number | null;
  taskStatus: string | null;
  events: CodingEvent[];
  previewUrl: string | null;
  isExecuting: boolean;
  error: string | null;

  setCurrentTask: (taskId: number) => void;
  setTaskStatus: (status: string) => void;
  addEvent: (event: CodingEvent) => void;
  setPreviewUrl: (url: string) => void;
  setError: (error: string | null) => void;
  setIsExecuting: (executing: boolean) => void;
  resetExecution: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  repos: [],
  selectedRepo: null,
  branchName: '',
  setRepos: (repos) => set({ repos }),
  selectRepo: (repo) =>
    set({
      selectedRepo: repo,
      branchName: `ai-studio/${Date.now()}`,
    }),
  setBranchName: (branchName) => set({ branchName }),

  currentTaskId: null,
  taskStatus: null,
  events: [],
  previewUrl: null,
  isExecuting: false,
  error: null,

  setCurrentTask: (taskId) => set({ currentTaskId: taskId }),
  setTaskStatus: (status) => set({ taskStatus: status }),
  addEvent: (event) =>
    set((state) => ({ events: [...state.events, event] })),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setError: (error) => set({ error }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  resetExecution: () =>
    set({
      currentTaskId: null,
      taskStatus: null,
      events: [],
      previewUrl: null,
      isExecuting: false,
      error: null,
    }),
}));
```

- [ ] **Step 3: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/stores/
git commit -m "feat(web): add Zustand stores for user and workspace state"
```

---

### Task 3: 安装 shadcn/ui 基础组件

**Files:**
- 通过 shadcn CLI 安装: Button, Input, Select, Card, ScrollArea, Badge, Separator

- [ ] **Step 1: 安装 shadcn/ui 组件**

运行以下命令逐个安装（shadcn CLI 会创建文件到 src/components/ui/）：

```bash
cd packages/web
npx shadcn@latest add button -y
npx shadcn@latest add input -y
npx shadcn@latest add select -y
npx shadcn@latest add card -y
npx shadcn@latest add scroll-area -y
npx shadcn@latest add badge -y
npx shadcn@latest add separator -y
```

如果 shadcn CLI 报错或需要交互确认，手动创建对应组件文件也可以。关键是最终在 `src/components/ui/` 下有这些组件可用。

- [ ] **Step 2: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/
git commit -m "feat(web): add shadcn/ui base components"
```

---

### Task 4: 主工作区页面 — 对话 + 执行区（左侧）

**Files:**
- Create: `packages/web/src/pages/workspace/index.tsx`
- Create: `packages/web/src/pages/workspace/RepoSelector.tsx`
- Create: `packages/web/src/pages/workspace/ChatPanel.tsx`
- Create: `packages/web/src/pages/workspace/EventBlock.tsx`
- Create: `packages/web/src/pages/workspace/PromptInput.tsx`

- [ ] **Step 1: 创建 RepoSelector packages/web/src/pages/workspace/RepoSelector.tsx**

```tsx
import { useEffect } from 'react';
import { useUserStore } from '@/stores/user';
import { useWorkspaceStore } from '@/stores/workspace';
import { api } from '@/lib/api';

export function RepoSelector() {
  const userId = useUserStore((s) => s.userId);
  const repos = useWorkspaceStore((s) => s.repos);
  const selectedRepo = useWorkspaceStore((s) => s.selectedRepo);
  const branchName = useWorkspaceStore((s) => s.branchName);
  const setRepos = useWorkspaceStore((s) => s.setRepos);
  const selectRepo = useWorkspaceStore((s) => s.selectRepo);

  useEffect(() => {
    if (userId) {
      api.repos.list(userId).then(setRepos).catch(console.error);
    }
  }, [userId, setRepos]);

  return (
    <div className="border-b border-gray-800 bg-gray-900/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-8 shrink-0">仓库</span>
        <select
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-purple-500"
          value={selectedRepo?.fullName ?? ''}
          onChange={(e) => {
            const repo = repos.find((r) => r.fullName === e.target.value);
            if (repo) selectRepo(repo);
          }}
        >
          <option value="">选择仓库...</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.fullName}>
              {repo.fullName}
            </option>
          ))}
        </select>
      </div>
      {selectedRepo && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-8 shrink-0">分支</span>
          <span className="text-sm text-purple-400 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5">
            {branchName}
          </span>
          <span className="text-xs text-gray-600">
            ← 从 {selectedRepo.defaultBranch} 切出
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 EventBlock packages/web/src/pages/workspace/EventBlock.tsx**

```tsx
import type { CodingEvent } from '@ai-coding-studio/shared';

const EVENT_STYLES: Record<string, { border: string; icon: string; label: string }> = {
  thinking: { border: 'border-purple-500', icon: '💭', label: '思考' },
  text: { border: 'border-blue-500', icon: '💬', label: '回复' },
  tool_use: { border: 'border-amber-500', icon: '🔧', label: '工具调用' },
  tool_result: { border: 'border-green-500', icon: '📄', label: '执行结果' },
  complete: { border: 'border-green-500', icon: '✅', label: '完成' },
  error: { border: 'border-red-500', icon: '❌', label: '错误' },
  session_init: { border: 'border-gray-500', icon: '🚀', label: '会话启动' },
};

export function EventBlock({ event }: { event: CodingEvent }) {
  const style = EVENT_STYLES[event.type] ?? EVENT_STYLES.text;

  return (
    <div
      className={`bg-gray-900/50 border-l-2 ${style.border} rounded-r px-3 py-2 mb-2`}
    >
      <div className="text-xs text-gray-500 mb-1">
        {style.icon} {style.label}
      </div>
      <div className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
        {renderContent(event)}
      </div>
    </div>
  );
}

function renderContent(event: CodingEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.content;
    case 'text':
      return event.content;
    case 'tool_use':
      return `${event.toolName}\n${JSON.stringify(event.input, null, 2)}`;
    case 'tool_result':
      return `${event.toolName}: ${event.output}`;
    case 'complete':
      return `${event.result}\n耗时: ${(event.durationMs / 1000).toFixed(1)}s | 费用: $${event.costUsd.toFixed(4)}`;
    case 'error':
      return event.message;
    case 'session_init':
      return `模型: ${event.model} | 会话: ${event.sessionId}`;
    default:
      return JSON.stringify(event);
  }
}
```

- [ ] **Step 3: 创建 ChatPanel packages/web/src/pages/workspace/ChatPanel.tsx**

```tsx
import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspace';
import { EventBlock } from './EventBlock';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export function ChatPanel({ messages }: { messages: Message[] }) {
  const events = useWorkspaceStore((s) => s.events);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const taskStatus = useWorkspaceStore((s) => s.taskStatus);
  const error = useWorkspaceStore((s) => s.error);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${
                msg.role === 'user' ? 'bg-purple-500' : 'bg-amber-500'
              }`}
            >
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <span className="text-xs text-gray-500">
              {msg.role === 'user' ? '你' : 'AI'}
            </span>
          </div>
          <div className="ml-8 bg-gray-800/50 rounded-lg p-3 text-sm text-gray-200">
            {msg.content}
          </div>
        </div>
      ))}

      {/* AI execution events */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs text-white">
              AI
            </div>
            <span className="text-xs text-gray-500">Claude Code</span>
            {isExecuting && (
              <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">
                执行中
              </span>
            )}
          </div>
          <div className="ml-8">
            {events.map((event, i) => (
              <EventBlock key={i} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="ml-8 bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Status display */}
      {taskStatus && !isExecuting && !error && (
        <div className="ml-8 text-xs text-gray-500">
          状态: {taskStatus}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 创建 PromptInput packages/web/src/pages/workspace/PromptInput.tsx**

```tsx
import { useState } from 'react';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled: boolean;
}

export function PromptInput({ onSubmit, disabled }: PromptInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <div className="border-t border-gray-800 p-3">
      <div className="flex gap-2">
        <input
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-purple-500 placeholder-gray-500"
          placeholder="描述你的需求..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={disabled}
        />
        <button
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建主工作区页面 packages/web/src/pages/workspace/index.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '@/stores/user';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { RepoSelector } from './RepoSelector';
import { ChatPanel } from './ChatPanel';
import { PromptInput } from './PromptInput';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export function WorkspacePage() {
  const userId = useUserStore((s) => s.userId);
  const selectedRepo = useWorkspaceStore((s) => s.selectedRepo);
  const branchName = useWorkspaceStore((s) => s.branchName);
  const currentTaskId = useWorkspaceStore((s) => s.currentTaskId);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);

  const setCurrentTask = useWorkspaceStore((s) => s.setCurrentTask);
  const setTaskStatus = useWorkspaceStore((s) => s.setTaskStatus);
  const addEvent = useWorkspaceStore((s) => s.addEvent);
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl);
  const setError = useWorkspaceStore((s) => s.setError);
  const setIsExecuting = useWorkspaceStore((s) => s.setIsExecuting);
  const resetExecution = useWorkspaceStore((s) => s.resetExecution);

  const [messages, setMessages] = useState<Message[]>([]);
  const { subscribe, onTaskEvent, onTaskStatus, onTaskError } = useSocket();

  // Subscribe to task events
  useEffect(() => {
    if (!currentTaskId) return;

    subscribe(currentTaskId);

    const unsub1 = onTaskEvent((data) => {
      if (data.taskId === currentTaskId) {
        addEvent(data.event);
      }
    });

    const unsub2 = onTaskStatus((data) => {
      if (data.taskId === currentTaskId) {
        setTaskStatus(data.status);
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
        }
        if (data.status === 'deployed' || data.status === 'deploy_failed' || data.status === 'failed') {
          setIsExecuting(false);
        }
      }
    });

    const unsub3 = onTaskError((data) => {
      if (data.taskId === currentTaskId) {
        setError(data.message);
        setIsExecuting(false);
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [currentTaskId, subscribe, onTaskEvent, onTaskStatus, onTaskError, addEvent, setTaskStatus, setPreviewUrl, setError, setIsExecuting]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!userId || !selectedRepo) return;

      resetExecution();
      setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
      setIsExecuting(true);

      try {
        const result = await api.tasks.execute({
          userId,
          repoUrl: selectedRepo.cloneUrl,
          repoFullName: selectedRepo.fullName,
          branchName,
          baseBranch: selectedRepo.defaultBranch,
          prompt,
          previewUrlTemplate: `https://${branchName}.preview.example.com`,
          apiKey: '', // Will be configured via settings
        });

        // The task ID comes back from WebSocket init event
        // For now we track via status
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to execute task');
        setIsExecuting(false);
      }
    },
    [userId, selectedRepo, branchName, resetExecution, setIsExecuting, setError],
  );

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Left: Chat + Execution */}
      <div className="w-[45%] border-r border-gray-800 flex flex-col">
        <RepoSelector />
        <ChatPanel messages={messages} />
        <PromptInput
          onSubmit={handleSubmit}
          disabled={isExecuting || !selectedRepo}
        />
      </div>

      {/* Right: Preview */}
      <div className="w-[55%] flex flex-col">
        <div className="border-b border-gray-800 bg-gray-900/50 p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">预览</span>
            {previewUrl && (
              <span className="text-xs text-gray-500">{previewUrl}</span>
            )}
          </div>
          <div className="flex gap-2">
            {previewUrl && (
              <>
                <button
                  className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded transition-colors"
                  onClick={() => {
                    const iframe = document.querySelector('iframe');
                    if (iframe) iframe.src = iframe.src;
                  }}
                >
                  🔄 刷新
                </button>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded transition-colors"
                >
                  ↗ 新窗口
                </a>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 bg-white">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-900">
              <div className="text-center text-gray-600">
                <p className="text-lg mb-2">预览区域</p>
                <p className="text-sm">任务完成后将在此显示预览效果</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/workspace/
git commit -m "feat(web): add workspace page with chat, events, and preview"
```

---

### Task 5: 设置页

**Files:**
- Create: `packages/web/src/pages/settings/index.tsx`

- [ ] **Step 1: 创建设置页 packages/web/src/pages/settings/index.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useUserStore } from '@/stores/user';
import { api } from '@/lib/api';

export function SettingsPage() {
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const setUser = useUserStore((s) => s.setUser);

  const [gitPlatform, setGitPlatform] = useState('github');
  const [gitToken, setGitToken] = useState('');
  const [aiEngine, setAiEngine] = useState('claude-code');
  const [previewUrlTemplate, setPreviewUrlTemplate] = useState(
    'https://{branch}.preview.example.com',
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Registration form (if no user)
  const [regUsername, setRegUsername] = useState('');

  useEffect(() => {
    if (userId) {
      api.auth.getUser(userId).then((user) => {
        setGitPlatform((user.gitPlatform as string) ?? 'github');
        setAiEngine((user.aiEnginePreference as string) ?? 'claude-code');
      }).catch(console.error);
    }
  }, [userId]);

  const handleRegister = async () => {
    if (!regUsername.trim() || !gitToken.trim()) return;
    try {
      const user = await api.auth.register({
        username: regUsername.trim(),
        gitPlatform,
        gitToken,
      });
      setUser(user.id, user.username);
      setMessage('注册成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '注册失败');
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await api.auth.updateUser(userId, {
        gitPlatform,
        gitToken: gitToken || undefined,
        aiEnginePreference: aiEngine,
      });
      setMessage('设置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-8">设置</h1>

        {!userId ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">注册 / 登录</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">用户名</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="输入用户名"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Git 平台
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={gitPlatform}
                  onChange={(e) => setGitPlatform(e.target.value)}
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Personal Access Token
                </label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  placeholder="ghp_xxxx 或 glpat-xxxx"
                />
              </div>
              <button
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                onClick={handleRegister}
              >
                注册
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              当前用户: <span className="text-gray-200">{username}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Git 平台
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={gitPlatform}
                  onChange={(e) => setGitPlatform(e.target.value)}
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  更新 Personal Access Token
                </label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  placeholder="留空则不更新"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  AI 引擎
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={aiEngine}
                  onChange={(e) => setAiEngine(e.target.value)}
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="internal" disabled>
                    内部 AI 工具 (即将支持)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  预览 URL 模板
                </label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={previewUrlTemplate}
                  onChange={(e) => setPreviewUrlTemplate(e.target.value)}
                  placeholder="https://{branch}.preview.example.com"
                />
                <p className="text-xs text-gray-600 mt-1">
                  使用 {'{branch}'} 作为分支名占位符
                </p>
              </div>

              <button
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-green-400">{message}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/settings/
git commit -m "feat(web): add settings page with user registration and config"
```

---

### Task 6: 任务历史页

**Files:**
- Create: `packages/web/src/pages/history/index.tsx`

- [ ] **Step 1: 创建任务历史页 packages/web/src/pages/history/index.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/stores/user';
import { useWorkspaceStore } from '@/stores/workspace';
import { api } from '@/lib/api';
import { TaskStatus } from '@ai-coding-studio/shared';

interface TaskRecord {
  id: number;
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  prompt: string;
  status: string;
  previewUrl: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  [TaskStatus.PENDING]: { text: '等待中', color: 'text-gray-400' },
  [TaskStatus.SANDBOX_READY]: { text: '沙箱就绪', color: 'text-blue-400' },
  [TaskStatus.EXECUTING]: { text: '执行中', color: 'text-amber-400' },
  [TaskStatus.COMPLETED]: { text: '已完成', color: 'text-green-400' },
  [TaskStatus.DEPLOYING]: { text: '发布中', color: 'text-blue-400' },
  [TaskStatus.DEPLOYED]: { text: '已发布', color: 'text-green-400' },
  [TaskStatus.DEPLOY_FAILED]: { text: '发布失败', color: 'text-red-400' },
  [TaskStatus.FAILED]: { text: '失败', color: 'text-red-400' },
};

export function HistoryPage() {
  const userId = useUserStore((s) => s.userId);
  const navigate = useNavigate();
  const setBranchName = useWorkspaceStore((s) => s.setBranchName);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.tasks
      .list(userId)
      .then((data) => setTasks(data as unknown as TaskRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const handleContinue = (task: TaskRecord) => {
    setBranchName(task.branchName);
    navigate('/');
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <p className="text-gray-500">请先在设置页登录</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-8">任务历史</h1>

        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : tasks.length === 0 ? (
          <p className="text-gray-500">暂无任务记录</p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const statusInfo = STATUS_LABELS[task.status] ?? {
                text: task.status,
                color: 'text-gray-400',
              };

              return (
                <div
                  key={task.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">
                        {task.prompt}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>{task.repoUrl.split('/').slice(-2).join('/')}</span>
                        <span className="text-purple-400">{task.branchName}</span>
                        <span className={statusInfo.color}>{statusInfo.text}</span>
                        <span>
                          {new Date(task.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {task.previewUrl && (
                        <a
                          href={task.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded transition-colors"
                        >
                          预览
                        </a>
                      )}
                      <button
                        className="text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 px-3 py-1.5 rounded transition-colors"
                        onClick={() => handleContinue(task)}
                      >
                        继续迭代
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/history/
git commit -m "feat(web): add task history page"
```

---

### Task 7: 更新路由和全局导航

**Files:**
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: 更新 packages/web/src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { WorkspacePage } from '@/pages/workspace';
import { SettingsPage } from '@/pages/settings';
import { HistoryPage } from '@/pages/history';

function NavBar() {
  const location = useLocation();

  const links = [
    { to: '/', label: '工作区' },
    { to: '/history', label: '历史' },
    { to: '/settings', label: '设置' },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4">
      <div className="flex items-center h-10">
        <span className="text-sm font-bold text-purple-400 mr-6">
          AI Coding Studio
        </span>
        <div className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                location.pathname === link.to
                  ? 'bg-gray-800 text-gray-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen bg-gray-950">
        <NavBar />
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<WorkspacePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd packages/web && npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 验证 Vite build**

Run: `cd packages/web && npx vite build`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): add routing and navigation for all pages"
```
