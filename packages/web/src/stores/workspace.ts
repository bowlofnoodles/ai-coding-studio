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
  repos: Repo[];
  selectedRepo: Repo | null;
  branchName: string;
  setRepos: (repos: Repo[]) => void;
  selectRepo: (repo: Repo) => void;
  setBranchName: (name: string) => void;

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
