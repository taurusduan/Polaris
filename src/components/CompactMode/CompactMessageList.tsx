/**
 * CompactMessageList - 小屏模式专用消息列表
 *
 * 特点：
 * - 简单滚动列表（小屏消息量有限，无需虚拟列表）
 * - 紧凑的消息间距
 * - 自动滚动到底部
 */

import { useEffect, useRef } from 'react'
import { useEventChatStore } from '../../stores'
import { CompactUserMessage } from './CompactUserMessage'
import { CompactAssistantMessage } from './CompactAssistantMessage'
import type { ChatMessage } from '../../types/chat'
import { isUserMessage, isAssistantMessage } from '../../types/chat'

export function CompactMessageList() {
  const messages = useEventChatStore(state => state.messages)
  const isStreaming = useEventChatStore(state => state.isStreaming)
  const listRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        <p>开始新对话...</p>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto px-2 py-2 space-y-2"
    >
      {messages.map((message) => (
        <CompactMessageItem key={message.id} message={message} />
      ))}

      {/* 流式输出指示器 */}
      {isStreaming && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-text-tertiary text-xs">
          <span className="animate-pulse">●</span>
          <span>AI 正在回复...</span>
        </div>
      )}
    </div>
  )
}

function CompactMessageItem({ message }: { message: ChatMessage }) {
  if (isUserMessage(message)) {
    return <CompactUserMessage message={message} />
  }

  if (isAssistantMessage(message)) {
    return <CompactAssistantMessage message={message} />
  }

  // 其他类型消息暂不显示
  return null
}
