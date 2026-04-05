/**
 * SessionNavigatorPanel - 会话导航展开面板
 *
 * 向上展开的会话选择和工作区切换面板
 */

import { memo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'
import { Plus, Loader2, X, FolderOpen, ChevronDown, Lock, Check, FolderPlus } from 'lucide-react'
import { StatusSymbol } from '@/components/QuickSwitchPanel/StatusSymbol'
import { CreateSessionModal } from '@/components/Session/CreateSessionModal'
import { CreateWorkspaceModal } from '@/components/Workspace/CreateWorkspaceModal'
import { createLogger } from '@/utils/logger'
import type { SessionNavigatorPanelProps, WorkspaceNavItem } from './types'

const log = createLogger('SessionNavigatorPanel')

export const SessionNavigatorPanel = memo(function SessionNavigatorPanel({
  sessions,
  currentWorkspace,
  workspaces,
  contextWorkspaceIds,
  isWorkspaceLocked,
  onSwitchSession,
  onDeleteSession,
  onCreateSession,
  onSwitchWorkspace,
  onToggleContextWorkspace,
  onClose,
}: SessionNavigatorPanelProps) {
  // 工作区下拉状态
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false)
  const workspaceButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })

  // 新建会话弹窗状态
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false)

  // 获取当前活跃会话
  const activeSession = sessions.find(s => s.isActive)

  // 工作区显示名称
  const workspaceDisplayName = currentWorkspace?.name || '工作区'

  // 计算关联工作区数量
  const totalContextCount = contextWorkspaceIds.length + (currentWorkspace ? 1 : 0)

  // 打开/关闭工作区下拉
  const handleToggleDropdown = (open: boolean) => {
    log.info('handleToggleDropdown', { open })
    if (open && workspaceButtonRef.current) {
      const rect = workspaceButtonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
    setIsWorkspaceDropdownOpen(open)
  }

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element
      const clickedButton = workspaceButtonRef.current?.contains(target)
      const clickedDropdown = !!target.closest('[data-workspace-dropdown]')
      if (!clickedButton && !clickedDropdown) {
        handleToggleDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 按主工作区优先排序
  const sortedWorkspaces = [...workspaces].sort((a, b) => {
    if (a.isMain) return -1
    if (b.isMain) return 1
    if (a.isContext && !b.isContext) return -1
    if (!a.isContext && b.isContext) return 1
    return 0
  })

  return (
    <>
      <div
        className={cn(
          'w-60',
          'bg-background-elevated/98 backdrop-blur-2xl',
          'border border-border/40',
          'rounded-xl',
          'shadow-2xl shadow-black/30',
          'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
          'overflow-hidden'
        )}
      >
        {/* 顶部发光线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        {/* 头部：当前会话概览 */}
        <div className="px-3 py-2.5 border-b border-border-subtle/30">
          <div className="flex items-center gap-2">
            {activeSession && (
              <>
                <StatusSymbol status={activeSession.status} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">
                    {activeSession.title}
                  </div>
                  {/* 工作区按钮 */}
                  <button
                    ref={workspaceButtonRef}
                    onClick={() => handleToggleDropdown(!isWorkspaceDropdownOpen)}
                    className={cn(
                      'flex items-center gap-1 mt-0.5 px-1 py-0.5 rounded',
                      'text-[10px] text-text-muted',
                      'hover:bg-background-hover/50 hover:text-text-secondary',
                      'transition-colors'
                    )}
                  >
                    <FolderOpen className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[100px]">{workspaceDisplayName}</span>
                    {totalContextCount > 1 && (
                      <span className="text-primary">+{totalContextCount - 1}</span>
                    )}
                    <ChevronDown className={cn(
                      'w-2.5 h-2.5 transition-transform',
                      isWorkspaceDropdownOpen && 'rotate-180'
                    )} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 会话列表 */}
        <div className="py-1.5">
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group relative mx-1.5 flex items-center gap-2 px-2 py-1.5 rounded-lg',
                  'text-xs transition-all duration-150 cursor-pointer',
                  session.isActive
                    ? 'bg-primary/10 border border-primary/15'
                    : 'hover:bg-background-hover/50 border border-transparent'
                )}
                onClick={() => {
                  onSwitchSession(session.id)
                  onClose()
                }}
              >
                {/* 活跃指示条 */}
                {session.isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full shadow-[0_0_6px_rgba(59,130,246,0.4)]" />
                )}

                {/* 状态符号 */}
                <StatusSymbol status={session.status} size="sm" />

                {/* 会话名 */}
                <span className={cn(
                  'flex-1 truncate',
                  session.isActive ? 'text-primary font-medium' : 'text-text-secondary'
                )}>
                  {session.title}
                </span>

                {/* 运行中 */}
                {session.status === 'running' && (
                  <Loader2 className="w-3 h-3 animate-spin text-success shrink-0" />
                )}

                {/* 删除按钮 */}
                {session.canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSession(session.id)
                    }}
                    className={cn(
                      'opacity-0 group-hover:opacity-100 p-0.5 rounded',
                      'text-text-muted hover:text-danger hover:bg-danger/10',
                      'transition-all shrink-0'
                    )}
                    title="关闭"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 底部：新建会话 */}
        <div className="px-2 pb-2 pt-1 border-t border-border-subtle/20">
          <button
            onClick={() => setShowCreateSessionModal(true)}
            className={cn(
              'w-full px-2 py-1.5 rounded-lg',
              'border border-dashed border-border-subtle/50',
              'text-[11px] text-text-muted',
              'hover:bg-background-hover/30 hover:text-text-secondary hover:border-border/30',
              'transition-all duration-150',
              'flex items-center justify-center gap-1'
            )}
          >
            <Plus className="w-3 h-3" />
            <span>新建会话</span>
          </button>
        </div>
      </div>

      {/* 工作区下拉菜单 - Portal */}
      {isWorkspaceDropdownOpen && createPortal(
        <WorkspaceDropdown
          sessionId={activeSession?.id || null}
          workspaces={sortedWorkspaces}
          currentWorkspaceId={currentWorkspace?.id || null}
          contextWorkspaceIds={contextWorkspaceIds}
          isLocked={isWorkspaceLocked}
          position={dropdownPosition}
          onSelect={onSwitchWorkspace}
          onToggleContext={onToggleContextWorkspace}
          onClose={() => handleToggleDropdown(false)}
        />,
        document.body
      )}

      {/* 新建会话弹窗 */}
      {showCreateSessionModal && (
        <CreateSessionModal onClose={() => setShowCreateSessionModal(false)} />
      )}
    </>
  )
})

