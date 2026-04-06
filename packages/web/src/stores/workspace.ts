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
  branchListVersion: number;
  taskSummary: {
    branch: string;
    baseBranch: string;
    commitUrl: string;
    commitHash: string;
    changedFiles: string;
    repoFullName: string;
  } | null;

  setCurrentTask: (taskId: number) => void;
  setTaskStatus: (status: string) => void;
  addEvent: (event: CodingEvent) => void;
  setPreviewUrl: (url: string) => void;
  setError: (error: string | null) => void;
  setIsExecuting: (executing: boolean) => void;
  setTaskSummary: (summary: WorkspaceState['taskSummary']) => void;
  refreshBranchList: () => void;
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

  currentTaskId: null,
  taskStatus: null,
  events: [],
  previewUrl: null,
  isExecuting: false,
  error: null,
  branchListVersion: 0,
  taskSummary: null,

  setCurrentTask: (taskId) => set({ currentTaskId: taskId }),
  setTaskStatus: (status) => set({ taskStatus: status }),
  addEvent: (event) =>
    set((state) => ({ events: [...state.events, event] })),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setError: (error) => set({ error }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setTaskSummary: (taskSummary) => set({ taskSummary }),
  refreshBranchList: () =>
    set((state) => ({ branchListVersion: state.branchListVersion + 1 })),
  resetExecution: () =>
    set({
      currentTaskId: null,
      taskStatus: null,
      events: [],
      previewUrl: null,
      isExecuting: false,
      error: null,
      taskSummary: null,
    }),
}));
