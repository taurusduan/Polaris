/**
 * CompactAssistantMessage - 小屏模式 AI 消息组件
 *
 * 特点：
 * - 紧凑布局
 * - 文本内容简化 Markdown 渲染
 * - 思考过程折叠显示
 * - 工具调用极简状态显示
 */

import { useState, useMemo } from 'react'
import type { AssistantChatMessage, ContentBlock, TextBlock, ThinkingBlock, ToolCallBlock } from '../../types/chat'
import { isTextBlock, isThinkingBlock, isToolCallBlock } from '../../types/chat'
import { ChevronDown, ChevronRight, Check, X, Loader2, Wrench } from 'lucide-react'

interface CompactAssistantMessageProps {
  message: AssistantChatMessage
}

export function CompactAssistantMessage({ message }: CompactAssistantMessageProps) {
  // 分离文本块和非文本块
  const { textBlocks, otherBlocks } = useMemo(() => {
    const textBlocks: TextBlock[] = []
    const otherBlocks: ContentBlock[] = []

    for (const block of message.blocks || []) {
      if (isTextBlock(block)) {
        textBlocks.push(block)
      } else {
        otherBlocks.push(block)
      }
    }

    return { textBlocks, otherBlocks }
  }, [message.blocks])

  // 工具调用统计
  const toolStats = useMemo(() => {
    const toolBlocks = otherBlocks.filter(isToolCallBlock)
    const running = toolBlocks.filter(b => b.status === 'running' || b.status === 'pending').length
    const completed = toolBlocks.filter(b => b.status === 'completed').length
    const failed = toolBlocks.filter(b => b.status === 'failed').length
    return { total: toolBlocks.length, running, completed, failed }
  }, [otherBlocks])

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] space-y-1.5">
        {/* 文本内容 */}
        {textBlocks.map((block, index) => (
          <CompactTextContent key={index} content={block.content} />
        ))}

        {/* 工具调用摘要（折叠显示） */}
        {toolStats.total > 0 && (
          <CompactToolsSummary stats={toolStats} blocks={otherBlocks.filter(isToolCallBlock)} />
        )}

        {/* 思考过程（折叠显示） */}
        {otherBlocks.filter(isThinkingBlock).map((block, index) => (
          <CompactThinking key={index} block={block as ThinkingBlock} />
        ))}

        {/* 流式输出指示 */}
        {message.isStreaming && (
          <div className="text-xs text-text-tertiary animate-pulse">
            正在输入...
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 简化的文本内容渲染
 */
function CompactTextContent({ content }: { content: string }) {
  // 简单的 Markdown 处理：代码块、行内代码、粗体
  const rendered = useMemo(() => {
    // 处理代码块
    let text = content.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `\n[代码: ${lang || 'text'}]\n${code.trim()}\n`
    })

    // 处理行内代码
    text = text.replace(/`([^`]+)`/g, '[$1]')

    // 处理粗体
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1')

    return text
  }, [content])

  return (
    <div className="bg-background-surface/50 rounded-lg px-2.5 py-1.5">
      <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
        {rendered}
      </p>
    </div>
  )
}

/**
 * 工具调用摘要（极简显示）
 */
function CompactToolsSummary({
  stats,
  blocks
}: {
  stats: { total: number; running: number; completed: number; failed: number }
  blocks: ToolCallBlock[]
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-background-surface/30 rounded-lg overflow-hidden">
      {/* 摘要头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-background-hover/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-tertiary" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary" />
        )}
        <Wrench size={12} className="text-text-tertiary" />
        <span className="text-xs text-text-secondary">
          {stats.total} 个工具调用
        </span>
        <div className="flex items-center gap-1 ml-auto text-xs">
          {stats.running > 0 && (
            <span className="flex items-center gap-0.5 text-warning">
              <Loader2 size={10} className="animate-spin" />
              {stats.running}
            </span>
          )}
          {stats.completed > 0 && (
            <span className="flex items-center gap-0.5 text-success">
              <Check size={10} />
              {stats.completed}
            </span>
          )}
          {stats.failed > 0 && (
            <span className="flex items-center gap-0.5 text-danger">
              <X size={10} />
              {stats.failed}
            </span>
          )}
        </div>
      </button>

      {/* 展开的工具列表 */}
      {expanded && (
        <div className="px-2 pb-1.5 space-y-0.5">
          {blocks.map((block) => (
            <CompactToolItem key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 单个工具调用项
 */
function CompactToolItem({ block }: { block: ToolCallBlock }) {
  const StatusIcon = {
    pending: Loader2,
    running: Loader2,
    completed: Check,
    failed: X,
    partial: Check,
  }[block.status]

  const statusColor = {
    pending: 'text-text-tertiary',
    running: 'text-warning animate-spin',
    completed: 'text-success',
    failed: 'text-danger',
    partial: 'text-warning',
  }[block.status]

  // 简化工具名称显示
  const displayName = block.name.replace(/^[A-Z]/, c => c.toLowerCase())

  return (
    <div className="flex items-center gap-1.5 text-xs py-0.5">
      <StatusIcon size={10} className={statusColor} />
      <span className="text-text-primary truncate">{displayName}</span>
      {block.duration && (
        <span className="text-text-tertiary ml-auto">{block.duration}ms</span>
      )}
    </div>
  )
}

/**
 * 思考过程（折叠显示）
 */
function CompactThinking({ block }: { block: ThinkingBlock }) {
  const [expanded, setExpanded] = useState(false)

  // 截取思考内容的前 50 个字符作为摘要
  const summary = block.content.length > 50
    ? block.content.slice(0, 50) + '...'
    : block.content

  return (
    <div className="bg-background-surface/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-background-hover/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-tertiary" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary" />
        )}
        <span className="text-xs text-text-tertiary italic">
          💭 {expanded ? '思考过程' : summary}
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-1.5">
          <p className="text-xs text-text-tertiary whitespace-pre-wrap italic">
            {block.content}
          </p>
        </div>
      )}
    </div>
  )
}
