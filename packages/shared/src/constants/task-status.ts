export const TaskStatus = {
  PENDING: 'pending',
  SANDBOX_READY: 'sandbox_ready',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  DEPLOYING: 'deploying',
  DEPLOYED: 'deployed',
  DEPLOY_FAILED: 'deploy_failed',
  FAILED: 'failed',
} as const;

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];
