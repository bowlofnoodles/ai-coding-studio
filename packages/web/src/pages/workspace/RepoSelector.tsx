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
