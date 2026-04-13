import { useRef, useEffect, memo, useCallback, useState } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useAssistantStore } from '../store/assistantStore'
import { ProgressiveStreamingMarkdown } from '../../utils/lightweightMarkdown'
import type { AssistantMessage } from '../types'

/** 视口扩展常量 */
const VIEWPORT_EXTENSION = { top: 50, bottom: 100 }

/**
 * 用户消息气泡组件
 */
const UserMessageBubble = memo(function UserMessageBubble({
  message,
}: {
  message: AssistantMessage
}) {
  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%] px-3 py-2 rounded-lg text-sm bg-primary text-white">
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
      </div>
    </div>
  )
})

/**
 * 助手消息气泡组件
 */
const AssistantMessageBubble = memo(function AssistantMessageBubble({
  message,
  isStreaming,
}: {
  message: AssistantMessage
  isStreaming: boolean
}) {
  return (
    <div className="mb-4 text-left">
      <div className="inline-block max-w-[80%] px-3 py-2 rounded-lg text-sm bg-background-surface text-text-primary">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ProgressiveStreamingMarkdown
            content={message.content}
            completed={!isStreaming}
          />
        </div>
      </div>

      {/* 工具调用指示 */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 text-left">
          {message.toolCalls.map((tc) => (
            <div
              key={tc.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-background-surface rounded text-xs text-text-muted"
            >
              {tc.status === 'running' && (
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
              {tc.status === 'completed' && (
                <span className="w-2 h-2 rounded-full bg-success" />
              )}
              {tc.status === 'error' && (
                <span className="w-2 h-2 rounded-full bg-danger" />
              )}
              <span>Claude Code: {tc.arguments.reason || tc.arguments.prompt?.slice(0, 30)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

/**
 * 消息渲染器
 */
const MessageRenderer = memo(function MessageRenderer({
  message,
  streamingMessageId,
}: {
  message: AssistantMessage
  streamingMessageId: string | null
}) {
  const isStreaming = streamingMessageId === message.id

  if (message.role === 'user') {
    return <UserMessageBubble message={message} />
  }

  return <AssistantMessageBubble message={message} isStreaming={isStreaming} />
})

/**
 * 助手对话消息流（带虚拟列表优化）
 */
export function AssistantChat() {
  const { messages, streamingMessageId } = useAssistantStore()
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // 自动滚动：流式输出时跟随到底部
  useEffect(() => {
    if (autoScroll && streamingMessageId && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: messages.length - 1,
        behavior: 'smooth',
        align: 'end',
      })
    }
  }, [messages.length, streamingMessageId, autoScroll])

  // 底部状态变化
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAutoScroll(atBottom)
  }, [])

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        <div className="text-center">
          <p className="mb-2">👋 你好！我是 AI 助手</p>
          <p className="text-xs text-text-tertiary">
            我可以帮你分析需求、调用 Claude Code 执行项目操作
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        data={messages}
        itemContent={(_index, message) => (
          <div className="px-4">
            <MessageRenderer
              message={message}
              streamingMessageId={streamingMessageId}
            />
          </div>
        )}
        followOutput={autoScroll ? (streamingMessageId ? true : 'smooth') : false}
        atBottomStateChange={handleAtBottomStateChange}
        atBottomThreshold={100}
        increaseViewportBy={VIEWPORT_EXTENSION}
        initialTopMostItemIndex={messages.length - 1}
      />
    </div>
  )
}
