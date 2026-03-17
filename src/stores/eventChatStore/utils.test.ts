/**
 * utils.ts 单元测试
 *
 * 测试文件读取缓存和 AIEvent 事件处理器
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Tauri invoke
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}))

// Mock toolPanelStore
const mockClearTools = vi.fn()
vi.mock('../toolPanelStore', () => ({
  useToolPanelStore: {
    getState: () => ({
      clearTools: mockClearTools,
    }),
  },
}))

// Mock gitStore
const mockRefreshStatusDebounced = vi.fn()
vi.mock('../gitStore', () => ({
  useGitStore: {
    getState: () => ({
      refreshStatusDebounced: (...args: any[]) => {
        mockRefreshStatusDebounced(...args)
        return Promise.resolve()
      },
    }),
  },
}))

// Mock diffExtractor
vi.mock('../../utils/diffExtractor', () => ({
  extractEditDiff: vi.fn(() => null),
  isEditTool: vi.fn((toolName: string) => 
    toolName === 'Edit' || toolName === 'edit_file' || toolName === 'write_to_file'
  ),
}))

// 导入被测试模块
import {
  readFileWithCache,
  clearFileReadCache,
  handleAIEvent,
} from './utils'
import type { AIEvent } from '../../ai-runtime'
import type { EventChatState } from './types'

// 创建 mock store 函数
function createMockStoreSet() {
  const state: any = {
    conversationId: null,
    isStreaming: false,
    progressMessage: null,
    error: null,
    currentMessage: null,
    toolBlockMap: new Map(),
    messages: [],
  }

  const set = vi.fn((partial: any) => {
    if (typeof partial === 'function') {
      const result = partial(state)
      Object.assign(state, result)
    } else {
      Object.assign(state, partial)
    }
  })

  const get = () => state

  return { set, get, state }
}

describe('readFileWithCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearFileReadCache()
  })

  it('应调用 Tauri invoke 读取文件', async () => {
    mockInvoke.mockResolvedValueOnce('file content')

    const result = await readFileWithCache('/test/file.ts')

    expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', { path: '/test/file.ts' })
    expect(result).toBe('file content')
  })

  it('同一文件应缓存 Promise 避免重复读取', async () => {
    mockInvoke.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve('content'), 100))
    )

    // 同时发起两个读取请求
    const promise1 = readFileWithCache('/test/file.ts')
    const promise2 = readFileWithCache('/test/file.ts')

    // 应该只调用一次 invoke
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    // 两个 Promise 应该相同
    expect(promise1).toBe(promise2)

    const [result1, result2] = await Promise.all([promise1, promise2])
    expect(result1).toBe('content')
    expect(result2).toBe('content')
  })

  it('读取完成后应清理缓存', async () => {
    mockInvoke.mockResolvedValueOnce('content')

    await readFileWithCache('/test/file.ts')

    // 再次读取应该创建新的 Promise
    mockInvoke.mockResolvedValueOnce('new content')
    await readFileWithCache('/test/file.ts')

    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('读取失败也应清理缓存', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('read error'))

    await expect(readFileWithCache('/test/file.ts')).rejects.toThrow('read error')

    // 缓存应该被清理，再次读取会创建新 Promise
    mockInvoke.mockResolvedValueOnce('content')
    await readFileWithCache('/test/file.ts')

    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })
})

describe('clearFileReadCache', () => {
  it('应清理所有缓存', async () => {
    mockInvoke.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve('content'), 100))
    )

    // 创建多个缓存
    const promise1 = readFileWithCache('/test/file1.ts')
    const promise2 = readFileWithCache('/test/file2.ts')

    // 清理缓存
    clearFileReadCache()

    // 再次读取应该创建新的 Promise
    const promise3 = readFileWithCache('/test/file1.ts')
    expect(promise3).not.toBe(promise1)

    // 等待所有 Promise 完成
    await Promise.allSettled([promise1, promise2, promise3])
  })
})

describe('handleAIEvent', () => {
  let mockStore: ReturnType<typeof createMockStoreSet>

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = createMockStoreSet()

    // Mock finishMessage, appendTextBlock 等方法
    mockStore.state.finishMessage = vi.fn(() => {
      mockStore.state.currentMessage = null
      mockStore.state.isStreaming = false
    })
    mockStore.state.appendTextBlock = vi.fn()
    mockStore.state.appendThinkingBlock = vi.fn()
    mockStore.state.appendToolCallBlock = vi.fn()
    mockStore.state.updateToolCallBlock = vi.fn()
    mockStore.state.updateToolCallBlockDiff = vi.fn()
    mockStore.state.updateToolCallBlockFullContent = vi.fn()
  })

  describe('session_start', () => {
    it('应设置 conversationId 和 isStreaming', () => {
      const event: AIEvent = {
        type: 'session_start',
        sessionId: 'session-123',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.set).toHaveBeenCalledWith({
        conversationId: 'session-123',
        isStreaming: true,
      })
      expect(mockClearTools).toHaveBeenCalled()
    })
  })

  describe('session_end', () => {
    it('应完成消息并重置状态', () => {
      mockStore.state.currentMessage = {
        id: 'msg-1',
        blocks: [],
        isStreaming: true,
      }

      const event: AIEvent = {
        type: 'session_end',
        reason: 'complete',
      }

      handleAIEvent(event, mockStore.set, mockStore.get, '/workspace')

      expect(mockStore.state.finishMessage).toHaveBeenCalled()
      expect(mockStore.set).toHaveBeenCalledWith({
        isStreaming: false,
        progressMessage: null,
      })
    })

    it('有 workspacePath 时应刷新 Git 状态', async () => {
      const event: AIEvent = {
        type: 'session_end',
        reason: 'complete',
      }

      handleAIEvent(event, mockStore.set, mockStore.get, '/workspace')

      // 等待微任务完成
      await Promise.resolve()
      expect(mockRefreshStatusDebounced).toHaveBeenCalledWith('/workspace')
    })
  })

  describe('token', () => {
    it('应追加文本块', () => {
      const event: AIEvent = {
        type: 'token',
        value: 'Hello',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.appendTextBlock).toHaveBeenCalledWith('Hello')
    })
  })

  describe('thinking', () => {
    it('应追加思考块', () => {
      const event: AIEvent = {
        type: 'thinking',
        content: 'Let me think...',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.appendThinkingBlock).toHaveBeenCalledWith('Let me think...')
    })
  })

  describe('assistant_message', () => {
    it('应追加文本块', () => {
      const event: AIEvent = {
        type: 'assistant_message',
        content: 'Response content',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.appendTextBlock).toHaveBeenCalledWith('Response content')
    })
  })

  describe('tool_call_start', () => {
    it('应追加工具调用块', () => {
      const event: AIEvent = {
        type: 'tool_call_start',
        callId: 'tool-1',
        tool: 'read_file',
        args: { path: '/test/file.ts' },
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.appendToolCallBlock).toHaveBeenCalledWith(
        'tool-1',
        'read_file',
        { path: '/test/file.ts' }
      )
    })

    it('无 callId 时应生成 UUID', () => {
      const event: AIEvent = {
        type: 'tool_call_start',
        tool: 'read_file',
        args: { path: '/test/file.ts' },
      }

      // Mock crypto.randomUUID
      vi.stubGlobal('crypto', {
        randomUUID: () => 'generated-uuid',
      })

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.appendToolCallBlock).toHaveBeenCalledWith(
        'generated-uuid',
        'read_file',
        { path: '/test/file.ts' }
      )

      vi.unstubAllGlobals()
    })

    it('Edit 工具应读取文件内容', async () => {
      mockInvoke.mockResolvedValueOnce('full file content')

      // 设置 toolBlockMap
      mockStore.state.toolBlockMap.set('tool-1', 0)
      mockStore.state.currentMessage = {
        id: 'msg-1',
        blocks: [{ type: 'tool_call', id: 'tool-1', name: 'Edit', status: 'pending', input: {} }],
        isStreaming: true,
      }

      const event: AIEvent = {
        type: 'tool_call_start',
        callId: 'tool-1',
        tool: 'Edit',
        args: { file_path: '/test/file.ts' },
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      // 等待异步读取完成
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', { path: '/test/file.ts' })
    })
  })

  describe('tool_call_end', () => {
    beforeEach(() => {
      vi.stubGlobal('crypto', {
        randomUUID: () => 'test-uuid',
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('应更新工具调用块状态 (成功)', () => {
      const event: AIEvent = {
        type: 'tool_call_end',
        callId: 'tool-1',
        tool: 'read_file',
        success: true,
        result: 'file content',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.updateToolCallBlock).toHaveBeenCalledWith(
        'tool-1',
        'completed',
        'file content'
      )
    })

    it('应更新工具调用块状态 (失败)', () => {
      const event: AIEvent = {
        type: 'tool_call_end',
        callId: 'tool-1',
        tool: 'read_file',
        success: false,
        result: 'error message',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.updateToolCallBlock).toHaveBeenCalledWith(
        'tool-1',
        'failed',
        'error message'
      )
    })

    it('无 callId 时应输出警告', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const event: AIEvent = {
        type: 'tool_call_end',
        tool: 'read_file',
        success: true,
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockStore.state.updateToolCallBlock).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('有 workspacePath 时应刷新 Git 状态', async () => {
      const event: AIEvent = {
        type: 'tool_call_end',
        callId: 'tool-1',
        tool: 'read_file',
        success: true,
      }

      handleAIEvent(event, mockStore.set, mockStore.get, '/workspace')

      await Promise.resolve()
      expect(mockRefreshStatusDebounced).toHaveBeenCalledWith('/workspace')
    })
  })

  describe('progress', () => {
    it('应设置进度消息', () => {
      const event: AIEvent = {
        type: 'progress',
        message: 'Processing...',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.set).toHaveBeenCalledWith({ progressMessage: 'Processing...' })
    })

    it('无消息时应设置为 null', () => {
      const event: AIEvent = {
        type: 'progress',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.set).toHaveBeenCalledWith({ progressMessage: null })
    })
  })

  describe('error', () => {
    it('应完成消息并设置错误', () => {
      mockStore.state.currentMessage = {
        id: 'msg-1',
        blocks: [],
        isStreaming: true,
      }

      const event: AIEvent = {
        type: 'error',
        error: 'Something went wrong',
      }

      handleAIEvent(event, mockStore.set, mockStore.get)

      expect(mockStore.state.finishMessage).toHaveBeenCalled()
      expect(mockStore.set).toHaveBeenCalledWith({
        error: 'Something went wrong',
        isStreaming: false,
      })
    })
  })

  describe('user_message', () => {
    it('不应处理用户消息', () => {
      const event: AIEvent = {
        type: 'user_message',
        content: 'Hello',
      }

      // 不应该抛出错误
      expect(() => handleAIEvent(event, mockStore.set, mockStore.get)).not.toThrow()
    })
  })
})
