/**
 * MCP 服务器详情展开视图
 *
 * 展示命令、参数、传输协议、作用域、上次检查时间、错误信息和环境变量
 * 包含操作按钮：删除、认证
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2, KeyRound, Loader2 } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import type { McpServerAggregate } from '../../types/mcp';

/** 屏蔽环境变量值 */
function maskEnvValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

/** 格式化时间 */
function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/** 详情行组件 */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 shrink-0 text-text-secondary">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export interface McpServerDetailProps {
  server: McpServerAggregate;
  onRemove?: (name: string) => void;
  onAuth?: (name: string) => void;
}

export const McpServerDetail = memo(function McpServerDetail({
  server,
  onRemove,
  onAuth,
}: McpServerDetailProps) {
  const { t } = useTranslation('mcp');
  const { health, configs } = server;
  const { operatingServer: currentOperating } = useMcpStore();

  // 合并所有 config 的信息（取第一个为主配置）
  const primaryConfig = configs[0];
  const command = health?.command ?? primaryConfig?.command ?? null;
  const args = primaryConfig?.args ?? [];
  const transport = health?.transport ?? primaryConfig?.transport ?? 'stdio';
  const scopes = [...new Set(configs.map((c) => c.scope))];
  const env = primaryConfig?.env ?? {};

  const hasError = health && !health.connected && health.status &&
    !health.status.toLowerCase().includes('auth') &&
    !health.status.toLowerCase().includes('认证');

  const needsAuth = health && !health.connected && (
    health.status?.toLowerCase().includes('auth') ||
    health.status?.toLowerCase().includes('认证')
  );

  const isOperating = currentOperating === server.name;

  // 处理删除
  const handleRemove = () => {
    if (onRemove && !isOperating) {
      onRemove(server.name);
    }
  };

  // 处理认证
  const handleAuth = () => {
    if (onAuth && !isOperating) {
      onAuth(server.name);
    }
  };

  return (
    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border-subtle mt-1">
      {/* 操作按钮区 */}
      <div className="flex items-center gap-2 pt-1">
        {needsAuth && (
          <button
            onClick={handleAuth}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
          >
            {isOperating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <KeyRound size={12} />
            )}
            {t('card.authenticate')}
          </button>
        )}
        <button
          onClick={handleRemove}
          disabled={isOperating}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {isOperating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Trash2 size={12} />
          )}
          {t('card.remove')}
        </button>
      </div>
      {/* 命令 */}
      {command && (
        <DetailRow label={t('detail.command')}>
          <span className="font-mono text-text-primary break-all">{command}</span>
        </DetailRow>
      )}

      {/* 参数 */}
      {args.length > 0 && (
        <DetailRow label={t('detail.args')}>
          <div className="flex flex-wrap gap-1">
            {args.map((arg, i) => (
              <span
                key={i}
                className="font-mono text-text-primary bg-background-base px-1.5 py-0.5 rounded text-[11px]"
              >
                {arg}
              </span>
            ))}
          </div>
        </DetailRow>
      )}

      {/* 传输协议 */}
      <DetailRow label={t('detail.transport')}>
        <span className="uppercase text-text-primary">{transport}</span>
      </DetailRow>

      {/* 作用域 */}
      <DetailRow label={t('detail.scope')}>
        <div className="flex gap-1">
          {scopes.map((scope) => (
            <span key={scope} className="text-text-primary">
              {t(`scope.${scope}`)}
            </span>
          ))}
        </div>
      </DetailRow>

      {/* 上次检查时间 */}
      <DetailRow label={t('detail.lastCheck')}>
        <span className="text-text-muted">
          {formatTime(health?.status ? new Date().toISOString() : null)}
        </span>
      </DetailRow>

      {/* 错误信息 */}
      {hasError && health?.status && (
        <div className="flex items-start gap-1.5 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-500">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>{health.status}</span>
        </div>
      )}

      {/* 环境变量 */}
      {Object.keys(env).length > 0 && (
        <DetailRow label={t('detail.env')}>
          <div className="space-y-0.5">
            {Object.entries(env).map(([key, value]) => (
              <div key={key} className="font-mono text-[11px]">
                <span className="text-text-secondary">{key}=</span>
                <span className="text-text-muted">{maskEnvValue(value)}</span>
              </div>
            ))}
          </div>
        </DetailRow>
      )}
    </div>
  );
});

McpServerDetail.displayName = 'McpServerDetail';
