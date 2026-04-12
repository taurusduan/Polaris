import type { OpenAITool } from '../../engines/openai-protocol'
import type { InvokeClaudeCodeParams } from '../types'

/**
 * invoke_claude_code 工具定义
 */
export const INVOKE_CLAUDE_CODE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'invoke_claude_code',
    description: `调用 Claude Code 执行项目操作。支持管理多个独立会话。

何时使用：
- 需要读取/修改项目文件
- 需要了解项目结构或代码
- 需要执行代码重构或调试
- 需要进行 Git 操作

何时不需要：
- 用户只是闲聊或咨询概念
- 可以直接回答的技术问题
- 不涉及具体项目的规划讨论

多会话管理：
- 使用 sessionId 参数指定目标会话
- primary 会话保持主对话上下文
- 可创建独立的分析会话并行执行任务`,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '发送给 Claude Code 的指令',
        },
        sessionId: {
          type: 'string',
          description: `目标会话 ID。可选值：
- 'primary': 主对话会话（默认），保持长期上下文
- 'new-{purpose}': 创建新的分析会话，如 'new-analysis'、'new-security-check'
- 已有会话 ID: 继续该会话的任务`,
        },
        mode: {
          type: 'string',
          enum: ['continue', 'new', 'interrupt'],
          description: '执行模式：continue=继续会话, new=创建新会话, interrupt=中断指定会话',
        },
        reason: {
          type: 'string',
          description: '简要说明为什么需要调用 Claude Code',
        },
        background: {
          type: 'boolean',
          description: '是否在后台执行（不阻塞用户对话）',
        },
      },
      required: ['prompt', 'reason'],
    },
  },
}

/**
 * 助手可用工具列表
 */
export const ASSISTANT_TOOLS: OpenAITool[] = [
  INVOKE_CLAUDE_CODE_TOOL,
]

/**
 * 解析工具调用参数
 */
export function parseToolCallArgs(argsString: string): InvokeClaudeCodeParams {
  const parsed = JSON.parse(argsString)
  return {
    prompt: parsed.prompt,
    sessionId: parsed.sessionId,
    mode: parsed.mode || 'continue',
    reason: parsed.reason,
    background: parsed.background || false,
  }
}

/**
 * 获取工具名称列表
 */
export function getToolNames(): string[] {
  return ASSISTANT_TOOLS.map(t => t.function.name)
}
