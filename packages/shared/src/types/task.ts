import { TaskStatusType } from '../constants/task-status';

export interface Task {
  id: number;
  userId: number;
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  prompt: string;
  status: TaskStatusType;
  previewUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskMessage {
  id: number;
  taskId: number;
  role: 'user' | 'ai';
  content: string;
  eventsJson: string | null;
  createdAt: Date;
}

export interface CreateTaskDto {
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  prompt: string;
}
