/**
 * 引擎命令配置类型定义
 *
 * 用于支持 AI 引擎的原生命令行选项，提供可视化配置界面
 */

import type { EngineId } from './config'

/**
 * 命令选项类型
 */
export type CommandOptionType =
  | 'boolean'      // 开关选项，如 --yolo, --debug
  | 'string'       // 字符串输入，如 --system-prompt
  | 'select'       // 单选，如 --model, --permission-mode
  | 'multiselect'  // 多选，如 --tools
  | 'number'       // 数值输入，如 --max-tokens

/**
 * 命令选项定义
 */
export interface EngineCommandOption {
  /** 选项 ID（通常是 CLI 参数名，不含 --） */
  id: string
  /** 完整 CLI 参数名，如 --model */
  cliFlag: string
  /** 短参数名，如 -m */
  shortFlag?: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 选项类型 */
  type: CommandOptionType
  /** 是否必填 */
  required?: boolean
  /** 默认值 */
  defaultValue?: string | boolean | number | string[]
  /** 可选值列表（用于 select 和 multiselect） */
  options?: Array<{
    value: string
    label: string
    description?: string
  }>
  /** 占位符文本 */
  placeholder?: string
  /** 是否为危险操作（需要确认） */
  dangerous?: boolean
  /** 危险操作警告信息 */
  dangerWarning?: string
}

/**
 * 命令分类
 */
export interface EngineCommandCategory {
  /** 分类 ID */
  id: string
  /** 分类名称 */
  name: string
  /** 分类图标 */
  icon?: string
  /** 分类描述 */
  description?: string
  /** 该分类下的选项 */
  options: EngineCommandOption[]
}

/**
 * 引擎命令配置
 */
export interface EngineCommandsConfig {
  /** 引擎 ID */
  engineId: EngineId
  /** 引擎名称 */
  engineName: string
  /** 命令分类列表 */
  categories: EngineCommandCategory[]
}

/**
 * 用户选择的命令选项值
 */
export interface CommandOptionValue {
  /** 选项 ID */
  optionId: string
  /** 选项值 */
  value: string | boolean | number | string[]
}

/**
 * 引擎会话命令选项
 */
export interface EngineSessionOptions {
  /** 引擎 ID */
  engineId: EngineId
  /** 选择的命令选项 */
  options: CommandOptionValue[]
  /** 生成的 CLI 参数 */
  cliArgs: string[]
}

/**
 * 解析后的命令选项（从用户输入文本中提取）
 */
export interface ParsedCommandOption {
  /** 参数名（不含 --） */
  name: string
  /** 参数值 */
  value: string | boolean
  /** 在文本中的位置 */
  startIndex: number
  endIndex: number
}
