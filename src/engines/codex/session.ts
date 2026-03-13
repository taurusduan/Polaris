/**
 * Codex Session
 *
 * Codex CLI 的会话实现，负责启动和管理 Codex 进程。
 */

import type { AISessionConfig, AITask, AIEvent } from '../../ai-runtime'
import { BaseSession } from '../../ai-runtime/base'
import { createEventIterable } from '../../ai-runtime/base'

/**
 * Codex CLI 配置
 */
export interface CodexConfig {
  /** Codex CLI 可执行文件路径 */
  executablePath?: string
  /** 工作目录 */
  cwd?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 模型配置 */
  model?: string
  /** API 密钥（如果需要） */
  apiKey?: string
  /** 额外参数 */
  extraArgs?: string[]
}

/**
 * Codex 子进程（抽象，实际由 Tauri 后端实现）
 */
interface CodexProcess {
  pid?: number
  stdout?: ReadableStream
  stderr?: ReadableStream
  kill(): void
  on?(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * Codex Session
 *
 * 管理 Codex CLI 的单个会话实例。
 */
export class CodexSession extends BaseSession {
  readonly engineId: string = 'codex'
  private codexConfig: CodexConfig
  private process: CodexProcess | null = null
  private currentTaskId: string | null = null

  constructor(sessionConfig?: AISessionConfig, codexConfig?: CodexConfig) {
    const sessionId = crypto.randomUUID()
    super({ id: sessionId, config: sessionConfig })
    this.codexConfig = codexConfig || {}
  }

  /**
   * 执行具体任务
   */
  protected async executeTask(task: AITask): Promise<AsyncIterable<AIEvent>> {
    this.currentTaskId = task.id

    this.process = await this.startCodexProcess(task)
    this.setupOutputHandling()

    return createEventIterable(
      this.eventEmitter,
      (event) => event.type === 'session_end' || event.type === 'error'
    )
  }

  /**
   * 中断任务的具体实现
   */
  protected abortTask(taskId?: string): void {
    if (taskId && taskId !== this.currentTaskId) {
      console.warn(`[CodexSession] 任务 ID 不匹配: ${taskId} != ${this.currentTaskId}`)
      return
    }

    if (this.process) {
      try {
        this.process.kill()
      } catch (e) {
        console.error('[CodexSession] 终止进程失败:', e)
      }
      this.process = null
    }

    this.currentTaskId = null
  }

  /**
   * 释放资源的具体实现
   */
  protected disposeResources(): void {
    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // 忽略错误
      }
      this.process = null
    }

    this.currentTaskId = null
  }

  /**
   * 设置输出处理
   */
  private setupOutputHandling(): void {
    if (this.process?.stdout) {
      // 实际实现会读取 stdout 并解析 Codex 输出
    }
  }

  /**
   * 启动 Codex 进程
   */
  private async startCodexProcess(task: AITask): Promise<CodexProcess> {
    const args = this.buildCodexArgs(task)

    console.log('[CodexSession] 启动命令:', this.codexConfig.executablePath || 'codex', args)

    return {
      kill: () => {},
      on: (_event: string, _handler: (...args: unknown[]) => void) => {},
    }
  }

  /**
   * 构建 Codex CLI 命令行参数
   */
  private buildCodexArgs(task: AITask): string[] {
    const args: string[] = []
    let prompt = task.input.prompt as string

    const workspaceContext = task.input.extra?.workspaceContext as
      { currentWorkspace: { name: string; path: string }; contextWorkspaces: Array<{ name: string; path: string }> } | undefined

    if (workspaceContext) {
      const contextHeader = this.formatWorkspaceContext(workspaceContext)
      if (contextHeader) {
        prompt = `${contextHeader}\n\n${prompt}`
      }
    }

    args.push('--json')
    args.push('--stream')

    if (this.codexConfig.model) {
      args.push('--model', this.codexConfig.model)
    }

    if (this.codexConfig.extraArgs) {
      args.push(...this.codexConfig.extraArgs)
    }

    args.push('--')
    args.push(prompt)

    return args
  }

  /**
   * 格式化工作区上下文为提示词
   */
  private formatWorkspaceContext(
    workspaceContext: { currentWorkspace: { name: string; path: string }; contextWorkspaces: Array<{ name: string; path: string }> }
  ): string {
    const lines: string[] = []

    lines.push('═══════════════════════════════════════════════════════════')
    lines.push('                        工作区信息')
    lines.push('═══════════════════════════════════════════════════════════')
    lines.push(`当前工作区: ${workspaceContext.currentWorkspace.name}`)
    lines.push(`  路径: ${workspaceContext.currentWorkspace.path}`)

    if (workspaceContext.contextWorkspaces.length > 0) {
      lines.push('')
      lines.push('关联工作区:')
      for (const ws of workspaceContext.contextWorkspaces) {
        lines.push(`  • ${ws.name}`)
        lines.push(`    路径: ${ws.path}`)
      }
    }

    lines.push('═══════════════════════════════════════════════════════════')

    return lines.join('\n')
  }

  /**
   * 更新 Codex 配置
   */
  updateCodexConfig(config: Partial<CodexConfig>): void {
    this.codexConfig = { ...this.codexConfig, ...config }
  }

  /**
   * 获取 Codex 特定配置
   */
  getCodexConfig(): CodexConfig {
    return { ...this.codexConfig }
  }
}

/**
 * 创建 Codex Session
 */
export function createCodexSession(
  sessionConfig?: AISessionConfig,
  codexConfig?: CodexConfig
): CodexSession {
  return new CodexSession(sessionConfig, codexConfig)
}
