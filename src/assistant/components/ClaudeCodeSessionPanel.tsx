import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, Loader2, CheckCircle, XCircle, Bell, FileText, Code, Wrench, Trash2, ChevronRight, ChevronLeft } from 'lucide-react'
import { useAssistantStore } from '../store/assistantStore'
import { useAssistant } from '../hooks/useAssistant'
import { SessionTab } from './SessionTab'
import { cn } from '../../utils'
import { getEventBus } from '../../ai-runtime'
import { ResizeHandle } from '../../components/Common'
import type { ClaudeCodeExecutionEvent, CompletionNotification } from '../types'

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
 * Claude Code 多会话面板
 */
export function ClaudeCodeSessionPanel() {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT)
  const [autoScroll, setAutoScroll] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const {
    claudeCodeSessions,
    executionPanelSessionId,
    setExecutionPanelSession,
    clearSessionEvents,
  } = useAssistantStore()

  const sessions = Array.from(claudeCodeSessions.values())
  const runningSessions = sessions.filter((s) => s.status === 'running')

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

  if (sessions.length === 0) return null

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
          {runningSessions.length > 0 && (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          )}
          <span className="text-sm text-text-muted">
            {runningSessions.length > 0
              ? `${runningSessions.length} 个会话运行中`
              : 'Claude Code 会话'}
          </span>
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
          {/* 会话标签栏 */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border/50 overflow-x-auto shrink-0">
            {sessions.map((session) => (
              <SessionTab
                key={session.id}
                session={session}
                isActive={executionPanelSessionId === session.id}
                onClick={() => setExecutionPanelSession(session.id)}
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
