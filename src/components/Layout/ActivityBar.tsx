/**
 * ActivityBar - 左侧 Activity Bar 组件
 *
 * 固定在左侧的图标栏,始终可见,用于切换面板
 * 参考 VSCode 的 Activity Bar 设计
 * 支持折叠隐藏，点击悬浮球或悬停边缘区域时显示
 */

import { useState, useEffect, useRef } from 'react'
import { Files, GitPullRequest, CheckSquare, Settings, Languages, Clock, Terminal, Code2, PanelRight, PanelLeft } from 'lucide-react'
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
  const toggleActivityBar = useViewStore((state) => state.toggleActivityBar)

  // 悬停显示状态（用于折叠时边缘触发）
  const [isHoverVisible, setIsHoverVisible] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听鼠标移动到左边缘区域（边缘指示条区域）显示 ActivityBar
  useEffect(() => {
    if (!activityBarCollapsed) return

    const handleMouseMove = (e: MouseEvent) => {
      const edgeThreshold = 8 // 8px 边缘区域（与指示条宽度匹配）

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

  // 折叠状态下的渲染：显示悬浮球 + 边缘指示条
  if (activityBarCollapsed && !isHoverVisible) {
    return (
      <>
        {/* 边缘指示条：鼠标悬停时显示 ActivityBar */}
        <div
          className="fixed left-0 top-0 bottom-0 w-2 bg-transparent hover:bg-primary/10 hover:w-3 transition-all duration-200 cursor-pointer z-40"
          onMouseEnter={() => setIsHoverVisible(true)}
          title={t('labels.showActivityBar')}
        />

        {/* 悬浮球：点击显示 ActivityBar */}
        <button
          onClick={toggleActivityBar}
          className="fixed left-4 bottom-4 w-10 h-10 rounded-full bg-primary text-white shadow-lg
                     flex items-center justify-center
                     hover:bg-primary-hover hover:scale-110 hover:shadow-xl
                     active:scale-95
                     transition-all duration-200 ease-out
                     z-50 group"
          title={t('labels.showActivityBar')}
        >
          <PanelLeft className="w-5 h-5 transition-transform group-hover:scale-110" />
        </button>
      </>
    )
  }

  return (
    <div
      className={`flex flex-col items-center shrink-0 w-12 py-2 bg-background-elevated border-r border-border transition-opacity duration-200 ${
        activityBarCollapsed ? 'absolute left-0 top-0 bottom-0 z-50 shadow-lg' : ''
      } ${className || ''}`}
      onMouseEnter={() => {
        if (activityBarCollapsed && hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current)
          hoverTimeoutRef.current = null
        }
      }}
      onMouseLeave={() => {
        if (activityBarCollapsed) {
          // 鼠标离开时延迟隐藏
          hoverTimeoutRef.current = setTimeout(() => {
            setIsHoverVisible(false)
            hoverTimeoutRef.current = null
          }, 300)
        }
      }}
    >
      {/* 折叠状态下显示关闭按钮 */}
      {activityBarCollapsed && (
        <button
          onClick={toggleActivityBar}
          className="w-10 h-10 mx-1 mb-2 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
          title={t('labels.hideActivityBar')}
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

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
