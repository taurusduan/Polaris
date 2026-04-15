/**
 * MCP 设置 Tab
 *
 * 嵌入 Settings 面板的 MCP 配置视图
 * 支持添加、删除、认证操作
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Inbox,
  Wifi,
  WifiOff,
  Lock,
  HelpCircle,
  Plus,
  Trash2,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { McpServerAggregate, McpScope, McpTransport } from '../../types/mcp';
import { McpAddServerDialog } from './McpAddServerDialog';
import { ConfirmDialog } from '../Common/ConfirmDialog';

/** 从服务器推断状态 */
function inferStatus(server: McpServerAggregate): 'connected' | 'needsAuth' | 'disconnected' | 'unknown' {
  const { health } = server;
  if (!health) return 'unknown';
  if (health.connected) return 'connected';
  const s = health.status?.toLowerCase() ?? '';
  if (s.includes('auth') || s.includes('认证') || s.includes('authenticate')) return 'needsAuth';
  return 'disconnected';
}

/** 状态图标 */
function StatusIcon({ status }: { status: ReturnType<typeof inferStatus> }) {
  switch (status) {
    case 'connected':
      return <Wifi size={14} className="text-green-500" />;
    case 'needsAuth':
      return <Lock size={14} className="text-yellow-500" />;
    case 'disconnected':
      return <WifiOff size={14} className="text-red-400" />;
    default:
      return <HelpCircle size={14} className="text-text-muted" />;
  }
}

/** 传输协议 badge 颜色 */
const TRANSPORT_BADGE_CLASS: Record<McpTransport, string> = {
  stdio: 'bg-blue-500/10 text-blue-500',
  http: 'bg-purple-500/10 text-purple-500',
};

/** 作用域 badge 颜色 */
const SCOPE_BADGE_CLASS: Record<McpScope, string> = {
  global: 'bg-orange-500/10 text-orange-500',
  project: 'bg-cyan-500/10 text-cyan-500',
  user: 'bg-emerald-500/10 text-emerald-500',
};

export function McpSettingsTab() {
  const { t } = useTranslation('mcp');

  const {
    servers,
    loading,
    error,
    initialized,
    init,
    refreshAll,
    clearError,
    removeServer,
    startAuth,
    operatingServer,
  } = useMcpStore();

  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace());
  const workspacePath = currentWorkspace?.path ?? '';

  // 对话框状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ name: string; scope?: string } | null>(null);

  // 初始化
  useEffect(() => {
    if (workspacePath) {
      init(workspacePath);
    }
  }, [init, workspacePath]);

  // 统计
  const stats = useMemo(() => {
    let connected = 0;
    let needsAuth = 0;
    let disconnected = 0;
    servers.forEach((server) => {
      const status = inferStatus(server);
      if (status === 'connected') connected++;
      else if (status === 'needsAuth') needsAuth++;
      else if (status === 'disconnected') disconnected++;
    });
    return { total: servers.length, connected, needsAuth, disconnected };
  }, [servers]);

  // 刷新
  const handleRefresh = () => {
    if (workspacePath) {
      refreshAll(workspacePath);
    }
  };

  // 删除服务器
  const handleRemove = (name: string) => {
    const server = servers.find((s) => s.name === name);
    const scope = server?.configs[0]?.scope;
    setConfirmRemove({ name, scope });
  };

  // 确认删除
  const confirmRemoveServer = async () => {
    if (confirmRemove) {
      await removeServer(confirmRemove.name, confirmRemove.scope, workspacePath);
      setConfirmRemove(null);
    }
  };

  // 认证服务器
  const handleAuth = async (name: string) => {
    const server = servers.find((s) => s.name === name);
    if (server?.health?.status) {
      const statusText = server.health.status;
      const urlMatch = statusText.match(/https?:\/\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : '';
      const scope = server.configs[0]?.scope ?? 'project';
      if (url) {
        await startAuth(name, url, scope);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-medium text-text-primary">{t('settings.title')}</h2>
          <p className="text-xs text-text-muted mt-0.5">
            {stats.total} {t('panel.status.all').toLowerCase()} · {stats.connected} {t('panel.status.connected').toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-1.5 rounded hover:bg-background-hover text-text-secondary hover:text-primary transition-colors"
            title={t('settings.addServer')}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded hover:bg-background-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title={t('panel.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 拓扑图 - 已移除 */}

      {/* 错误状态 */}
      {error && (
        <div className="mx-4 mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="underline hover:no-underline">
            {t('panel.refresh')}
          </button>
        </div>
      )}

      {/* 服务器表格 */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading && !initialized ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Inbox size={32} className="mb-2" />
            <p className="text-sm">{t('panel.empty')}</p>
            <p className="text-xs mt-1">{t('panel.emptyHint')}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-secondary border-b border-border-subtle">
                <th className="text-left py-2 font-medium">{t('settings.name')}</th>
                <th className="text-left py-2 font-medium">{t('settings.transport')}</th>
                <th className="text-left py-2 font-medium">{t('settings.scope')}</th>
                <th className="text-left py-2 font-medium w-24">{t('panel.status.all')}</th>
                <th className="text-left py-2 font-medium w-16">{t('card.remove')}</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => {
                const status = inferStatus(server);
                const transport = server.health?.transport ?? server.configs[0]?.transport ?? 'stdio';
                const scopes = [...new Set(server.configs.map((c) => c.scope))];
                const isOperating = operatingServer === server.name;
                const needsAuth = status === 'needsAuth';

                return (
                  <tr
                    key={server.name}
                    className="border-b border-border-subtle hover:bg-background-hover transition-colors"
                  >
                    <td className="py-2 text-text-primary font-medium">{server.name}</td>
                    <td className="py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${TRANSPORT_BADGE_CLASS[transport]}`}>
                        {transport}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {scopes.map((scope) => (
                          <span
                            key={scope}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SCOPE_BADGE_CLASS[scope]}`}
                          >
                            {t(`scope.${scope}`)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={status} />
                        <span
                          className={
                            status === 'connected'
                              ? 'text-green-500'
                              : status === 'needsAuth'
                                ? 'text-yellow-500'
                                : status === 'disconnected'
                                  ? 'text-red-400'
                                  : 'text-text-muted'
                          }
                        >
                          {status === 'connected'
                            ? t('card.connected')
                            : status === 'needsAuth'
                              ? t('card.needsAuth')
                              : status === 'disconnected'
                                ? t('card.disconnected')
                                : t('card.checking')}
                        </span>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {/* 认证按钮 */}
                        {needsAuth && (
                          <button
                            onClick={() => handleAuth(server.name)}
                            disabled={isOperating}
                            className="p-1 rounded hover:bg-yellow-500/20 text-yellow-500 transition-colors disabled:opacity-50"
                            title={t('card.authenticate')}
                          >
                            {isOperating ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <KeyRound size={12} />
                            )}
                          </button>
                        )}
                        {/* 删除按钮 */}
                        <button
                          onClick={() => handleRemove(server.name)}
                          disabled={isOperating}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          title={t('card.remove')}
                        >
                          {isOperating ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 添加服务器对话框 */}
      {showAddDialog && (
        <McpAddServerDialog onClose={() => setShowAddDialog(false)} />
      )}

      {/* 删除确认对话框 */}
      {confirmRemove && (
        <ConfirmDialog
          title={t('settings.removeConfirm', { name: confirmRemove.name })}
          message=""
          onConfirm={confirmRemoveServer}
          onCancel={() => setConfirmRemove(null)}
          type="danger"
        />
      )}
    </div>
  );
}

McpSettingsTab.displayName = 'McpSettingsTab';
