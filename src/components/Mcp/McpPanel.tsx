/**
 * MCP 管理面板
 *
 * 主面板容器：头部 + 筛选栏 + 服务器卡片列表 + 底部状态栏
 * 包含空状态、错误状态、加载状态处理
 * 支持添加、删除、认证操作
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Server,
  AlertTriangle,
  Inbox,
  Plus,
} from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { McpServerAggregate, McpStatusFilter } from '../../types/mcp';
import { McpServerCard } from './McpServerCard';
import { McpServerDetail } from './McpServerDetail';
import { McpAddServerDialog } from './McpAddServerDialog';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import { useMcpHealthPolling } from './hooks/useMcpHealthPolling';

/** 从 status 文本推断连接状态（复用逻辑） */
function inferStatus(server: McpServerAggregate): 'connected' | 'needsAuth' | 'disconnected' {
  const { health } = server;
  if (!health) return 'disconnected';
  if (health.connected) return 'connected';
  const s = health.status?.toLowerCase() ?? '';
  if (s.includes('auth') || s.includes('认证') || s.includes('authenticate')) return 'needsAuth';
  return 'disconnected';
}

/** 筛选服务器 */
function filterServers(servers: McpServerAggregate[], filter: McpStatusFilter): McpServerAggregate[] {
  if (filter === 'all') return servers;
  return servers.filter((server) => {
    const status = inferStatus(server);
    if (filter === 'connected') return status === 'connected';
    if (filter === 'needsAuth') return status === 'needsAuth';
    if (filter === 'disconnected') return status === 'disconnected';
    return true;
  });
}

/** 格式化时间 */
function formatCheckTime(isoString: string | null): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/** 筛选按钮配置 */
const FILTER_OPTIONS: { value: McpStatusFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'panel.status.all' },
  { value: 'connected', labelKey: 'panel.status.connected' },
  { value: 'needsAuth', labelKey: 'panel.status.needsAuth' },
  { value: 'disconnected', labelKey: 'panel.status.disconnected' },
];

export function McpPanel() {
  const { t } = useTranslation('mcp');

  const {
    servers,
    loading,
    error,
    initialized,
    lastHealthCheck,
    statusFilter,
    expandedServer,
    init,
    refreshAll,
    setStatusFilter,
    toggleExpand,
    clearError,
    removeServer,
    startAuth,
  } = useMcpStore();

  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace());
  const workspacePath = currentWorkspace?.path ?? '';

  // 对话框状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ name: string; scope?: string } | null>(null);

  // 健康检查轮询
  useMcpHealthPolling(true, 'mcp');

  // 初始化加载
  useEffect(() => {
    if (workspacePath) {
      init(workspacePath);
    }
  }, [init, workspacePath]);

  // 过滤后的服务器
  const filteredServers = useMemo(
    () => filterServers(servers, statusFilter),
    [servers, statusFilter]
  );

  // 统计
  const stats = useMemo(() => {
    let connected = 0;
    let pending = 0;
    servers.forEach((server) => {
      const status = inferStatus(server);
      if (status === 'connected') connected++;
      else if (status === 'needsAuth') pending++;
    });
    return { total: servers.length, connected, pending };
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
      // 从 health.status 中解析认证 URL
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
    <div className="h-full flex flex-col bg-background-base">
      {/* 头部 */}
      <div className="h-10 px-3 border-b border-border-subtle flex items-center justify-between bg-background-surface shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Server size={16} className="text-text-secondary shrink-0" />
          <h1 className="text-sm font-medium text-text-primary truncate">
            {t('panel.title')}
          </h1>
          <span className="text-xs text-text-muted shrink-0">({servers.length})</span>
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

      {/* 筛选栏 */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-1.5 shrink-0">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              statusFilter === opt.value
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
            }`}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* 加载状态 */}
        {loading && !initialized && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              <button
                onClick={clearError}
                className="mt-1 text-xs underline hover:no-underline"
              >
                {t('panel.refresh')}
              </button>
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!loading && servers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Inbox size={32} className="mb-2" />
            <p className="text-sm">{t('panel.empty')}</p>
            <p className="text-xs mt-1">{t('panel.emptyHint')}</p>
          </div>
        )}

        {/* 筛选无结果 */}
        {!loading && servers.length > 0 && filteredServers.length === 0 && (
          <div className="text-center text-text-muted py-8 text-sm">
            {t('panel.status.all')}
          </div>
        )}

        {/* 服务器卡片列表 */}
        <div className="space-y-2">
          {filteredServers.map((server) => (
            <div key={server.name}>
              <McpServerCard
                server={server}
                expanded={expandedServer === server.name}
                onClick={() => toggleExpand(server.name)}
                onRemove={handleRemove}
                onAuth={handleAuth}
              />
              {expandedServer === server.name && (
                <div className="bg-surface rounded-b-lg border border-t-0 border-border-subtle">
                  <McpServerDetail
                    server={server}
                    onRemove={handleRemove}
                    onAuth={handleAuth}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 底部状态栏 */}
      {servers.length > 0 && (
        <div className="h-7 px-3 border-t border-border-subtle flex items-center justify-between text-[11px] text-text-muted shrink-0 bg-background-surface">
          <span>
            {t('panel.summary', {
              total: stats.total,
              connected: stats.connected,
              pending: stats.pending,
            })}
          </span>
          {lastHealthCheck && (
            <span>
              {t('panel.lastCheck', { time: formatCheckTime(lastHealthCheck) })}
            </span>
          )}
        </div>
      )}

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

McpPanel.displayName = 'McpPanel';
