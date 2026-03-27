/**
 * 需求面板共享样式常量
 *
 * Card 和 Dialog 复用的状态/优先级颜色映射
 */

import type { RequirementStatus, RequirementPriority } from '@/types/requirement'

/** 状态颜色配置（含 dot 用于卡片状态点） */
export const STATUS_STYLES: Record<RequirementStatus, { text: string; bg: string; dot: string }> = {
  draft: { text: 'text-text-tertiary', bg: 'bg-gray-500/10', dot: 'bg-gray-500' },
  pending: { text: 'text-amber-500', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
  approved: { text: 'text-green-500', bg: 'bg-green-500/10', dot: 'bg-green-500' },
  rejected: { text: 'text-red-500', bg: 'bg-red-500/10', dot: 'bg-red-500' },
  executing: { text: 'text-blue-500', bg: 'bg-blue-500/10', dot: 'bg-blue-500' },
  completed: { text: 'text-indigo-500', bg: 'bg-indigo-500/10', dot: 'bg-indigo-500' },
  failed: { text: 'text-red-400', bg: 'bg-red-400/10', dot: 'bg-red-400' },
}

/** 优先级文字颜色 */
export const PRIORITY_TEXT: Record<RequirementPriority, string> = {
  low: 'text-text-tertiary',
  normal: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
}

/** 优先级背景颜色 */
export const PRIORITY_BG: Record<RequirementPriority, string> = {
  low: 'bg-gray-500/10',
  normal: 'bg-blue-500/10',
  high: 'bg-orange-500/10',
  urgent: 'bg-red-500/10',
}

/** 优先级排序权重（高权重优先） */
export const PRIORITY_WEIGHT: Record<RequirementPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
}

/** 时间格式预设 */
export const TIME_FORMAT_SHORT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

export const TIME_FORMAT_FULL: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

/** 格式化时间戳为本地化字符串 */
export function formatTime(ts: number, locale: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(ts).toLocaleString(locale, options ?? TIME_FORMAT_SHORT)
}
