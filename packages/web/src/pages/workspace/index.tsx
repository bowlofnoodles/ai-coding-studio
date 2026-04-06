import { useState, useEffect, useCallback, useRef } from 'react';
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
  const error = useWorkspaceStore((s) => s.error);

  const setCurrentTask = useWorkspaceStore((s) => s.setCurrentTask);
  const setTaskStatus = useWorkspaceStore((s) => s.setTaskStatus);
  const addEvent = useWorkspaceStore((s) => s.addEvent);
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl);
  const setError = useWorkspaceStore((s) => s.setError);
  const setIsExecuting = useWorkspaceStore((s) => s.setIsExecuting);
  const resetExecution = useWorkspaceStore((s) => s.resetExecution);

  const [messages, setMessages] = useState<Message[]>([]);
  const lastPromptRef = useRef<string>('');
  const { subscribe, onTaskEvent, onTaskStatus, onTaskError } = useSocket();

  // Subscribe to task events when taskId changes
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

  const executeTask = useCallback(
    async (prompt: string) => {
      if (!userId || !selectedRepo) return;

      resetExecution();
      lastPromptRef.current = prompt;
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
          apiKey: '',
        });

        // Subscribe immediately, don't wait for useEffect
        subscribe(result.taskId);
        setCurrentTask(result.taskId);
      } catch (err) {
        setError(err instanceof Error ? err.message : '任务提交失败');
        setIsExecuting(false);
      }
    },
    [userId, selectedRepo, branchName, resetExecution, setIsExecuting, setError, setCurrentTask],
  );

  const handleSubmit = useCallback(
    async (prompt: string) => {
      setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
      await executeTask(prompt);
    },
    [executeTask],
  );

  const handleRetry = useCallback(() => {
    if (lastPromptRef.current) {
      resetExecution();
      executeTask(lastPromptRef.current);
    }
  }, [executeTask, resetExecution]);

  return (
    <div className="flex h-full bg-gray-950 text-gray-100">
      {/* Left: Chat + Execution */}
      <div className="w-[45%] border-r border-gray-800 flex flex-col">
        <RepoSelector />
        <ChatPanel messages={messages} />

        {/* Error display with retry */}
        {error && !isExecuting && (
          <div className="mx-3 mb-2 bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-400 font-medium mb-1">任务执行失败</p>
              <p className="text-xs text-red-300/80 break-all">{error}</p>
            </div>
            <button
              className="shrink-0 text-xs bg-red-800/50 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded transition-colors"
              onClick={handleRetry}
            >
              重试
            </button>
          </div>
        )}

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
