/**
 * OpenAI Provider Session
 *
 * 通过后端代理调用 OpenAI 兼容 API，支持流式响应和工具调用。
 * API Key 安全存储在后端，前端只负责事件监听。
 *
 * @author Polaris Team
 * @since 2025-03-11
 */

import type { AISessionConfig } from '../../ai-runtime'
import type { AITask, AIEvent } from '../../ai-runtime'
import { BaseSession } from '../../ai-runtime/base'
import { createEventIterable } from '../../ai-runtime/base'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/**
 * OpenAI Provider 会话配置
 */
export interface OpenAIProviderSessionConfig extends AISessionConfig {
  /** Provider ID */
  providerId: string
  /** Provider Name */
  providerName: string
  /** API Key (传递给后端，不在前端存储) */
  apiKey: string
  /** API Base URL */
  apiBase: string
  /** 模型名称 */
  model: string
  /** 温度参数 */
  temperature: number
  /** 最大 Token 数 */
  maxTokens: number
  /** 工作区路径 */
  workspaceDir?: string
  /** 超时时间 */
  timeout: number
  /** 是否支持工具调用 */
  supportsTools: boolean
}

/**
 * OpenAI API 消息格式
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

/**
 * Tauri Chat 事件类型（来自 Rust 后端）
 */
interface TauriChatEvent {
  contextId: string
  payload: {
    type: string
    [key: string]: unknown
  }
}

/**
 * OpenAI Provider Session 实现
 *
 * 架构：
 * 1. 前端调用后端 start_openai_chat 命令
 * 2. 后端处理 API 调用、工具循环、事件发送
 * 3. 前端监听 chat-event 接收响应
 */
export class OpenAIProviderSession extends BaseSession {
  /** 会话配置 */
  protected config: OpenAIProviderSessionConfig

  /** 对话历史 */
  private messages: OpenAIMessage[] = []

  /** 当前任务 ID */
  private currentTaskId: string | null = null

  /** 后端会话 ID */
  private backendSessionId: string | null = null

  /** 是否已请求中断 */
  private abortRequested = false

  /** 事件监听取消函数 */
  private unlistenChatEvent: (() => void) | null = null

  /**
   * 构造函数
   *
   * @param id - 会话 ID
   * @param config - 会话配置
   */
  constructor(id: string, config: OpenAIProviderSessionConfig) {
    super({ id, config })
    this.config = config

    // 初始化系统消息
    this.initializeSystemMessage()

    console.log(`[OpenAIProviderSession] Session ${id} created for ${config.providerName}`)
  }

  /**
   * 初始化系统消息
   */
  private initializeSystemMessage(): void {
    this.messages = [
      {
        role: 'system',
        content: this.buildSystemPrompt(),
      },
    ]
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    const workspaceDir = this.config.workspaceDir || '未指定工作区'

    return `你是一个专业的 AI 编程助手。你可以使用工具来帮助用户完成各种编程任务。

工作区目录: ${workspaceDir}

请根据用户的需求，使用合适的工具来完成任务。执行工具调用时，请确保：
1. 文件路径使用绝对路径
2. 命令执行前确认安全性
3. 对于复杂的任务，分步骤完成`
  }

  /**
   * 执行任务
   *
   * @param task - AI 任务
   * @returns 事件流
   */
  protected async executeTask(task: AITask): Promise<AsyncIterable<AIEvent>> {
    this.currentTaskId = task.id
    this.abortRequested = false

    // 添加用户消息到历史
    this.addUserMessage(task.input.prompt)

    // 设置事件监听
    await this.setupEventListeners()

    // 调用后端启动聊天
    await this.startBackendChat()

    // 创建事件迭代器
    return createEventIterable(
      this.eventEmitter,
      (event) => event.type === 'session_end' || event.type === 'error'
    )
  }

  /**
   * 中断任务
   */
  protected abortTask(taskId?: string): void {
    if (taskId && taskId !== this.currentTaskId) {
      return
    }

    console.log(`[OpenAIProviderSession] Aborting task ${taskId}`)
    this.abortRequested = true
    if (this.backendSessionId) {
      void this.interruptBackendSession(this.backendSessionId)
    }
    this.currentTaskId = null
  }