// ============================================================================
// WorkspaceDropdown - 工作区下拉菜单
// ============================================================================

interface WorkspaceDropdownProps {
  sessionId: string | null
  workspaces: WorkspaceNavItem[]
  currentWorkspaceId: string | null
  contextWorkspaceIds: string[]
  isLocked: boolean
  position: { top: number; left: number }
  onSelect: (workspaceId: string) => void
  onToggleContext: (workspaceId: string) => void
  onClose: () => void
}

const WorkspaceDropdown = memo(function WorkspaceDropdown({
  sessionId,
  workspaces,
  currentWorkspaceId,
  contextWorkspaceIds,
  isLocked,
  position,
  onSelect,
  onToggleContext,
  onClose: _onClose,
}: WorkspaceDropdownProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)

  const handleSetMain = (workspaceId: string) => {
    if (isLocked || !sessionId) return
    onSelect(workspaceId)
  }

  const handleToggleContext = (workspaceId: string) => {
    if (!sessionId) return
    onToggleContext(workspaceId)
  }

  return (
    <>
      <div
        data-workspace-dropdown
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: 200,
        }}
        className={cn(
          'z-50 bg-background-elevated border border-border rounded-xl',
          'shadow-xl overflow-hidden',
          'animate-in fade-in-0 zoom-in-95 duration-150'
        )}
      >
        {/* 锁定提示 */}
        {isLocked && (
          <div className="px-2.5 py-1.5 bg-warning/10 border-b border-border-subtle flex items-center gap-1.5 text-[10px] text-warning">
            <Lock className="w-3 h-3" />
            <span>创建时已指定主工作区，不可修改</span>
          </div>
        )}

        {/* 工作区列表 */}
        <div className="max-h-48 overflow-y-auto">
          {workspaces.length === 0 ? (
            <div className="py-3 text-center text-xs text-text-tertiary">
              暂无工作区
            </div>
          ) : (
            workspaces.map((ws) => {
              const isCurrent = ws.id === currentWorkspaceId
              const isContext = contextWorkspaceIds.includes(ws.id)

              return (
                <div
                  key={ws.id}
                  className={cn(
                    'group relative flex items-center',
                    isCurrent && (isLocked ? 'bg-primary/5 opacity-80' : 'bg-primary/5')
                  )}
                >
                  {/* 当前工作区左侧指示条 */}
                  {isCurrent && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                  )}

                  {/* 锁定图标 */}
                  {isCurrent && isLocked && (
                    <div className="px-2">
                      <Lock className="w-3 h-3 text-text-muted" />
                    </div>
                  )}

                  {/* 工作区信息 */}
                  <button
                    onClick={() => handleSetMain(ws.id)}
                    disabled={isLocked && isCurrent}
                    className={cn(
                      'flex-1 text-left px-2.5 py-1.5 text-xs transition-colors',
                      isCurrent
                        ? 'text-primary'
                        : isLocked
                          ? 'text-text-tertiary cursor-not-allowed'
                          : 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
                      isLocked && isCurrent && 'cursor-not-allowed'
                    )}
                  >
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {isCurrent && !isLocked && (
                        <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                      )}
                      {ws.name}
                    </div>
                  </button>

                  {/* 主标签 */}
                  {isCurrent && (
                    <span className="px-1.5 text-[10px] text-primary">主</span>
                  )}

                  {/* 关联按钮 */}
                  {!isCurrent && workspaces.length > 1 && (
                    <button
                      onClick={() => handleToggleContext(ws.id)}
                      className={cn(
                        'p-1 rounded transition-colors shrink-0',
                        isContext
                          ? 'text-primary bg-primary/10'
                          : 'text-text-tertiary hover:text-primary hover:bg-background-hover opacity-0 group-hover:opacity-100'
                      )}
                      title={isContext ? '移除关联' : '添加关联'}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* 分割线 */}
        <div className="border-t border-border-subtle" />

        {/* 新增工作区 */}
        <button
          onClick={() => setShowCreateModal(true)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-xs',
            'text-text-secondary hover:text-text-primary hover:bg-background-hover',
            'transition-colors'
          )}
        >
          <FolderPlus className="w-3.5 h-3.5 text-text-muted" />
          <span>新增工作区</span>
        </button>

        {/* 新建工作区弹窗 */}
        {showCreateModal && (
          <CreateWorkspaceModal onClose={() => setShowCreateModal(false)} />
        )}
      </div>
    </>
  )
})