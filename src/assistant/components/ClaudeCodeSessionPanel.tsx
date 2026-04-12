import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, Loader2, CheckCircle, XCircle, Bell, FileText, Code, Wrench, Trash2, ChevronRight, ChevronLeft, Layers, Square, CheckSquare } from 'lucide-react'
import { useAssistantStore } from '../store/assistantStore'
import { useAssistant } from '../hooks/useAssistant'
import { SessionTab } from './SessionTab'
import { cn } from '../../utils'
import { getEventBus } from '../../ai-runtime'
import { ResizeHandle } from '../../components/Common'
import type { ClaudeCodeExecutionEvent, CompletionNotification, ClaudeCodeSessionState } from '../types'

/**
 * 格式化执行用时
 */
function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now()
  const diff = Math.floor((end - startTime) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
}

/** 默认面板高度 */
const DEFAULT_PANEL_HEIGHT = 192 // 约 h-48
const MIN_PANEL_HEIGHT = 96
const MAX_PANEL_HEIGHT = 400

/**
 * 会话状态统计组件
 */
function SessionStatusSummary({ sessions }: { sessions: ClaudeCodeSessionState[] }) {
  const runningCount = sessions.filter((s) => s.status === 'running').length
  const completedCount = sessions.filter((s) => s.status === 'completed').length
  const errorCount = sessions.filter((s) => s.status === 'error').length
  const idleCount = sessions.filter((s) => s.status === 'idle').length

  // 计算运行中任务的总耗时
  const runningSessions = sessions.filter((s) => s.status === 'running')
  const totalDuration = runningSessions.reduce((acc, s) => {
    return acc + Math.floor((Date.now() - s.createdAt) / 1000)
  }, 0)

  return (
    <div className="flex items-center gap-3 text-xs">
      {runningCount > 0 && (
        <span className="flex items-center gap-1 text-primary">
          <Loader2 className="w-3 h-3 animate-spin" />
          {runningCount} 运行中
          {totalDuration > 0 && (
            <span className="text-text-tertiary">({formatDuration(Date.now() - totalDuration * 1000)})</span>
          )}
        </span>
      )}
      {completedCount > 0 && (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle className="w-3 h-3" />
          {completedCount} 已完成
        </span>
      )}
      {errorCount > 0 && (
        <span className="flex items-center gap-1 text-danger">
          <XCircle className="w-3 h-3" />
          {errorCount} 出错
        </span>
      )}
      {idleCount > 0 && (
        <span className="flex items-center gap-1 text-text-tertiary">
          <Code className="w-3 h-3" />
          {idleCount} 空闲
        </span>
      )}
    </div>
  )
}

/**
 * 批量操作工具栏
 */
