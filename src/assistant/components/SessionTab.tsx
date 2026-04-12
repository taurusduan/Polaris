import { Loader2, CheckCircle, XCircle, Code, Clock, Square, CheckSquare } from 'lucide-react'
import type { ClaudeCodeSessionState } from '../types'
import { cn } from '../../utils'

/** 格式化执行用时 */
function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now()
  const diff = Math.floor((end - startTime) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
}

interface SessionTabProps {
  session: ClaudeCodeSessionState
  isActive: boolean
  onClick: () => void
  /** 是否选中（批量操作模式） */
  isSelected?: boolean
  /** 选择回调 */
  onSelect?: () => void
  /** 是否显示选择框 */
  showCheckbox?: boolean
}

/**
 * 会话标签
 */
export function SessionTab({ session, isActive, onClick, isSelected, onSelect, showCheckbox }: SessionTabProps) {
  const duration = formatDuration(session.createdAt, session.status === 'running' ? undefined : session.lastActiveAt)
  const isRunning = session.status === 'running'

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.()
  }

  return (
    <button
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
        isActive
          ? 'bg-primary/20 text-primary'
          : 'text-text-muted hover:bg-background-surface',
        isSelected && 'ring-1 ring-primary/50'
      )}
      onClick={onClick}
    >
      {/* 选择框 */}
      {showCheckbox && (
        <span onClick={handleCheckboxClick} className="shrink-0">
          {isSelected ? (
            <CheckSquare className="w-3 h-3 text-primary" />
          ) : (
            <Square className="w-3 h-3 text-text-tertiary hover:text-text-secondary" />
          )}
        </span>
      )}

      {/* 状态图标 */}
      {session.status === 'running' && (
        <Loader2 className="w-3 h-3 animate-spin" />
      )}
      {session.status === 'completed' && (
        <CheckCircle className="w-3 h-3 text-success" />
      )}
      {session.status === 'error' && (
        <XCircle className="w-3 h-3 text-danger" />
      )}
      {session.status === 'idle' && (
        <Code className="w-3 h-3 text-text-tertiary" />
      )}

      {/* 标签 */}
      <span className="truncate max-w-[80px]">{session.label}</span>

      {/* 类型标记 */}
      {session.type === 'primary' && (
        <span className="text-[10px] text-text-tertiary bg-background-surface px-1 rounded">主</span>
      )}
      {session.type === 'background' && (
        <span className="text-[10px] text-text-tertiary bg-background-surface px-1 rounded">后台</span>
      )}
      {session.type === 'analysis' && (
        <span className="text-[10px] text-text-tertiary bg-background-surface px-1 rounded">分析</span>
      )}

      {/* 运行时间 */}
      {isRunning && (
        <span className="text-[10px] text-text-tertiary flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {duration}
        </span>
      )}
    </button>
  )
}
