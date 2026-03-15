/**
 * 引擎命令选项工具函数
 *
 * 用于将用户选择的命令选项转换为 CLI 参数
 */

import type { CommandOptionValue, EngineCommandOption } from '../types/engineCommand'
import { getEngineCommands, getAllOptions } from '../config/engineCommands'

/**
 * 将命令选项值转换为 CLI 参数数组
 */
export function optionsToCliArgs(
  engineId: string,
  options: CommandOptionValue[]
): string[] {
  const config = getEngineCommands(engineId)
  if (!config) return []

  const allOptions = getAllOptions(config)
  const args: string[] = []

  for (const opt of options) {
    const optionDef = allOptions.find((o) => o.id === opt.optionId)
    if (!optionDef) continue

    const cliArg = optionValueToCliArg(optionDef, opt.value)
    if (cliArg) {
      args.push(...cliArg)
    }
  }

  return args
}

/**
 * 将单个选项值转换为 CLI 参数
 */
function optionValueToCliArg(
  option: EngineCommandOption,
  value: string | boolean | number | string[]
): string[] | null {
  // 布尔值：仅当为 true 时添加 flag
  if (option.type === 'boolean') {
    if (value === true) {
      return [option.cliFlag]
    }
    return null
  }

  // 多选：逗号分隔的值列表
  if (option.type === 'multiselect') {
    const values = value as string[]
    if (values.length > 0) {
      return [option.cliFlag, values.join(',')]
    }
    return null
  }

  // 其他类型：需要有效值
  if (value === '' || value === undefined || value === null) {
    return null
  }

  // 数值类型
  if (option.type === 'number') {
    return [option.cliFlag, String(value)]
  }

  // 字符串和单选
  return [option.cliFlag, String(value)]
}

/**
 * 合并默认选项和用户选项
 */
export function mergeOptions(
  defaultOptions: CommandOptionValue[],
  userOptions: CommandOptionValue[]
): CommandOptionValue[] {
  const merged = new Map<string, CommandOptionValue>()

  // 先添加默认选项
  for (const opt of defaultOptions) {
    merged.set(opt.optionId, opt)
  }

  // 用户选项覆盖默认选项
  for (const opt of userOptions) {
    merged.set(opt.optionId, opt)
  }

  return Array.from(merged.values())
}

/**
 * 验证选项值
 */
export function validateOptionValue(
  option: EngineCommandOption,
  value: unknown
): { valid: boolean; error?: string } {
  switch (option.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Value must be a boolean' }
      }
      break

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: 'Value must be a number' }
      }
      break

    case 'select':
      if (option.options && !option.options.some((o) => o.value === value)) {
        return { valid: false, error: `Invalid value. Must be one of: ${option.options.map((o) => o.value).join(', ')}` }
      }
      break

    case 'multiselect':
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Value must be an array' }
      }
      if (option.options) {
        const validValues = new Set(option.options.map((o) => o.value))
        for (const v of value) {
          if (!validValues.has(v)) {
            return { valid: false, error: `Invalid value: ${v}` }
          }
        }
      }
      break

    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: 'Value must be a string' }
      }
      break
  }

  return { valid: true }
}

/**
 * 获取选项的显示文本
 */
export function getOptionDisplayText(
  option: EngineCommandOption,
  value: string | boolean | number | string[]
): string {
  if (option.type === 'boolean') {
    return value ? '启用' : '禁用'
  }

  if (option.type === 'select' && option.options) {
    const opt = option.options.find((o) => o.value === value)
    return opt?.label || String(value)
  }

  if (option.type === 'multiselect' && Array.isArray(value)) {
    if (value.length === 0) return '无'
    if (option.options) {
      return value
        .map((v) => option.options?.find((o) => o.value === v)?.label || v)
        .join(', ')
    }
    return value.join(', ')
  }

  return String(value)
}
