/**
 * QuickSwitchTrigger - 快速切换触发器组件
 *
 * 右侧贴边的控制面板触发器 - 太空舱拨片开关风格
 */

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { StatusSymbol } from './StatusSymbol'
import type { SessionStatus } from '@/types/session'

interface QuickSwitchTriggerProps {
  /** 当前会话状态 */
  status: SessionStatus
  /** 是否悬停中 */
  isHovering: boolean
  /** 悬停进入回调 */
  onMouseEnter: () => void
  /** 悬停离开回调 */
  onMouseLeave: () => void
}

export const QuickSwitchTrigger = memo(function QuickSwitchTrigger({
  status,
  isHovering,
  onMouseEnter,
  onMouseLeave,
}: QuickSwitchTriggerProps) {
  return (
    <div
      className={cn(
        // 尺寸：拨片开关造型
        'w-10 h-14',
        // 位置
        'relative',
        // 交互
        'cursor-pointer',
        // 过渡动画
        'transition-all duration-200 ease-out'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 拨片主体 - 斜切几何造型 */}
      <div
        className={cn(
          'absolute inset-0',
          // 几何造型：左上斜切
          'bg-gradient-to-b from-background-elevated/95 to-background-elevated/80',
          // 斜切角落
          '[clip-path:polygon(20%_0,_100%_0,_100%_100%,_0_100%,_0_20%)]',
          // 微妙边框发光
          'border-l-2 border-l-border/30',
          // 阴影
          'shadow-lg shadow-black/20',
          // 过渡
          'transition-all duration-200'
        )}
      />

      {/* 状态边缘发光线 */}
      <div
        className={cn(
          'absolute left-0 top-[20%] bottom-0 w-0.5',
          'transition-all duration-300',
          // 根据状态显示不同颜色
          status === 'running' && 'bg-success shadow-[0_0_8px_rgba(52,211,153,0.6)]',
          status === 'waiting' && 'bg-info shadow-[0_0_8px_rgba(96,165,250,0.6)]',
          status === 'error' && 'bg-danger shadow-[0_0_8px_rgba(248,113,113,0.6)]',
          status === 'idle' && 'bg-text-muted',
          status === 'background-running' && 'bg-text-tertiary shadow-[0_0_6px_rgba(142,142,147,0.4)]'
        )}
      />

      {/* 内容区域 */}
      <div
        className={cn(
          'absolute inset-0 [clip-path:polygon(20%_0,_100%_0,_100%_100%,_0_100%,_0_20%)]',
          'flex flex-col items-center justify-center gap-1.5',
          'px-2 py-2',
          // 悬停时的变换效果
          isHovering && 'scale-[1.02] translate-x-[-1px]'
        )}
      >
        {/* 状态几何符号 */}
        <StatusSymbol status={status} size="sm" />

        {/* 快捷指示图标 */}
        <div
          className={cn(
            'w-3 h-3',
            // 双横线造型（表示"面板/抽屉"）
            'flex flex-col gap-0.5 items-center justify-center'
          )}
        >
          <div className="w-2 h-0.5 bg-text-muted rounded-full" />
          <div className="w-1.5 h-0.5 bg-text-tertiary rounded-full" />
        </div>
      </div>

      {/* 悬停时的顶部发光 */}
      {isHovering && (
        <div
          className={cn(
            'absolute top-0 left-[20%] right-0 h-px',
            'bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0',
            'shadow-[0_0_12px_rgba(59,130,246,0.4)]'
          )}
        />
      )}
    </div>
  )
})
