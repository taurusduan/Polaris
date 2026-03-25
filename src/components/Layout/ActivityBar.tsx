/**
 * ActivityBar - 左侧 Activity Bar 组件
 *
 * 固定在左侧的图标栏,始终可见,用于切换面板
 * 参考 VSCode 的 Activity Bar 设计
 * 支持折叠隐藏，鼠标悬停边缘区域时显示
 */

import { useState, useEffect, useRef } from 'react'
import { Files, GitPullRequest, CheckSquare, Settings, Languages, Clock, Terminal, Code2, PanelRight } from 'lucide-react'
import { useViewStore } from '@/stores/viewStore'
import { ActivityBarIcon } from './ActivityBarIcon'
import { useTranslation } from 'react-i18next'

interface ActivityBarProps {
  className?: string
  /** 可选: 打开设置的回调 */
  onOpenSettings?: () => void
  /** 可选: 切换右侧面板的回调 */
  onToggleRightPanel?: () => void
  /** 右侧面板是否折叠 */
  rightPanelCollapsed?: boolean
}

export function ActivityBar({ className, onOpenSettings, onToggleRightPanel, rightPanelCollapsed }: ActivityBarProps) {
  const { t } = useTranslation('common')
  const leftPanelType = useViewStore((state) => state.leftPanelType)
  const toggleLeftPanel = useViewStore((state) => state.toggleLeftPanel)
  const activityBarCollapsed = useViewStore((state) => state.activityBarCollapsed)

  // 悬停显示状态
  const [isHoverVisible, setIsHoverVisible] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听鼠标移动到左边缘区域（5%宽度）显示 ActivityBar
  useEffect(() => {
    if (!activityBarCollapsed) return

    const handleMouseMove = (e: MouseEvent) => {
      const edgeThreshold = window.innerWidth * 0.05 // 5% 屏幕宽度

      if (e.clientX <= edgeThreshold) {
        // 鼠标进入左边缘区域
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current)
        }
        setIsHoverVisible(true)
      } else if (isHoverVisible) {
        // 鼠标离开边缘区域，延迟隐藏
        if (!hoverTimeoutRef.current) {
          hoverTimeoutRef.current = setTimeout(() => {
            setIsHoverVisible(false)
            hoverTimeoutRef.current = null
          }, 300)
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [activityBarCollapsed, isHoverVisible])

  const panelButtons = [
    {
      id: 'files' as const,
      icon: Files,
      label: t('labels.fileExplorer'),
    },
    {
      id: 'git' as const,
      icon: GitPullRequest,
      label: t('labels.gitPanel'),
    },
    {
      id: 'todo' as const,
      icon: CheckSquare,
      label: t('labels.todoPanel'),
    },
    {
      id: 'translate' as const,
      icon: Languages,
      label: t('labels.translatePanel'),
    },
    {
      id: 'scheduler' as const,
      icon: Clock,
      label: t('labels.schedulerPanel'),
    },
    {
      id: 'terminal' as const,
      icon: Terminal,
      label: t('labels.terminalPanel'),
    },
    {
      id: 'developer' as const,
      icon: Code2,
      label: t('labels.developerPanel'),
    },
  ]

  // 折叠状态下的渲染：只显示悬停触发区域
  if (activityBarCollapsed && !isHoverVisible) {
    return null
  }

  return (
    <div
      className={`flex flex-col items-center shrink-0 w-12 py-2 bg-background-elevated border-r border-border transition-opacity duration-200 ${
        activityBarCollapsed ? 'absolute left-0 top-0 bottom-0 z-50 shadow-lg opacity-95' : ''
      } ${className || ''}`}
      onMouseEnter={() => {
        if (activityBarCollapsed && hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current)
          hoverTimeoutRef.current = null
        }
      }}
    >
      {panelButtons.map((btn) => (
        <ActivityBarIcon
          key={btn.id}
          icon={btn.icon}
          label={btn.label}
          active={leftPanelType === btn.id}
          onClick={() => toggleLeftPanel(btn.id)}
        />
      ))}

      <div className="flex-1" />

      {/* 右侧 AI 面板切换按钮 */}
      <ActivityBarIcon
        icon={PanelRight}
        label={rightPanelCollapsed ? t('labels.showAIPanel') : t('labels.hideAIPanel')}
        active={!rightPanelCollapsed}
        onClick={onToggleRightPanel || (() => {})}
      />

      <ActivityBarIcon
        icon={Settings}
        label={t('labels.settings')}
        active={false}
        onClick={onOpenSettings || (() => {})}
      />
    </div>
  )
}
