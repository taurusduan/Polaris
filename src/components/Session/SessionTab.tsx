/**
 * SessionTab - 单个会话标签组件
 */

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { X, Loader2 } from 'lucide-react'
import { StatusDot } from './StatusDot'
import type { SessionMetadata } from '@/stores/conversationStore/types'
import type { SessionStatus } from '@/types/session'

interface SessionTabProps {
  session: SessionMetadata
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  canClose: boolean
}

export const SessionTab = memo(function SessionTab({
  session,
  isActive,
  onSelect,
  onClose,
  canClose,
}: SessionTabProps) {
  const isRunning = session.status === 'running' || session.status === 'background-running'

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer',
        'border border-b-0 border-border transition-colors',
        'min-w-[100px] max-w-[180px]',
        isActive
          ? 'bg-background-elevated text-text-primary border-b-background-elevated'
          : 'bg-background-surface text-text-secondary hover:bg-background-hover'
      )}
      role="tab"
      aria-selected={isActive}
    >
      {/* 状态指示器 */}
      <StatusDot status={mapSessionStatus(session.status)} size="sm" />

      {/* 标题 */}
      <span className="flex-1 text-sm truncate" title={session.title}>
        {session.title}
      </span>

      {/* 运行中指示器 */}
      {isRunning && (
        <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
      )}

      {/* 关闭按钮 */}
      {canClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className={cn(
            'shrink-0 p-0.5 rounded',
            'text-text-muted hover:text-text-primary hover:bg-background-hover',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
          title="关闭会话"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
})

/**
 * 映射会话状态到状态点状态
 */
function mapSessionStatus(
  status: SessionMetadata['status']
): SessionStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'waiting':
      return 'waiting'
    case 'error':
      return 'error'
    case 'background-running':
      return 'background-running'
    default:
      return 'idle'
  }
}