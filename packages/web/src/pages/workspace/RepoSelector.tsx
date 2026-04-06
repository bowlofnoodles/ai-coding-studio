import { useEffect, useState } from 'react';
import { useUserStore } from '@/stores/user';
import { useWorkspaceStore } from '@/stores/workspace';
import { api } from '@/lib/api';

interface UserConfig {
  gitPlatform: string;
  aiEnginePreference: string;
}

export function RepoSelector() {
  const userId = useUserStore((s) => s.userId);
  const repos = useWorkspaceStore((s) => s.repos);
  const selectedRepo = useWorkspaceStore((s) => s.selectedRepo);
  const branchName = useWorkspaceStore((s) => s.branchName);
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const setRepos = useWorkspaceStore((s) => s.setRepos);
  const selectRepo = useWorkspaceStore((s) => s.selectRepo);
  const setBranchName = useWorkspaceStore((s) => s.setBranchName);
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);

  useEffect(() => {
    if (userId) {
      api.repos.list(userId).then(setRepos).catch(console.error);
      api.auth.getUser(userId).then((data) => {
        setUserConfig({
          gitPlatform: (data.gitPlatform as string) ?? 'github',
          aiEnginePreference: (data.aiEnginePreference as string) ?? 'claude-code',
        });
      }).catch(console.error);
    }
  }, [userId, setRepos]);

  const platformLabel = userConfig?.gitPlatform === 'gitlab' ? 'GitLab' : 'GitHub';
  const engineLabel = userConfig?.aiEnginePreference === 'claude-code' ? 'Claude Code' : userConfig?.aiEnginePreference ?? '-';

  return (
    <div className="border-b border-gray-800 bg-gray-900/50 p-3 space-y-2">
      {/* Config info bar */}
      {userConfig && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="text-gray-600">平台</span>
            <span className="text-gray-400">{platformLabel}</span>
          </span>
          <span className="text-gray-700">|</span>
          <span className="flex items-center gap-1">
            <span className="text-gray-600">引擎</span>
            <span className="text-gray-400">{engineLabel}</span>
          </span>
          {previewUrl && (
            <>
              <span className="text-gray-700">|</span>
              <span className="flex items-center gap-1">
                <span className="text-gray-600">预览</span>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 truncate max-w-[200px]"
                >
                  {previewUrl}
                </a>
              </span>
            </>
          )}
        </div>
      )}

      {/* Repo selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-8 shrink-0">仓库</span>
        <select
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-purple-500"
          value={selectedRepo?.fullName ?? ''}
          onChange={(e) => {
            const repo = repos.find((r) => r.fullName === e.target.value);
            if (repo) selectRepo(repo);
          }}
          disabled={isExecuting}
        >
          <option value="">选择仓库...</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.fullName}>
              {repo.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* Branch input */}
      {selectedRepo && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-8 shrink-0">分支</span>
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-purple-500 placeholder-gray-500"
            placeholder="留空则自动生成语义化分支名"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            disabled={isExecuting}
          />
          {branchName && (
            <button
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              onClick={() => setBranchName('')}
              disabled={isExecuting}
              title="清空，提交时自动生成"
            >
              清空
            </button>
          )}
        </div>
      )}
    </div>
  );
}
