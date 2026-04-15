/**
 * MCP 服务器卡片组件
 *
 * 展示服务器名称、状态图标、传输协议、作用域和命令
 * 包含操作按钮：删除、认证
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wifi,
  WifiOff,
  Lock,
  Loader2,
  ChevronRight,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import type { McpServerAggregate, McpScope, McpTransport } from '../../types/mcp';

/** 从 status 文本推断服务器连接状态 */
function getServerStatus(server: McpServerAggregate): 'connected' | 'needsAuth' | 'disconnected' | 'checking' {
  const { health } = server;
  if (!health) return 'checking';
  if (health.connected) return 'connected';
  const statusText = health.status?.toLowerCase() ?? '';
  if (statusText.includes('auth') || statusText.includes('认证') || statusText.includes('authenticate')) {
    return 'needsAuth';
  }
  return 'disconnected';
}

/** 状态图标映射 */
const STATUS_ICON_MAP = {
  connected: { icon: Wifi, className: 'text-green-500' },
  needsAuth: { icon: Lock, className: 'text-yellow-500' },
  disconnected: { icon: WifiOff, className: 'text-red-400' },
  checking: { icon: Loader2, className: 'text-text-muted animate-spin' },
} as const;

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

/** 获取服务器的主命令文本（用于预览） */
function getCommandPreview(server: McpServerAggregate): string | null {
  const { health, configs } = server;
  // 优先使用 health 中的 command
  if (health?.command) return health.command;
  // 从 configs 中取第一个有 command 的
  const firstConfig = configs.find((c) => c.command);
  return firstConfig?.command ?? null;
}

/** 获取服务器的主传输协议 */
function getTransport(server: McpServerAggregate): McpTransport {
  if (server.health?.transport) return server.health.transport;
  if (server.configs.length > 0) return server.configs[0].transport;
  return 'stdio';
}

/** 获取服务器的作用域列表（去重） */
function getScopes(server: McpServerAggregate): McpScope[] {
  const scopeSet = new Set<McpScope>();
  server.configs.forEach((c) => scopeSet.add(c.scope));
  return Array.from(scopeSet);
}

export interface McpServerCardProps {
  server: McpServerAggregate;
  expanded: boolean;
  onClick: () => void;
  onRemove?: (name: string) => void;
  onAuth?: (name: string) => void;
}

export const McpServerCard = memo(function McpServerCard({
  server,
  expanded,
  onClick,
  onRemove,
  onAuth,
}: McpServerCardProps) {
  const { t } = useTranslation('mcp');
  const { operatingServer } = useMcpStore();

  const status = getServerStatus(server);
  const { icon: StatusIcon, className: statusClassName } = STATUS_ICON_MAP[status];
  const commandPreview = getCommandPreview(server);
  const transport = getTransport(server);
  const scopes = getScopes(server);
  const isOperating = operatingServer === server.name;
  const needsAuth = status === 'needsAuth';

  // 处理删除
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove && !isOperating) {
      onRemove(server.name);
    }
  };

  // 处理认证
  const handleAuth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAuth && !isOperating) {
      onAuth(server.name);
    }
  };

  return (
    <div
      className="bg-surface p-3 rounded-lg border border-border-subtle cursor-pointer hover:border-border transition-colors"
      onClick={onClick}
    >
      {/* 第一行：状态图标 + 名称 + 操作按钮 + 展开 arrow */}
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon size={16} className={`shrink-0 ${statusClassName}`} />
        <span className="font-medium text-sm text-text-primary truncate flex-1 min-w-0">
          {server.name}
        </span>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          {/* 认证按钮 - 仅当需要认证时显示 */}
          {needsAuth && (
            <button
              onClick={handleAuth}
              disabled={isOperating}
              className="p-1 rounded hover:bg-yellow-500/20 text-yellow-500 transition-colors disabled:opacity-50"
              title={t('card.authenticate')}
            >
              <KeyRound size={14} />
            </button>
          )}
          {/* 删除按钮 */}
          <button
            onClick={handleRemove}
            disabled={isOperating}
            className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors disabled:opacity-50"
            title={t('card.remove')}
          >
            {isOperating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>

        <ChevronRight
          size={14}
          className={`shrink-0 text-text-muted transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </div>

      {/* 第二行：传输协议 + 作用域 badges + 命令预览 */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${TRANSPORT_BADGE_CLASS[transport]}`}>
          {transport}
        </span>
        {scopes.map((scope) => (
          <span
            key={scope}
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SCOPE_BADGE_CLASS[scope]}`}
          >
            {t(`scope.${scope}`)}
          </span>
        ))}
        {commandPreview && (
          <span className="text-[11px] text-text-muted truncate ml-1 font-mono">
            {commandPreview}
          </span>
        )}
      </div>
    </div>
  );
});

McpServerCard.displayName = 'McpServerCard';
