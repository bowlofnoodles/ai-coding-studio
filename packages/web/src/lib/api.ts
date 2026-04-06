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
      request<{ status: string; taskId: number }>('/orchestrator/execute', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  repos: {
    list: (userId: number) =>
      request<Array<{ id: string; name: string; fullName: string; cloneUrl: string; defaultBranch: string }>>(`/repos?userId=${userId}`),
    listBranches: (repoFullName: string, userId: number) =>
      request<Array<{ name: string; isDefault: boolean }>>(`/repos/branches?repo=${encodeURIComponent(repoFullName)}&userId=${userId}`),
  },
};
