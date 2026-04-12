import type { OpenAIEngineConfig } from './types'
import { DEFAULT_OPENAI_CONFIG } from './types'

/** 配置验证结果 */
export interface ConfigValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 验证 OpenAI 引擎配置
 */
export function validateConfig(config: Partial<OpenAIEngineConfig>): ConfigValidationResult {
  const errors: string[] = []

  // baseUrl 验证
  if (config.baseUrl !== undefined) {
    try {
      new URL(config.baseUrl)
    } catch {
      errors.push('baseUrl must be a valid URL')
    }
  }

  // apiKey 验证
  if (config.apiKey !== undefined && config.apiKey.trim() === '') {
    errors.push('apiKey cannot be empty string')
  }

  // model 验证
  if (config.model !== undefined && config.model.trim() === '') {
    errors.push('model cannot be empty string')
  }

  // maxTokens 验证
  if (config.maxTokens !== undefined) {
    if (config.maxTokens < 1) {
      errors.push('maxTokens must be at least 1')
    }
    if (config.maxTokens > 128000) {
      errors.push('maxTokens cannot exceed 128000')
    }
  }

  // temperature 验证
  if (config.temperature !== undefined) {
    if (config.temperature < 0 || config.temperature > 2) {
      errors.push('temperature must be between 0 and 2')
    }
  }

  // timeout 验证
  if (config.timeout !== undefined) {
    if (config.timeout < 1000) {
      errors.push('timeout must be at least 1000ms')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 合并配置与默认值
 */
export function mergeWithDefaults(config: Partial<OpenAIEngineConfig>): OpenAIEngineConfig {
  return {
    ...DEFAULT_OPENAI_CONFIG,
    ...config,
  } as OpenAIEngineConfig
}

/**
 * 检查配置是否完整（包含必要字段）
 */
export function isConfigComplete(config: Partial<OpenAIEngineConfig>): config is OpenAIEngineConfig {
  return (
    typeof config.baseUrl === 'string' &&
    config.baseUrl.length > 0 &&
    typeof config.apiKey === 'string' &&
    config.apiKey.length > 0 &&
    typeof config.model === 'string' &&
    config.model.length > 0
  )
}
