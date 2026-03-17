/**
 * RightPanel - 右侧 AI 对话面板组件
 */

import { ReactNode } from 'react'
import { useViewStore } from '@/stores/viewStore'
import { ResizeHandle } from '../Common'

interface RightPanelProps {
  children: ReactNode
}

/**
 * 右侧面板组件
 * 支持折叠（完全隐藏）和任意宽度调整
 */
export function RightPanel({ children }: RightPanelProps) {
  const width = useViewStore((state) => state.rightPanelWidth)
  const setWidth = useViewStore((state) => state.setRightPanelWidth)
  const collapsed = useViewStore((state) => state.rightPanelCollapsed)

  // 折叠状态：不渲染面板
  if (collapsed) {
    return null
  }

  // 拖拽处理 - 调整宽度，支持更灵活的范围
  const handleResize = (delta: number) => {
    const newWidth = Math.max(200, Math.min(1200, width + delta))
    setWidth(newWidth)
  }

  return (
    <>
      {/* 拖拽手柄 */}
      <ResizeHandle direction="horizontal" position="left" onDrag={handleResize} />

      {/* 面板容器 - 使用固定宽度 */}
      <aside
        className="flex flex-col bg-background-elevated border-l border-border shrink-0"
        style={{ width: `${width}px` }}
      >
        {/* 内容区域 */}
        {children}
      </aside>
    </>
  )
}
