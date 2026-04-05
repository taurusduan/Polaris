/**
 * SessionMessagesView - 多窗口专用的消息显示组件
 *
 * 直接使用 zustand store 订阅特定 session 的状态，避免复杂的 hook 链
 */

import { memo, useMemo, useRef, useCallback, useEffect } from 'react';
import { useStore } from 'zustand';
import { Virtuoso } from 'react-virtuoso';
import { sessionStoreManager } from '../../stores/conversationStore/sessionStoreManager';
import { renderChatMessage } from './EnhancedChatMessages';
import type { ChatMessage, AssistantChatMessage } from '../../types/chat';

/** 默认渲染配置 */
const DEFAULT_LAYER_CONFIG = {
  background: { start: 0, count: 5, blur: 0, opacity: 0.3 },
  midground: { start: 5, count: 10, blur: 0, opacity: 0.6 },
  foreground: { start: 15, count: Infinity, blur: 0, opacity: 1 },
};

/** 计算渲染模式 */
function calculateRenderMode(index: number, total: number, config: typeof DEFAULT_LAYER_CONFIG) {
  if (index < config.background.start + config.background.count) {
    return { layer: 'background' as const, ...config.background };
  }
  if (index < config.midground.start + config.midground.count) {
    return { layer: 'midground' as const, ...config.midground };
  }
  return { layer: 'foreground' as const, ...config.foreground };
}

/** 空状态组件 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-text-muted">
      <div className="text-center">
        <p className="text-sm">开始对话吧</p>
      </div>
    </div>
  );
});

interface SessionMessagesViewProps {
  sessionId: string;
}

export const SessionMessagesView = memo(function SessionMessagesView({ sessionId }: SessionMessagesViewProps) {
  const virtuosoRef = useRef<any>(null);
  const autoScrollRef = useRef(true);

  // 直接订阅特定 session 的状态
  const messages = useStore(sessionStoreManager, useCallback(
    (state) => {
      const store = state.stores.get(sessionId);
      return store ? store.getState().messages : [];
    },
    [sessionId]
  ));

  const currentMessage = useStore(sessionStoreManager, useCallback(
    (state) => {
      const store = state.stores.get(sessionId);
      return store ? store.getState().currentMessage : null;
    },
    [sessionId]
  ));

  const isStreaming = useStore(sessionStoreManager, useCallback(
    (state) => {
      const store = state.stores.get(sessionId);
      return store ? store.getState().isStreaming : false;
    },
    [sessionId]
  ));

  // 合并流式消息到消息列表
  const displayMessages = useMemo(() => {
    if (!currentMessage || !isStreaming) {
      return messages;
    }

    // 检查 currentMessage 是否已在 messages 中
    const existingIndex = messages.findIndex(m => m.id === currentMessage.id);

    if (existingIndex >= 0) {
      // 更新已存在的消息
      const updated: ChatMessage[] = [
        ...messages.slice(0, existingIndex),
        {
          ...messages[existingIndex],
          blocks: currentMessage.blocks,
          isStreaming: true,
        } as AssistantChatMessage,
        ...messages.slice(existingIndex + 1),
      ];
      return updated;
    } else {
      // 添加到末尾
      return [...messages, {
        id: currentMessage.id,
        type: 'assistant' as const,
        blocks: currentMessage.blocks,
        timestamp: new Date().toISOString(),
        isStreaming: true,
      }];
    }
  }, [messages, currentMessage, isStreaming]);

  const isEmpty = displayMessages.length === 0;

  // 自动滚动到底部
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    autoScrollRef.current = atBottom;
  }, []);

  // 滚动到指定消息
  const scrollToMessage = useCallback((index: number) => {
    if (!virtuosoRef.current) return;
    virtuosoRef.current.scrollToIndex({
      index,
      align: 'start',
      behavior: 'smooth',
    });
  }, []);

  // streaming 时自动滚动到底部
  useEffect(() => {
    if (isStreaming && autoScrollRef.current && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: displayMessages.length - 1,
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [isStreaming, displayMessages.length]);

  return (
    <div className="h-full w-full">
      {isEmpty ? (
        <EmptyState />
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={displayMessages}
          itemContent={(index, item) => {
            const msgRenderMode = calculateRenderMode(index, displayMessages.length, DEFAULT_LAYER_CONFIG);
            return renderChatMessage(item, msgRenderMode, index, scrollToMessage);
          }}
          components={{
            EmptyPlaceholder: () => null,
            Footer: () => <div style={{ height: '80px' }} />,
          }}
          followOutput={autoScrollRef.current ? (isStreaming ? true : 'smooth') : false}
          atBottomStateChange={handleAtBottomStateChange}
          atBottomThreshold={100}
          increaseViewportBy={{ top: 50, bottom: 100 }}
          initialTopMostItemIndex={displayMessages.length - 1}
        />
      )}
    </div>
  );
});