function BatchOperationsToolbar({
  sessions,
  selectedIds,
  onToggleSelectAll,
  onAbortSelected,
  onClearSelected,
  onClearAllCompleted,
}: {
  sessions: ClaudeCodeSessionState[]
  selectedIds: Set<string>
  onToggleSelectAll: () => void
  onAbortSelected: () => void
  onClearSelected: () => void
  onClearAllCompleted: () => void
}) {
  const runningSessions = sessions.filter((s) => s.status === 'running')
  const completedOrErrorSessions = sessions.filter((s) => s.status === 'completed' || s.status === 'error')

  // 仅在有多个会话时显示工具栏
  if (sessions.length <= 1) return null

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-background-surface shrink-0">
      <div className="flex items-center gap-2">
        {/* 全选按钮 */}
        <button
          onClick={onToggleSelectAll}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
          title={selectedIds.size === sessions.length ? '取消全选' : '全选'}
        >
          {selectedIds.size === sessions.length ? (
            <CheckSquare className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>
        <span className="text-xs text-text-muted">
          {selectedIds.size > 0 ? `已选 ${selectedIds.size} 个` : `${sessions.length} 个会话`}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* 中断选中 */}
        {runningSessions.length > 0 && (
          <button
            onClick={onAbortSelected}
            disabled={selectedIds.size === 0}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              selectedIds.size > 0
                ? 'text-danger hover:bg-danger/10'
                : 'text-text-tertiary cursor-not-allowed'
            )}
          >
            中断选中
          </button>
        )}

        {/* 清除选中 */}
        {completedOrErrorSessions.length > 0 && (
          <button
            onClick={onClearSelected}
            disabled={selectedIds.size === 0}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              selectedIds.size > 0
                ? 'text-text-secondary hover:bg-background-hover'
                : 'text-text-tertiary cursor-not-allowed'
            )}
          >
            清除选中
          </button>
        )}

        {/* 清除所有已完成 */}
        {completedOrErrorSessions.length > 0 && (
          <button
            onClick={onClearAllCompleted}
            className="px-2 py-0.5 text-xs text-text-muted hover:text-text-secondary hover:bg-background-hover rounded transition-colors"
          >
            清除已完成
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Claude Code 多会话面板
 */
export function ClaudeCodeSessionPanel() {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT)
  const [autoScroll, setAutoScroll] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const logContainerRef = useRef<HTMLDivElement>(null)
  const {
    claudeCodeSessions,
    executionPanelSessionId,
    setExecutionPanelSession,
    clearSessionEvents,
    abortSessions,
    clearCompletedSessions,
    clearSessions,
  } = useAssistantStore()

  const sessions = Array.from(claudeCodeSessions.values())

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logContainerRef.current && executionPanelSessionId) {
      const session = claudeCodeSessions.get(executionPanelSessionId)
      if (session && session.events.length > 0) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      }
    }
  }, [claudeCodeSessions, executionPanelSessionId, autoScroll])

  // 检测用户滚动
  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
      setAutoScroll(isAtBottom)
    }
  }

  // 拖拽调整高度
  const handleResize = (delta: number) => {
    const newHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, panelHeight + delta))
    setPanelHeight(newHeight)
  }

  // 批量操作处理
  const handleToggleSelectAll = () => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)))
    }
  }

  const handleSelectSession = (sessionId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  const handleAbortSelected = async () => {
    const toAbort = sessions.filter((s) => selectedIds.has(s.id) && s.status === 'running')
    await abortSessions(toAbort.map((s) => s.id))
    setSelectedIds(new Set())
  }

  const handleClearSelected = () => {
    const toClear = sessions.filter((s) => selectedIds.has(s.id) && (s.status === 'completed' || s.status === 'error'))
    clearSessions(toClear.map((s) => s.id))
    setSelectedIds(new Set())
  }

  const handleClearAllCompleted = () => {
    clearCompletedSessions()
    setSelectedIds(new Set())
  }

  if (sessions.length === 0) return null

  const showBatchToolbar = sessions.length > 1

  return (
    <div
      className={cn(
        'border-t border-border transition-all shrink-0 bg-background-elevated flex flex-col',
        isCollapsed ? 'h-10' : ''
      )}
      style={{ height: isCollapsed ? undefined : panelHeight }}
    >
      {/* 拖拽手柄 - 仅展开时显示 */}
      {!isCollapsed && (
        <ResizeHandle direction="vertical" position="right" onDrag={handleResize} />
      )}

      {/* 折叠状态栏 */}
      <div
        className="flex items-center justify-between px-4 h-10 cursor-pointer hover:bg-background-hover shrink-0"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-text-muted" />
          <SessionStatusSummary sessions={sessions} />
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && executionPanelSessionId && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                clearSessionEvents(executionPanelSessionId)
              }}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
              title="清空日志"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {isCollapsed ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* 批量操作工具栏 */}
          {showBatchToolbar && (
            <BatchOperationsToolbar
              sessions={sessions}
              selectedIds={selectedIds}
              onToggleSelectAll={handleToggleSelectAll}
              onAbortSelected={handleAbortSelected}
              onClearSelected={handleClearSelected}
              onClearAllCompleted={handleClearAllCompleted}
            />
          )}

          {/* 会话标签栏 */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border/50 overflow-x-auto shrink-0">
            {sessions.map((session) => (
              <SessionTab
                key={session.id}
                session={session}
                isActive={executionPanelSessionId === session.id}
                onClick={() => setExecutionPanelSession(session.id)}
                isSelected={selectedIds.has(session.id)}
                onSelect={() => handleSelectSession(session.id)}
                showCheckbox={showBatchToolbar}
              />
            ))}
          </div>

          {/* 会话内容 */}
          {executionPanelSessionId && (
            <SessionContent
              sessionId={executionPanelSessionId}
              logContainerRef={logContainerRef}
              onScroll={handleScroll}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 会话内容
 */
function SessionContent({
  sessionId,
  logContainerRef,
  onScroll,
  autoScroll,
  setAutoScroll,
}: {
  sessionId: string
  logContainerRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
  autoScroll: boolean
  setAutoScroll: (v: boolean) => void
}) {
  const { getClaudeCodeSession } = useAssistantStore()
  const session = getClaudeCodeSession(sessionId)

  if (!session) return null

  const isRunning = session.status === 'running'
  const duration = formatDuration(session.createdAt, isRunning ? undefined : session.lastActiveAt)

  return (
    <>
      {/* 状态工具栏 */}
      <div className="shrink-0 h-7 px-4 flex items-center justify-between border-b border-border-subtle bg-background-surface">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
          ) : session.status === 'completed' ? (
            <CheckCircle className="w-3 h-3 text-success" />
          ) : session.status === 'error' ? (
            <XCircle className="w-3 h-3 text-danger" />
          ) : (
            <Code className="w-3 h-3 text-text-muted" />
          )}
          <span>
            {isRunning ? '执行中' : session.status === 'completed' ? '已完成' : session.status === 'error' ? '出错' : '空闲'}
          </span>
          <span className="text-text-faint">·</span>
          <span>{duration}</span>
          <span className="text-text-faint">·</span>
          <span>{session.events.length} 条日志</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'px-1.5 py-0.5 text-xs rounded transition-colors',
              autoScroll
                ? 'bg-primary-faint text-primary'
                : 'bg-background-hover text-text-muted'
            )}
          >
            {autoScroll ? '自动滚动' : '手动'}
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      <div
        ref={logContainerRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-2"
      >
        {session.events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-text-muted">
            等待执行...
          </div>
        ) : (
          <div className="space-y-1">
            {session.events.map((event, idx) => (
              <EventItem key={idx} event={event} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * 单个事件项
 */
function EventItem({ event }: { event: ClaudeCodeExecutionEvent }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const time = new Date(event.timestamp).toLocaleTimeString()

  const getIcon = () => {
    switch (event.type) {
      case 'tool_call':
        return <Wrench className="w-3 h-3 text-primary" />
      case 'assistant_message':
        return <FileText className="w-3 h-3 text-text-secondary" />
      case 'session_start':
        return <Loader2 className="w-3 h-3 text-primary animate-spin" />
      case 'session_end':
        return <CheckCircle className="w-3 h-3 text-success" />
      case 'error':
        return <XCircle className="w-3 h-3 text-danger" />
      default:
        return <Code className="w-3 h-3 text-text-muted" />
    }
  }

  const getContent = () => {
    if (event.data.error) {
      return <span className="text-danger">{event.data.error}</span>
    }
    if (event.data.tool) {
      return (
        <span>
          <span className="text-primary">{event.data.tool}</span>
          {event.data.message && (
            <span className="text-text-muted ml-1">- {event.data.message}</span>
          )}
        </span>
      )
    }
    if (event.data.content) {
      const content = event.data.content
      const truncated = content.length > 100 ? content.slice(0, 100) + '...' : content
      return <span className="text-text-primary whitespace-pre-wrap">{truncated}</span>
    }
    if (event.data.message) {
      return <span className="text-text-muted">{event.data.message}</span>
    }
    return null
  }

  const hasLongContent = (event.data.content?.length || 0) > 100
  const fullContent = event.data.content || ''

  return (
    <div className="text-xs">
      <div
        className={cn(
          'flex items-start gap-2 py-1 hover:bg-background-hover px-1 rounded',
          hasLongContent && 'cursor-pointer'
        )}
        onClick={() => hasLongContent && setIsExpanded(!isExpanded)}
      >
        <span className="text-text-tertiary shrink-0 w-16">{time}</span>
        <span className="shrink-0 mt-0.5">{getIcon()}</span>
        <span className="flex-1 min-w-0">{getContent()}</span>
        {hasLongContent && (
          <span className="shrink-0 text-text-muted">
            {isExpanded ? (
              <ChevronLeft className="w-3 h-3 rotate-90" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
      </div>
      {/* 展开的完整内容 */}
      {isExpanded && hasLongContent && (
        <div className="ml-[88px] mt-1 p-2 bg-background-base rounded border border-border-subtle">
          <pre className="text-xs text-text-primary whitespace-pre-wrap break-all font-mono">
            {fullContent}
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * 完成通知面板
 */
export function CompletionNotificationPanel() {
  const { completionNotifications, hasUnreadNotifications } = useAssistantStore()
  const { handleNotification, retryNotification } = useAssistant()
  const [isExpanded, setIsExpanded] = useState(false)

  // 监听后台任务完成事件，自动展开面板
  useEffect(() => {
    const eventBus = getEventBus()
    const unsubscribe = eventBus.onAny((event) => {
      if ((event as any).type === 'assistant_notification') {
        // 有新通知时自动展开
        setIsExpanded(true)
      }
    })
    return unsubscribe
  }, [])

  const pendingNotifications = completionNotifications.filter((n) => !n.handled)

  if (pendingNotifications.length === 0) return null

  const onImmediate = (notification: CompletionNotification) => {
    handleNotification(notification, 'immediate')
  }

  const onDelayed = (notification: CompletionNotification) => {
    handleNotification(notification, 'delayed')
  }

  const onIgnored = (notification: CompletionNotification) => {
    handleNotification(notification, 'ignored')
  }

  const onRetry = (notification: CompletionNotification) => {
    retryNotification(notification)
  }

  return (
    <div className="border-t border-border bg-background-surface">
      {/* 折叠状态栏 */}
      <div
        className="flex items-center justify-between px-4 h-10 cursor-pointer hover:bg-background-hover"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Bell className={cn('w-4 h-4', hasUnreadNotifications ? 'text-primary animate-pulse' : 'text-text-muted')} />
          <span className="text-sm text-text-primary">
            {pendingNotifications.length} 个任务完成待处理
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronUp className="w-4 h-4 text-text-muted" />
        )}
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-4 py-2 space-y-2 max-h-48 overflow-auto">
          {pendingNotifications.map((notification) => (
            <div
              key={notification.id}
              className="p-2 bg-background-elevated rounded border border-border"
            >
              <div className="text-xs text-text-tertiary mb-1">
                {new Date(notification.createdAt).toLocaleTimeString()}
              </div>
              <div className="text-sm text-text-primary mb-1 truncate" title={notification.prompt}>
                {notification.prompt.slice(0, 50)}...
              </div>
              <div className="text-xs text-text-muted mb-2 line-clamp-2">
                {notification.resultSummary}
              </div>
              {/* 错误信息和重试按钮 */}
              {notification.lastError && (
                <div className="text-xs text-danger mb-2 flex items-center gap-2">
                  <XCircle className="w-3 h-3" />
                  <span>处理失败 ({notification.retryCount || 0}/3): {notification.lastError}</span>
                  {(notification.retryCount || 0) < 3 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRetry(notification)
                      }}
                      className="text-primary hover:underline"
                    >
                      重试
                    </button>
                  )}
                </div>
              )}
              {/* 自动汇报状态 */}
              {notification.autoReported && (
                <div className="text-xs text-success mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>AI 已自动处理</span>
                </div>
              )}
              <div className="flex gap-2">
                {notification.autoReported ? (
                  // 已自动汇报时，提供"查看详情"和"忽略"
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onImmediate(notification)
                      }}
                      className="px-2 py-1 text-xs bg-background-hover text-text-secondary rounded hover:bg-background-surface"
                    >
                      查看详情
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onIgnored(notification)
                      }}
                      className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary"
                    >
                      忽略
                    </button>
                  </>
                ) : (
                  // 未自动汇报时，提供完整选项
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onImmediate(notification)
                      }}
                      className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/80"
                    >
                      立即处理
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelayed(notification)
                      }}
                      className="px-2 py-1 text-xs bg-background-hover text-text-secondary rounded hover:bg-background-surface"
                    >
                      稍后处理
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onIgnored(notification)
                      }}
                      className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary"
                    >
                      忽略
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
