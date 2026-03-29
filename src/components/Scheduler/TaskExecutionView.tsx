/**
 * 任务执行详情视图
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerStore, useToastStore } from '../../stores';
import type { ExecutionLog, ToolCallRecord } from '../../types/scheduler';

/** 格式化用时 */
function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const diff = Math.floor((end - startTime) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

/** 日志级别样式 */
const logLevelStyles = {
  info: 'text-text-primary',
  warn: 'text-warning',
  error: 'text-danger',
  debug: 'text-text-muted',
};

/** 日志级别标签 */
const logLevelLabels = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

/** 单条日志组件 */
function LogItem({ log }: { log: ExecutionLog }) {
  const time = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div className={`font-mono text-sm ${logLevelStyles[log.level]}`}>
      <span className="text-text-muted">[{time}]</span>{' '}
      <span className={log.level === 'error' ? 'text-danger font-semibold' : log.level === 'warn' ? 'text-warning font-semibold' : ''}>
        [{logLevelLabels[log.level]}]
      </span>{' '}
      <span>{log.message}</span>
    </div>
  );
}

/** 工具调用项组件 */
function ToolCallItem({ toolCall }: { toolCall: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const duration = toolCall.endTime ? Math.floor((toolCall.endTime - toolCall.startTime) / 1000) : null;

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-background-surface hover:bg-background-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${toolCall.success !== false ? 'bg-success' : 'bg-danger'}`} />
          <span className="font-mono text-sm text-text-primary">{toolCall.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {duration !== null && <span>{duration}s</span>}
          <span>{expanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 bg-background-base border-t border-border-subtle space-y-2">
          {toolCall.args && (
            <div>
              <span className="text-xs text-text-muted">参数:</span>
              <pre className="mt-1 p-2 bg-background-surface rounded text-xs overflow-x-auto">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <span className="text-xs text-text-muted">结果:</span>
              <pre className="mt-1 p-2 bg-background-surface rounded text-xs overflow-x-auto max-h-48">
                {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 执行详情视图 */
export function TaskExecutionView() {
  const { t } = useTranslation('scheduler');
  const toast = useToastStore();
  const { currentExecution, showExecutionView, closeExecutionView, clearExecutionLogs, setExecutionStatus, updateRunStatus } = useSchedulerStore();

  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showToolCalls, setShowToolCalls] = useState(true);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentExecution?.logs, autoScroll]);

  // 检测用户是否手动滚动
  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  if (!showExecutionView || !currentExecution) {
    return null;
  }

  const { taskId, taskName, status, startTime, endTime, logs, toolCalls, error } = currentExecution;

  const statusStyles = {
    idle: 'bg-background-hover text-text-secondary',
    running: 'bg-info-faint text-info animate-pulse',
    success: 'bg-success-faint text-success',
    failed: 'bg-danger-faint text-danger',
    cancelled: 'bg-warning-faint text-warning',
  };

  const statusLabels = {
    idle: t('execution.status.idle', { defaultValue: '等待中' }),
    running: t('execution.status.running', { defaultValue: '执行中' }),
    success: t('execution.status.success', { defaultValue: '已完成' }),
    failed: t('execution.status.failed', { defaultValue: '失败' }),
    cancelled: t('execution.status.cancelled', { defaultValue: '已取消' }),
  };

  const handleStop = async () => {
    // 模拟停止任务
    setExecutionStatus(taskId, 'cancelled');
    await updateRunStatus(taskId, 'failed');
    toast.warning(t('execution.cancelled', { defaultValue: '任务已取消' }));
  };

  const handleClearLogs = () => {
    clearExecutionLogs(taskId);
  };

  return (
    <div className="h-full flex flex-col bg-background-base">
      {/* 头部 */}
      <div className="p-4 border-b border-border-subtle flex items-center gap-3">
        <button
          onClick={closeExecutionView}
          className="w-8 h-8 flex items-center justify-center bg-background-hover hover:bg-background-active rounded-lg transition-colors text-text-secondary"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-text-primary truncate">{taskName}</h2>
          <div className="flex items-center gap-3 mt-1 text-sm">
            <span className={`px-2 py-0.5 rounded ${statusStyles[status]}`}>
              {statusLabels[status]}
            </span>
            <span className="text-text-muted">
              {t('execution.duration', { defaultValue: '用时' })}: {formatDuration(startTime, endTime)}
            </span>
          </div>
        </div>
      </div>

      {/* 日志区域 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between bg-background-surface">
          <span className="text-sm text-text-secondary">
            {t('execution.logs', { defaultValue: '执行日志' })} ({logs.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                autoScroll ? 'bg-primary-faint text-primary' : 'bg-background-hover text-text-muted'
              }`}
            >
              {autoScroll ? t('execution.autoScroll', { defaultValue: '自动滚动' }) : t('execution.manualScroll', { defaultValue: '手动滚动' })}
            </button>
            <button
              onClick={handleClearLogs}
              className="px-2 py-1 text-xs bg-background-hover text-text-muted hover:text-text-primary rounded transition-colors"
            >
              {t('execution.clearLogs', { defaultValue: '清空日志' })}
            </button>
          </div>
        </div>
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 bg-background-elevated"
        >
          {logs.length === 0 ? (
            <div className="text-center text-text-muted py-8">
              {status === 'running'
                ? t('execution.waitingOutput', { defaultValue: '等待任务输出...' })
                : t('execution.noLogs', { defaultValue: '暂无执行日志' })}
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <LogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 工具调用区域 */}
      {toolCalls.length > 0 && (
        <div className="border-t border-border-subtle">
          <button
            onClick={() => setShowToolCalls(!showToolCalls)}
            className="w-full px-4 py-2 flex items-center justify-between bg-background-surface hover:bg-background-hover transition-colors"
          >
            <span className="text-sm text-text-secondary">
              {t('execution.toolCalls', { defaultValue: '工具调用' })} ({toolCalls.length})
            </span>
            <span className="text-xs text-text-muted">{showToolCalls ? '▼' : '▶'}</span>
          </button>
          {showToolCalls && (
            <div className="p-3 space-y-2 max-h-48 overflow-y-auto bg-background-base">
              {toolCalls.map((tc, index) => (
                <ToolCallItem key={`${tc.name}-${index}`} toolCall={tc} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="px-4 py-3 bg-danger-faint border-t border-danger/20">
          <div className="text-sm text-danger font-medium">{t('execution.error', { defaultValue: '错误' })}</div>
          <div className="text-sm text-danger/80 mt-1">{error}</div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="p-4 border-t border-border-subtle flex items-center gap-2 bg-background-surface">
        {status === 'running' && (
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg transition-colors"
          >
            {t('execution.stop', { defaultValue: '停止任务' })}
          </button>
        )}
        <button
          onClick={closeExecutionView}
          className="px-4 py-2 bg-background-hover text-text-secondary hover:bg-background-active rounded-lg transition-colors"
        >
          {t('execution.back', { defaultValue: '返回列表' })}
        </button>
      </div>
    </div>
  );
}

export default TaskExecutionView;
