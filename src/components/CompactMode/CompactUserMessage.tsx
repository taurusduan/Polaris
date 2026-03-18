/**
 * CompactUserMessage - 小屏模式用户消息组件
 *
 * 特点：
 * - 紧凑布局
 * - 支持附件预览
 * - 简化样式
 */

import type { UserChatMessage } from '../../types/chat'

interface CompactUserMessageProps {
  message: UserChatMessage
}

export function CompactUserMessage({ message }: CompactUserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] bg-primary/20 rounded-lg px-2.5 py-1.5">
        {/* 附件预览 */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="text-xs text-text-secondary bg-background-surface/50 rounded px-1.5 py-0.5"
              >
                {attachment.type === 'image' ? '🖼️' : '📄'} {attachment.fileName}
              </div>
            ))}
          </div>
        )}

        {/* 消息内容 */}
        <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    </div>
  )
}
