/**
 * useAssistant Hook 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAssistant } from './useAssistant'
import type { CompletionNotification } from '../types'

// Mock store
const mockStore = {
  messages: [],
  isLoading: false,
  error: null,
  completionNotifications: [],
  hasUnreadNotifications: false,
  executionPanelExpanded: false,
  setLoading: vi.fn(),
  setError: vi.fn(),
  clearMessages: vi.fn(),
  addMessage: vi.fn(),
  getAllClaudeCodeSessions: vi.fn(() => []),
  getRunningSessions: vi.fn(() => []),
  getPendingNotifications: vi.fn(() => []),
  abortAllSessions: vi.fn(),
  markNotificationHandled: vi.fn(),
  updateNotificationError: vi.fn(),
  toggleExecutionPanel: vi.fn(),
}

vi.mock('../store/assistantStore', () => ({
  useAssistantStore: vi.fn(() => mockStore),
}))

// Mock engine
const mockEngine = {
  processMessage: vi.fn(async function* () {
    yield { type: 'message_start' }
    yield { type: 'content_delta', content: 'Hello' }
    yield { type: 'message_complete' }
  }),
}

vi.mock('../core/AssistantEngine', () => ({
  getAssistantEngine: () => mockEngine,
}))

describe('useAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.messages = []
    mockStore.isLoading = false
    mockStore.error = null
    mockStore.completionNotifications = []
    mockStore.hasUnreadNotifications = false
  })

  describe('initial state', () => {
    it('should return correct initial state', () => {
      const { result } = renderHook(() => useAssistant())

      expect(result.current.messages).toEqual([])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.notifications).toEqual([])
      expect(result.current.hasUnreadNotifications).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('should not send empty message', async () => {
      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.sendMessage('')
      })

      expect(mockEngine.processMessage).not.toHaveBeenCalled()
    })

    it('should not send when loading', async () => {
      mockStore.isLoading = true
      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.sendMessage('test')
      })

      expect(mockEngine.processMessage).not.toHaveBeenCalled()
    })

    it('should set loading and call engine', async () => {
      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.sendMessage('Hello')
      })

      expect(mockStore.setLoading).toHaveBeenCalledWith(true)
      expect(mockEngine.processMessage).toHaveBeenCalledWith('Hello')
      expect(mockStore.setLoading).toHaveBeenCalledTimes(2) // true then false
    })

    it('should handle errors', async () => {
      mockEngine.processMessage.mockImplementationOnce(async function* () {
        throw new Error('Test error')
      })

      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.sendMessage('Hello')
      })

      expect(mockStore.setError).toHaveBeenCalledWith('Test error')
    })
  })

  describe('abort', () => {
    it('should abort all sessions', async () => {
      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.abort()
      })

      expect(mockStore.abortAllSessions).toHaveBeenCalled()
      expect(mockStore.setLoading).toHaveBeenCalledWith(false)
    })
  })

  describe('handleNotification', () => {
    it('should mark notification as handled', async () => {
      const notification: CompletionNotification = {
        id: 'notif-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        prompt: 'Test prompt',
        resultSummary: 'Test summary',
        createdAt: Date.now(),
        handled: false,
      }

      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.handleNotification(notification, 'ignored')
      })

      expect(mockStore.markNotificationHandled).toHaveBeenCalledWith('notif-1', 'ignored')
    })

    it('should process immediate notification with AI', async () => {
      const notification: CompletionNotification = {
        id: 'notif-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        prompt: 'Test prompt',
        resultSummary: 'Test summary',
        fullResult: 'Full result content',
        createdAt: Date.now(),
        handled: false,
      }

      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.handleNotification(notification, 'immediate')
      })

      expect(mockStore.markNotificationHandled).toHaveBeenCalledWith('notif-1', 'immediate')
      expect(mockEngine.processMessage).toHaveBeenCalled()
    })

    it('should not process delayed or ignored notification with AI', async () => {
      const notification: CompletionNotification = {
        id: 'notif-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        prompt: 'Test prompt',
        resultSummary: 'Test summary',
        fullResult: 'Full result',
        createdAt: Date.now(),
        handled: false,
      }

      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.handleNotification(notification, 'delayed')
      })

      expect(mockEngine.processMessage).not.toHaveBeenCalled()
    })
  })

  describe('retryNotification', () => {
    it('should retry notification', async () => {
      const notification: CompletionNotification = {
        id: 'notif-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        prompt: 'Test prompt',
        resultSummary: 'Test summary',
        fullResult: 'Full result',
        createdAt: Date.now(),
        handled: true,
        retryCount: 1,
        lastError: 'Previous error',
      }

      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.retryNotification(notification)
      })

      expect(mockStore.markNotificationHandled).toHaveBeenCalledWith('notif-1', 'immediate')
      expect(mockEngine.processMessage).toHaveBeenCalled()
    })

    it('should not retry without fullResult', async () => {
      const notification: CompletionNotification = {
        id: 'notif-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        prompt: 'Test prompt',
        resultSummary: 'Test summary',
        createdAt: Date.now(),
        handled: true,
      }

      const { result } = renderHook(() => useAssistant())

      await act(async () => {
        await result.current.retryNotification(notification)
      })

      expect(mockEngine.processMessage).not.toHaveBeenCalled()
    })
  })

  describe('UI controls', () => {
    it('should toggle execution panel', () => {
      const { result } = renderHook(() => useAssistant())

      act(() => {
        result.current.toggleExecutionPanel()
      })

      expect(mockStore.toggleExecutionPanel).toHaveBeenCalled()
    })

    it('should clear messages', () => {
      const { result } = renderHook(() => useAssistant())

      act(() => {
        result.current.clearMessages()
      })

      expect(mockStore.clearMessages).toHaveBeenCalled()
    })
  })
})
