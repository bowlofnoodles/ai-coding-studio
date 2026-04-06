import { useState, useEffect } from 'react';
import { useUserStore } from '@/stores/user';
import { api } from '@/lib/api';

export function SettingsPage() {
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const setUser = useUserStore((s) => s.setUser);

  const [gitPlatform, setGitPlatform] = useState('github');
  const [gitToken, setGitToken] = useState('');
  const [aiEngine, setAiEngine] = useState('claude-code');
  const [previewUrlTemplate, setPreviewUrlTemplate] = useState(
    'https://{branch}.preview.example.com',
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Registration form (if no user)
  const [regUsername, setRegUsername] = useState('');

  useEffect(() => {
    if (userId) {
      api.auth.getUser(userId).then((user) => {
        setGitPlatform((user.gitPlatform as string) ?? 'github');
        setAiEngine((user.aiEnginePreference as string) ?? 'claude-code');
      }).catch(console.error);
    }
  }, [userId]);

  const handleRegister = async () => {
    if (!regUsername.trim() || !gitToken.trim()) return;
    try {
      const user = await api.auth.register({
        username: regUsername.trim(),
        gitPlatform,
        gitToken,
      });
      setUser(user.id, user.username);
      setMessage('注册成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '注册失败');
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await api.auth.updateUser(userId, {
        gitPlatform,
        gitToken: gitToken || undefined,
        aiEnginePreference: aiEngine,
      });
      setMessage('设置已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-8">设置</h1>

        {!userId ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">注册 / 登录</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">用户名</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="输入用户名"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Git 平台
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={gitPlatform}
                  onChange={(e) => setGitPlatform(e.target.value)}
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Personal Access Token
                </label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  placeholder="ghp_xxxx 或 glpat-xxxx"
                />
              </div>
              <button
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                onClick={handleRegister}
              >
                注册
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              当前用户: <span className="text-gray-200">{username}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Git 平台
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={gitPlatform}
                  onChange={(e) => setGitPlatform(e.target.value)}
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  更新 Personal Access Token
                </label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  placeholder="留空则不更新"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  AI 引擎
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={aiEngine}
                  onChange={(e) => setAiEngine(e.target.value)}
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="internal" disabled>
                    内部 AI 工具 (即将支持)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  预览 URL 模板
                </label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={previewUrlTemplate}
                  onChange={(e) => setPreviewUrlTemplate(e.target.value)}
                  placeholder="https://{branch}.preview.example.com"
                />
                <p className="text-xs text-gray-600 mt-1">
                  使用 {'{branch}'} 作为分支名占位符
                </p>
              </div>

              <button
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-green-400">{message}</p>
        )}
      </div>
    </div>
  );
}