  /**
   * 释放资源
   */
  protected disposeResources(): void {
    if (this.unlistenChatEvent) {
      this.unlistenChatEvent()
      this.unlistenChatEvent = null
    }
    this.currentTaskId = null
    this.backendSessionId = null
    this.abortRequested = false
  }

  /**
   * 设置 Tauri 事件监听
   */
  private async setupEventListeners(): Promise<void> {
    if (this.unlistenChatEvent) {
      return
    }

    try {
      this.unlistenChatEvent = await listen<string>(
        'chat-event',
        (event) => {
          // 解析字符串 payload
          const rawPayload = event.payload
          let parsed: TauriChatEvent

          if (typeof rawPayload === 'string') {
            parsed = JSON.parse(rawPayload)
          } else {
            parsed = rawPayload as unknown as TauriChatEvent
          }

          // 只处理当前会话的事件
          console.log(`[OpenAIProviderSession] 收到事件, contextId=${parsed.contextId}, this.id=${this.id}, 匹配=${parsed.contextId === this.id}`)
          if (parsed.contextId === this.id) {
            this.handleChatEvent(parsed)
          }
        }
      )
    } catch (error) {
      console.error('[OpenAIProviderSession] Failed to setup event listener:', error)
    }
  }

  /**
   * 处理后端发送的聊天事件
   */
  private handleChatEvent(event: TauriChatEvent): void {
    const { payload } = event

    switch (payload.type) {
      case 'text_delta':
        this.emit({
          type: 'assistant_message',
          content: (payload as any).text || '',
          isDelta: true,
        })
        break

      case 'tool_start':
        {
          const toolUseId = (payload as any).tool_use_id ?? (payload as any).toolUseId ?? ''
          const toolName = (payload as any).tool_name ?? (payload as any).toolName ?? ''
        this.emit({
          type: 'tool_call_start',
          callId: toolUseId,
          tool: toolName,
          args: (payload as any).input || {},
        })
        }
        break

      case 'tool_end':
        {
          const toolUseId = (payload as any).tool_use_id ?? (payload as any).toolUseId ?? ''
          const toolName = (payload as any).tool_name ?? (payload as any).toolName ?? ''
        this.emit({
          type: 'tool_call_end',
          callId: toolUseId,
          tool: toolName,
          result: (payload as any).output || '',
          success: true,
        })
        }
        break

      case 'session_end':
        this.emit({
          type: 'session_end',
          sessionId: this.id,
        })
        break

      case 'error':
        this.emit({
          type: 'error',
          error: (payload as any).message || 'Unknown error',
        })
        break

      default:
        // 忽略未知事件类型
        break
    }
  }

  /**
   * 启动后端聊天
   */
  private async startBackendChat(): Promise<void> {
    try {
      const response = await invoke<string>('start_openai_chat', {
        params: {
          config: {
            provider_id: this.config.providerId,
            provider_name: this.config.providerName,
            api_key: this.config.apiKey,
            api_base: this.config.apiBase,
            model: this.config.model,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
            supports_tools: this.config.supportsTools,
          },
          messages: this.messages.map(m => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
            tool_call_id: m.tool_call_id,
          })),
          context_id: this.id,
        },
      })

      this.backendSessionId = response
      console.log(`[OpenAIProviderSession] Backend session started: ${response}`)
      if (this.abortRequested) {
        await this.interruptBackendSession(response)
      }
    } catch (error) {
      console.error('[OpenAIProviderSession] Failed to start backend chat:', error)
      this.emit({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async interruptBackendSession(sessionId: string): Promise<void> {
    try {
      await invoke('interrupt_chat', { sessionId })
    } catch (error) {
      console.error('[OpenAIProviderSession] Failed to interrupt backend session:', error)
    }
  }

  /**
   * 添加用户消息
   */
  private addUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content,
    })
  }

  /**
   * 获取消息历史
   */
  getMessages(): OpenAIMessage[] {
    return [...this.messages]
  }

  /**
   * 清除消息历史
   */
  clearMessages(): void {
    this.initializeSystemMessage()
  }
}
