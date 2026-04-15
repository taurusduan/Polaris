/**
 * MCP 添加服务器对话框
 *
 * 提供表单输入：名称、命令/URL、传输类型、作用域
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { McpTransport, McpScope } from '../../types/mcp';

export interface McpAddServerDialogProps {
  onClose: () => void;
}

export function McpAddServerDialog({ onClose }: McpAddServerDialogProps) {
  const { t } = useTranslation('mcp');
  const { addServer, operatingServer } = useMcpStore();
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace());
  const workspacePath = currentWorkspace?.path ?? '';

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [scope, setScope] = useState<McpScope>('project');

  const [error, setError] = useState<string | null>(null);
  const isOperating = operatingServer !== null;

  const handleSubmit = async () => {
    // 验证
    if (!name.trim()) {
      setError(t('settings.name') + ' is required');
      return;
    }
    if (!command.trim()) {
      setError(t('settings.command') + ' is required');
      return;
    }

    setError(null);

    // 解析参数
    const argsList = args
      .split(' ')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const success = await addServer(
      name.trim(),
      command.trim(),
      argsList,
      transport,
      scope,
      workspacePath
    );

    if (success) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isOperating) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-background-elevated rounded-xl p-6 w-full max-w-md border border-border shadow-glow">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          {t('settings.addServer')}
        </h2>

        {error && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('settings.name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-mcp-server"
              className="w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isOperating}
            />
          </div>

          {/* 命令/URL */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('settings.command')} *
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={transport === 'stdio' ? 'npx -y @modelcontextprotocol/server-...' : 'https://mcp.example.com'}
              className="w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              disabled={isOperating}
            />
          </div>

          {/* 参数（仅 stdio） */}
          {transport === 'stdio' && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t('detail.args')}
              </label>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--port 3000 --config ./config.json"
                className="w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                disabled={isOperating}
              />
              <p className="text-xs text-text-tertiary mt-1">Space-separated arguments</p>
            </div>
          )}

          {/* 传输类型 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('settings.transport')}
            </label>
            <div className="flex gap-2">
              {(['stdio', 'http'] as McpTransport[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTransport(t)}
                  disabled={isOperating}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    transport === t
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-background-surface text-text-secondary border border-border hover:border-border-hover'
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 作用域 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('settings.scope')}
            </label>
            <div className="flex gap-2">
              {(['project', 'user', 'global'] as McpScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  disabled={isOperating}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    scope === s
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-background-surface text-text-secondary border border-border hover:border-border-hover'
                  }`}
                >
                  {t(`scope.${s}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isOperating}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common:buttons.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isOperating || !name.trim() || !command.trim()}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isOperating && <Loader2 size={14} className="animate-spin" />}
            {t('settings.addServer')}
          </button>
        </div>
      </div>
    </div>
  );
}

McpAddServerDialog.displayName = 'McpAddServerDialog';
