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
  ensureBranchName: () => string;

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

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  repos: [],
  selectedRepo: null,
  branchName: '',
  setRepos: (repos) => set({ repos }),
  selectRepo: (repo) => {
    const current = get();
    // Only reset branch when switching to a different repo
    if (current.selectedRepo?.fullName !== repo.fullName) {
      set({ selectedRepo: repo, branchName: '' });
    }
  },
  setBranchName: (branchName) => set({ branchName }),
  // Generate branch name only once per session, reuse on subsequent calls
  ensureBranchName: () => {
    const state = get();
    if (state.branchName) return state.branchName;
    const name = `ai-studio/${Date.now()}`;
    set({ branchName: name });
    return name;
  },

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
