/**
 * AI Runtime Service - 事件驱动版本
 *
 * 这是新架构的核心服务层：
 * 1. 使用 EventBus 进行事件分发
 * 2. 完全基于 AIEvent 进行通信（后端已转换）
 */

import type { AISession, AIEvent } from '../ai-runtime'
import { getEventBus, type EventBus, DEFAULT_ENGINE_ID } from '../ai-runtime'
import { createParser, type CLIParser } from '../ai-runtime'
import { getEngineRegistry } from '../ai-runtime'
import { invoke } from '@tauri-apps/api/core'
import { getEventRouter } from './eventRouter'

/**
 * AI Runtime 配置
 */
export interface AIRuntimeConfig {
  /** 工作区目录 */
  workspaceDir?: string
  /** 是否启用详细日志 */
  verbose?: boolean
  /** 是否启用 EventBus 调试 */
  debug?: boolean
  /** 使用的引擎 ID */
  engineId?: 'claude-code' | 'iflow' | 'deepseek' | 'codex'
}

/**
 * AI Runtime 服务类（事件驱动版本）
 *
 * 核心特性：
 * 1. 使用 EventBus 进行全局事件分发
 * 2. 完全基于 AIEvent 进行通信
 * 3. 后端已完成事件转换，前端无需再解析
 */
export class AIRuntimeService {
  private eventBus: EventBus
  private parser: CLIParser
  private currentSession: AISession | null = null
  private unregister: (() => void) | null = null
  private config: AIRuntimeConfig
  private currentEngineId: 'claude-code' | 'iflow' | 'deepseek' | 'codex' = 'claude-code'

  constructor(config?: AIRuntimeConfig) {
    this.config = config || {}
    this.currentEngineId = this.config.engineId || 'claude-code'
    this.eventBus = getEventBus({ debug: this.config.debug })
    this.parser = createParser()
  }

  async initialize(): Promise<void> {
    await this.setupEventListeners()

    const registry = getEngineRegistry()
    if (registry.has(DEFAULT_ENGINE_ID)) {
      const engine = registry.get(DEFAULT_ENGINE_ID)
      if (engine?.initialize) {
        await engine.initialize()
      }
    }
  }

  private async setupEventListeners(): Promise<void> {
    if (this.unregister) {
      return
    }

    const router = getEventRouter()
    await router.initialize()

    // 后端已发送标准 AIEvent，直接使用
    this.unregister = router.register('*', (routedEvent: unknown) => {
      try {
        const event = routedEvent as { contextId: string; payload: AIEvent }
        const aiEvent = event.payload

        // 直接发送到 EventBus
        this.eventBus.emit(aiEvent)
      } catch (e) {
        console.error('[AIRuntimeService] Failed to process event:', e)
      }
    })
  }

  /**
   * 获取 EventBus 实例
   */
  getEventBus(): EventBus {
    return this.eventBus
  }

  /**
   * 获取 Parser 实例
   */
  getParser(): CLIParser {
    return this.parser
  }

  /**
   * 规范化消息内容
   * - 统一换行符为 \\n 字符串（避免 iFlow CLI 参数解析问题）
   * - 移除首尾空白
   * - 验证消息不为空
   */
  private normalizeMessage(message: string): string {
    // 将换行符替换为 \\n 字符串，避免 iFlow CLI 参数解析问题
    // iFlow CLI 的参数解析器可能无法正确处理包含实际换行符的参数值
    const normalized = message
      .replace(/\r\n/g, '\\n')
      .replace(/\r/g, '\\n')
      .replace(/\n/g, '\\n');
    // 移除首尾空白
    return normalized.trim();
  }

  /**
   * 验证消息内容
   * - 检查消息是否为空
   * - 检查是否包含可能导致问题的特殊字符（仅警告）
   */
  private validateMessage(message: string): void {
    if (message.length === 0) {
      throw new Error('消息不能为空');
    }

    // 检查是否包含可能导致问题的特殊字符
    const problematicChars = /[\[\]{}(){new_string}|;*?!<>]/;
    if (problematicChars.test(message)) {
      console.warn('[AIRuntimeService] 消息包含可能导致问题的特殊字符:', message);
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(message: string, sessionId?: string): Promise<string> {
    // 规范化消息
    const normalized = this.normalizeMessage(message);
    // 验证消息
    this.validateMessage(normalized);

    const workDir = this.config.workspaceDir;
    const engineId = this.currentEngineId;

    if (sessionId) {
      await invoke('continue_chat', { sessionId, message: normalized, workDir, engineId });
      return sessionId;
    } else {
      const newSessionId = await invoke<string>('start_chat', {
        message: normalized,
        workDir,
        engineId,
      });
      return newSessionId;
    }
  }

  /**
   * 中断会话
   */
  async interrupt(sessionId: string): Promise<void> {
    await invoke('interrupt_chat', { sessionId })

    // 发送中断事件
    this.eventBus.emit({
      type: 'session_end',
      sessionId,
      reason: 'aborted',
    })
  }

  getCurrentSession(): AISession | null {
    return this.currentSession
  }

  setCurrentSession(session: AISession | null): void {
    this.currentSession = session
  }

  async cleanup(): Promise<void> {
    if (this.unregister) {
      this.unregister()
      this.unregister = null
    }

    this.parser.reset()
    this.eventBus.clear()

    if (this.currentSession) {
      this.currentSession.dispose()
      this.currentSession = null
    }

    const registry = getEngineRegistry()
    const engine = registry.get(DEFAULT_ENGINE_ID)
    if (engine?.cleanup) {
      await engine.cleanup()
    }
  }

  updateConfig(config: Partial<AIRuntimeConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.engineId) {
      this.currentEngineId = config.engineId
    }
  }

  /**
   * 获取当前引擎 ID
   */
  getEngineId(): 'claude-code' | 'iflow' | 'deepseek' | 'codex' {
    return this.currentEngineId
  }

  /**
   * 设置引擎 ID
   */
  setEngineId(engineId: 'claude-code' | 'iflow' | 'deepseek' | 'codex'): void {
    this.currentEngineId = engineId
    this.config.engineId = engineId
  }
}

/**
 * 全局单例
 */
let globalService: AIRuntimeService | null = null

/**
 * 获取 AI Runtime 服务单例
 *
 * 每次调用时更新配置（特别是 engineId），确保使用最新的引擎设置
 */
export function getAIRuntime(config?: AIRuntimeConfig): AIRuntimeService {
  if (!globalService) {
    globalService = new AIRuntimeService(config)
  } else if (config) {
    globalService.updateConfig(config)
  }
  return globalService
}

/**
 * 重置服务（主要用于测试）
 */
export function resetAIRuntime(): void {
  if (globalService) {
    globalService.cleanup()
    globalService = null
  }
}
