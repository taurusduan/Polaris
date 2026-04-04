/**
 * useActiveSession - 统一的活跃会话状态 Hook
 *
 * 封装 sessionStoreManager，提供与 useEventChatStore 兼容的接口
 * 用于简化 UI 组件迁移到新架构
 *
 * 使用方法：
 * 1. useActiveSession() - 获取完整状态和操作
 * 2. useActiveSessionMessages() - 只订阅消息
 * 3. useActiveSessionStreaming() - 只订阅流式状态
 */

import { useMemo, useCallback, useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import {
  sessionStoreManager,
  useActiveSessionId,
} from './sessionStoreManager'
import type { ConversationStore, ConversationState } from './types'

/**
 * 订阅活跃会话的特定状态
 *
 * 内部使用 useSyncExternalStore 确保响应式更新
 */
function useActiveSessionSelector<T>(
  selector: (state: ConversationState) => T,
  defaultValue: T
): T {
  const sessionId = useActiveSessionId()
  const stores = useStore(sessionStoreManager, (state) => state.stores)

  const store = sessionId ? stores.get(sessionId) : null

  // 使用 getSnapshot 和 subscribe 模式
  const getSnapshot = useCallback(() => {
    if (!store) return defaultValue
    return selector(store.getState())
  }, [store, selector, defaultValue])

  const subscribe = useCallback((onChange: () => void) => {
    if (!store) return () => {}
    return store.subscribe(onChange)
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, () => defaultValue)
}

/**
 * 获取活跃会话的消息列表
 */
export function useActiveSessionMessages() {
  const messages = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.messages, []),
    []
  )
  const archivedMessages = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.archivedMessages, []),
    []
  )
  const currentMessage = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.currentMessage, []),
    null
  )

  return useMemo(() => ({
    messages,
    archivedMessages,
    currentMessage,
  }), [messages, archivedMessages, currentMessage])
}

/**
 * 获取活跃会话的流式状态
 */
export function useActiveSessionStreaming() {
  return useActiveSessionSelector(
    useCallback((state: ConversationState) => state.isStreaming, []),
    false
  )
}

/**
 * 获取活跃会话的错误状态
 */
export function useActiveSessionError() {
  return useActiveSessionSelector(
    useCallback((state: ConversationState) => state.error, []),
    null
  )
}

/**
 * 获取活跃会话的会话 ID
 */
export function useActiveSessionConversationId() {
  return useActiveSessionSelector(
    useCallback((state: ConversationState) => state.conversationId, []),
    null
  )
}

/**
 * 获取活跃会话的 Block 映射
 */
export function useActiveSessionBlockMaps() {
  const toolBlockMap = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.toolBlockMap, []),
    new Map()
  )
  const questionBlockMap = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.questionBlockMap, []),
    new Map()
  )
  const planBlockMap = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.planBlockMap, []),
    new Map()
  )
  const activePlanId = useActiveSessionSelector(
    useCallback((state: ConversationState) => state.activePlanId, []),
    null
  )

  return useMemo(() => ({
    toolBlockMap,
    questionBlockMap,
    planBlockMap,
    activePlanId,
  }), [toolBlockMap, questionBlockMap, planBlockMap, activePlanId])
}

/**
 * 获取活跃会话的操作方法
 */
export function useActiveSessionActions() {
  const sessionId = useActiveSessionId()
  const stores = useStore(sessionStoreManager, (state) => state.stores)
  const managerActions = useStore(
    sessionStoreManager,
    useCallback((state) => ({
      switchSession: state.switchSession,
      deleteSession: state.deleteSession,
      createSession: state.createSession,
    }), [])
  )

  const getStore = useCallback(() => {
    if (!sessionId) return null
    return stores.get(sessionId)?.getState() ?? null
  }, [sessionId, stores])

  return useMemo(() => ({
    sendMessage: async (...args: Parameters<ConversationStore['sendMessage']>) => {
      const store = getStore()
      if (!store) return
      return store.sendMessage(...args)
    },
    interrupt: async () => {
      const store = getStore()
      if (!store) return
      return store.interrupt()
    },
    deleteMessage: (messageId: string) => {
      const store = getStore()
      if (!store) return
      return store.deleteMessage(messageId)
    },
    editAndResend: async (messageId: string, newContent: string) => {
      const store = getStore()
      if (!store) return
      return store.editAndResend(messageId, newContent)
    },
    regenerateResponse: async (messageId: string) => {
      const store = getStore()
      if (!store) return
      return store.regenerateResponse(messageId)
    },
    ...managerActions,
  }), [getStore, managerActions])
}

/**
 * 获取当前活跃会话的状态和操作方法
 *
 * 返回与 useEventChatStore 兼容的接口
 */
export function useActiveSessionChat(): ConversationStore | null {
  const sessionId = useActiveSessionId()
  const stores = useStore(sessionStoreManager, (state) => state.stores)

  const store = sessionId ? stores.get(sessionId) : null

  return useMemo(() => {
    if (!store) return null
    return store.getState()
  }, [store])
}

/**
 * 完整的活跃会话 Hook（状态 + 操作）
 *
 * 用法：
 * ```tsx
 * const { messages, isStreaming, sendMessage, interrupt } = useActiveSession()
 * ```
 */
export function useActiveSession() {
  const messagesState = useActiveSessionMessages()
  const isStreaming = useActiveSessionStreaming()
  const error = useActiveSessionError()
  const conversationId = useActiveSessionConversationId()
  const blockMaps = useActiveSessionBlockMaps()
  const actions = useActiveSessionActions()

  return useMemo(() => ({
    // 消息状态
    ...messagesState,

    // 流式状态
    isStreaming,

    // 错误状态
    error,

    // 会话 ID
    conversationId,

    // Block 映射
    ...blockMaps,

    // 操作方法
    ...actions,
  }), [messagesState, isStreaming, error, conversationId, blockMaps, actions])
}