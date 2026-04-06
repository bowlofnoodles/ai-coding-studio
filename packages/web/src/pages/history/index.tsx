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
