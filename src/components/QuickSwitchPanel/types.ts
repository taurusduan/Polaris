/**
 * QuickSwitchPanel 组件类型定义
 */

import type { SessionStatus } from '@/types/session'

/** 面板可见状态 */
export type PanelVisibility = 'hidden' | 'visible'

/** 会话项信息 */
export interface QuickSessionInfo {
  id: string
  title: string
  status: SessionStatus
  isActive: boolean
}

/** 工作区项信息 */
export interface QuickWorkspaceInfo {
  id: string
  name: string
  path: string
  isMain: boolean
  contextCount: number
}

/** QuickSwitchPanel Props */
export interface QuickSwitchPanelProps {
  /** 自定义类名 */
  className?: string
}