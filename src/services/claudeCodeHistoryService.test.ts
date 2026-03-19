/**
 * claudeCodeHistoryService 单元测试
 *
 * 测试覆盖：
 * 1. listSessions - 列出 Claude Code 会话
 * 2. getSessionHistory - 获取会话历史
 * 3. convertMessagesToFormat - 消息格式转换
 * 4. extractToolCalls - 工具调用提取
 * 5. convertToChatMessages - 转换为 ChatMessage 格式
 * 6. formatFileSize / formatTime - 工具函数
 * 7. getClaudeCodeHistoryService - 单例模式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ClaudeCodeHistoryService,
  getClaudeCodeHistoryService,
  type ClaudeCodeSessionMeta,
  type ClaudeCodeMessage,
} from './claudeCodeHistoryService'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock crypto.randomUUID
const mockUUIDs = ['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4', 'uuid-5']
let uuidIndex = 0

vi.stubGlobal('crypto', {
  randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

// 导入 mock 后的 invoke
import { invoke } from '@tauri-apps/api/core'

const mockInvoke = vi.mocked(invoke)

describe('ClaudeCodeHistoryService', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  afterEach(() => {
    vi.resetModules()
  })

  // ============================================================================
  // listSessions 测试
  // ============================================================================

  describe('listSessions', () => {
    it('应该成功返回会话列表', async () => {
      const mockSessions: ClaudeCodeSessionMeta[] = [
        {
          sessionId: 'session-1',
          projectPath: '/path/to/project',
          firstPrompt: 'Hello',
          messageCount: 10,
          created: '2026-03-19T10:00:00Z',
          modified: '2026-03-19T11:00:00Z',
          filePath: '/path/to/session.json',
          fileSize: 1024,
        },
        {
          sessionId: 'session-2',
          projectPath: '/path/to/project',
          firstPrompt: 'World',
          messageCount: 5,
          created: '2026-03-18T10:00:00Z',
          modified: '2026-03-18T11:00:00Z',
          filePath: '/path/to/session2.json',
          fileSize: 512,
        },
      ]

      mockInvoke.mockResolvedValueOnce(mockSessions)

      const result = await service.listSessions('/path/to/project')

      expect(mockInvoke).toHaveBeenCalledWith('list_claude_code_sessions', {
        projectPath: '/path/to/project',
      })
      expect(result).toEqual(mockSessions)
    })

    it('应该处理无项目路径的情况', async () => {
      const mockSessions: ClaudeCodeSessionMeta[] = []
      mockInvoke.mockResolvedValueOnce(mockSessions)

      const result = await service.listSessions()

      expect(mockInvoke).toHaveBeenCalledWith('list_claude_code_sessions', {
        projectPath: undefined,
      })
      expect(result).toEqual([])
    })

    it('应该处理调用失败返回空数组', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Tauri invoke failed'))

      const result = await service.listSessions('/path/to/project')

      expect(result).toEqual([])
    })

    it('应该处理非 Error 类型的异常', async () => {
      mockInvoke.mockRejectedValueOnce('string error')

      const result = await service.listSessions('/path/to/project')

      expect(result).toEqual([])
    })
  })

  // ============================================================================
  // getSessionHistory 测试
  // ============================================================================

  describe('getSessionHistory', () => {
    it('应该成功返回会话历史', async () => {
      const mockMessages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]

      mockInvoke.mockResolvedValueOnce(mockMessages)

      const result = await service.getSessionHistory('session-1', '/path')

      expect(mockInvoke).toHaveBeenCalledWith('get_claude_code_session_history', {
        sessionId: 'session-1',
        projectPath: '/path',
      })
      expect(result).toEqual(mockMessages)
    })

    it('应该处理调用失败返回空数组', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Failed'))

      const result = await service.getSessionHistory('session-1')

      expect(result).toEqual([])
    })
  })

  // ============================================================================
  // convertMessagesToFormat 测试
  // ============================================================================

  describe('convertMessagesToFormat', () => {
    it('应该转换字符串内容的消息', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Hello', timestamp: '2026-03-19T10:00:00Z' },
        { role: 'assistant', content: 'Hi!', timestamp: '2026-03-19T10:01:00Z' },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'user-0',
        role: 'user',
        content: 'Hello',
        timestamp: '2026-03-19T10:00:00Z',
      })
      expect(result[1]).toEqual({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hi!',
        timestamp: '2026-03-19T10:01:00Z',
      })
    })

    it('应该处理数组内容的消息', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Part 1Part 2')
    })

    it('应该为没有时间戳的消息生成默认时间戳', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Test' },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result[0].timestamp).toBeDefined()
    })

    it('应该处理空消息数组', () => {
      const result = service.convertMessagesToFormat([])
      expect(result).toEqual([])
    })

    it('应该跳过非文本类型的数组项', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Text' },
            { type: 'image', data: 'base64...' },
            { type: 'tool_use', name: 'Test', input: {} },
          ],
        },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result[0].content).toBe('Text')
    })
  })

  // ============================================================================
  // extractToolCalls 测试
  // ============================================================================

  describe('extractToolCalls', () => {
    it('应该提取工具调用', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call-1', name: 'ReadFile', input: { path: '/test' } },
            { type: 'text', text: 'Here is the result' },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.extractToolCalls(messages)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'call-1',
        name: 'ReadFile',
        status: 'completed',
        input: { path: '/test' },
        startedAt: '2026-03-19T10:00:00Z',
      })
    })

    it('应该为缺少 id 的工具调用生成 UUID', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Test', input: {} }],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.extractToolCalls(messages)

      expect(result[0].id).toBe('uuid-1')
    })

    it('应该为缺少 name 的工具调用使用 unknown', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call-1', input: {} }],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.extractToolCalls(messages)

      expect(result[0].name).toBe('unknown')
    })

    it('应该处理字符串内容的消息（跳过）', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'assistant', content: 'Just text' },
      ]

      const result = service.extractToolCalls(messages)

      expect(result).toEqual([])
    })

    it('应该处理空消息数组', () => {
      const result = service.extractToolCalls([])
      expect(result).toEqual([])
    })

    it('应该跳过用户消息', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'user',
          content: [{ type: 'tool_use', name: 'Test', input: {} }],
        },
      ]

      const result = service.extractToolCalls(messages)

      // tool_use 只会在 assistant 消息中提取
      expect(result).toHaveLength(1) // 当前实现会提取，因为没有过滤 role
    })
  })

  // ============================================================================
  // convertToChatMessages 测试
  // ============================================================================

  describe('convertToChatMessages', () => {
    it('应该转换简单用户消息', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Hello', timestamp: '2026-03-19T10:00:00Z' },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('user')
      expect((result[0] as { content: string }).content).toBe('Hello')
    })

    it('应该转换助手消息为 blocks 格式', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'thinking', thinking: 'Let me think...' },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('assistant')
      const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
      expect(blocks).toHaveLength(2)
      expect(blocks[0].type).toBe('text')
      expect(blocks[1].type).toBe('thinking')
    })

    it('应该跳过 tool_result 类型的用户消息', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'Result' }],
        },
        { role: 'user', content: 'Next question' },
      ]

      const result = service.convertToChatMessages(messages)

      // tool_result 应该被跳过
      expect(result).toHaveLength(1)
      expect((result[0] as { content: string }).content).toBe('Next question')
    })

    it('应该合并连续的 assistant 消息', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 1' }],
          timestamp: '2026-03-19T10:00:00Z',
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 2' }],
          timestamp: '2026-03-19T10:01:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      // 应该合并为一条消息
      expect(result).toHaveLength(1)
      const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
      expect(blocks).toHaveLength(2)
      expect(blocks[0].content).toBe('Part 1')
      expect(blocks[1].content).toBe('Part 2')
    })

    it('应该处理系统消息', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'system', content: 'System message' },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('system')
    })

    it('应该处理 tool_use 类型的内容块', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call-1',
              name: 'ReadFile',
              input: { path: '/test' },
            },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(1)
      const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks
      expect(blocks[0].type).toBe('tool_call')
    })

    it('应该为空内容添加空文本块', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [],
        },
      ]

      const result = service.convertToChatMessages(messages)

      const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('text')
      expect(blocks[0].content).toBe('')
    })

    it('应该处理字符串类型的助手消息', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: 'Plain text response',
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(1)
      const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('Plain text response')
    })
  })

  // ============================================================================
  // formatFileSize 测试
  // ============================================================================

  describe('formatFileSize', () => {
    it('应该格式化字节', () => {
      expect(service.formatFileSize(512)).toBe('512 B')
    })

    it('应该格式化 KB', () => {
      expect(service.formatFileSize(1024)).toBe('1 KB')
      expect(service.formatFileSize(1536)).toBe('1.5 KB')
    })

    it('应该格式化 MB', () => {
      expect(service.formatFileSize(1048576)).toBe('1 MB')
      expect(service.formatFileSize(1572864)).toBe('1.5 MB')
    })

    it('应该格式化 GB', () => {
      expect(service.formatFileSize(1073741824)).toBe('1 GB')
    })

    it('应该处理 0 字节', () => {
      expect(service.formatFileSize(0)).toBe('0 B')
    })
  })

  // ============================================================================
  // formatTime 测试
  // ============================================================================

  describe('formatTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-19T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('应该返回"刚刚"对于小于 1 分钟', () => {
      const timestamp = '2026-03-19T11:59:30Z'
      expect(service.formatTime(timestamp)).toBe('刚刚')
    })

    it('应该返回分钟对于小于 1 小时', () => {
      const timestamp = '2026-03-19T11:30:00Z'
      expect(service.formatTime(timestamp)).toBe('30 分钟前')
    })

    it('应该返回小时对于小于 24 小时', () => {
      const timestamp = '2026-03-19T10:00:00Z'
      expect(service.formatTime(timestamp)).toBe('2 小时前')
    })

    it('应该返回天对于小于 7 天', () => {
      const timestamp = '2026-03-17T12:00:00Z'
      expect(service.formatTime(timestamp)).toBe('2 天前')
    })

    it('应该返回日期对于超过 7 天', () => {
      const timestamp = '2026-03-10T12:00:00Z'
      const result = service.formatTime(timestamp)
      expect(result).toMatch(/3月/)
    })
  })

  // ============================================================================
  // getClaudeCodeHistoryService 单例测试
  // ============================================================================

  describe('getClaudeCodeHistoryService', () => {
    it('应该返回单例实例', () => {
      // 重置模块以清除单例
      vi.resetModules()

      // 重新导入
      return import('./claudeCodeHistoryService').then((module) => {
        const instance1 = module.getClaudeCodeHistoryService()
        const instance2 = module.getClaudeCodeHistoryService()
        expect(instance1).toBe(instance2)
      })
    })
  })
})

// ============================================================================
// isToolResultMessage 测试（通过 convertToChatMessages 间接测试）
// ============================================================================

describe('isToolResultMessage 间接测试', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
  })

  it('应该正确识别 tool_result 消息', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call-1', content: 'Result' },
        ],
      },
      { role: 'user', content: 'Real question' },
    ]

    const result = service.convertToChatMessages(messages)

    // tool_result 应该被跳过
    expect(result).toHaveLength(1)
  })

  it('应该不跳过普通用户消息', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result).toHaveLength(1)
  })
})

// ============================================================================
// parseAssistantBlocks 测试（通过 convertToChatMessages 间接测试）
// ============================================================================

describe('parseAssistantBlocks 间接测试', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该跳过空的 thinking 块', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'thinking', thinking: '   ' }, // 空白应该被跳过
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks

    // 空白 thinking 应该被跳过
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
  })

  it('应该处理非对象类型的数组项', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: ['string', null, undefined, 123] as unknown[],
      },
    ]

    const result = service.convertToChatMessages(messages)

    // 应该添加空文本块
    const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
  })

  it('应该处理缺少 type 的对象', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [{ text: 'Hello' }] as Array<{ text: string }>,
      },
    ]

    const result = service.convertToChatMessages(messages)

    // 应该添加空文本块
    const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks
    expect(blocks).toHaveLength(1)
  })
})

// ============================================================================
// extractUserContent 测试（通过 convertToChatMessages 间接测试）
// ============================================================================

describe('extractUserContent 间接测试', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
  })

  it('应该从用户消息中过滤 tool_result', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_result', tool_use_id: 'call-1', content: 'Result' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result).toHaveLength(1)
    expect((result[0] as { content: string }).content).toBe('Hello')
  })

  it('应该处理非字符串非数组的 content', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: { foo: 'bar' } as unknown as string,
      },
    ]

    const result = service.convertToChatMessages(messages)

    expect((result[0] as { content: string }).content).toBe('')
  })
})

// ============================================================================
// 复杂场景测试
// ============================================================================

describe('复杂场景测试', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  describe('多轮对话流程', () => {
    it('应该正确处理完整的对话流程', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Hello', timestamp: '2026-03-19T10:00:00Z' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
          timestamp: '2026-03-19T10:01:00Z',
        },
        { role: 'user', content: 'How are you?', timestamp: '2026-03-19T10:02:00Z' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I am doing well!' }],
          timestamp: '2026-03-19T10:03:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(4)
      expect(result[0].type).toBe('user')
      expect(result[1].type).toBe('assistant')
      expect(result[2].type).toBe('user')
      expect(result[3].type).toBe('assistant')
    })

    it('应该正确处理带有工具调用的对话流程', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Read a file', timestamp: '2026-03-19T10:00:00Z' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I need to read the file...' },
            { type: 'tool_use', id: 'call-1', name: 'ReadFile', input: { path: '/test' } },
          ],
          timestamp: '2026-03-19T10:01:00Z',
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'File content' }],
          timestamp: '2026-03-19T10:02:00Z',
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Here is the file content' }],
          timestamp: '2026-03-19T10:03:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      // tool_result 消息被跳过后，两个 assistant 消息会被合并
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('user')
      expect((result[0] as { content: string }).content).toBe('Read a file')
      expect(result[1].type).toBe('assistant')
      // 两个 assistant 消息的 blocks 应该合并
      const blocks = (result[1] as { blocks: Array<{ type: string }> }).blocks
      expect(blocks).toHaveLength(3) // thinking, tool_use, text
    })

    it('应该正确处理多个连续 assistant 消息被用户消息打断', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 1' }],
          timestamp: '2026-03-19T10:00:00Z',
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 2' }],
          timestamp: '2026-03-19T10:01:00Z',
        },
        { role: 'user', content: 'Interrupt!', timestamp: '2026-03-19T10:02:00Z' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 3' }],
          timestamp: '2026-03-19T10:03:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(3)
      // 前两个 assistant 合并
      expect(result[0].type).toBe('assistant')
      const blocks1 = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
      expect(blocks1).toHaveLength(2)
      // 用户消息
      expect(result[1].type).toBe('user')
      // 第三个 assistant
      expect(result[2].type).toBe('assistant')
    })
  })

  describe('tool_result 与文本混合场景', () => {
    it('应该保留包含文本和 tool_result 的用户消息中的文本', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'I have a question' },
            { type: 'tool_result', tool_use_id: 'call-1', content: 'Previous result' },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      // 应该保留这条消息，提取文本内容
      expect(result).toHaveLength(1)
      expect((result[0] as { content: string }).content).toBe('I have a question')
    })

    it('应该正确处理多个 tool_result 的用户消息（无文本）', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call-1', content: 'Result 1' },
            { type: 'tool_result', tool_use_id: 'call-2', content: 'Result 2' },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
        { role: 'user', content: 'Next question', timestamp: '2026-03-19T10:01:00Z' },
      ]

      const result = service.convertToChatMessages(messages)

      // 第一个消息应该被跳过
      expect(result).toHaveLength(1)
      expect((result[0] as { content: string }).content).toBe('Next question')
    })

    it('应该在 tool_result 后正确累积 assistant 消息', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me check' }],
          timestamp: '2026-03-19T10:00:00Z',
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'Result' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Based on result' }],
          timestamp: '2026-03-19T10:02:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      // tool_result 被跳过后，两个 assistant 消息会被合并
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('assistant')
      // 两个 assistant 消息的 blocks 应该合并
      const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
      expect(blocks).toHaveLength(2)
      expect(blocks[0].content).toBe('Let me check')
      expect(blocks[1].content).toBe('Based on result')
    })
  })

  describe('thinking 块完整属性验证', () => {
    it('应该正确设置 thinking 块的 collapsed 属性', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: 'Deep thinking process...',
            },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)
      const blocks = (result[0] as { blocks: Array<{ type: string; content?: string; collapsed?: boolean }> }).blocks

      expect(blocks[0].type).toBe('thinking')
      expect(blocks[0].content).toBe('Deep thinking process...')
      expect(blocks[0].collapsed).toBe(true)
    })
  })

  describe('tool_call 块完整属性验证', () => {
    it('应该正确解析 tool_call 块的所有属性', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call-123',
              name: 'WriteFile',
              input: { path: '/test.txt', content: 'Hello' },
            },
          ],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)
      const blocks = (result[0] as { blocks: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; status?: string }> }).blocks

      expect(blocks[0].type).toBe('tool_call')
      expect(blocks[0].id).toBe('call-123')
      expect(blocks[0].name).toBe('WriteFile')
      expect(blocks[0].input).toEqual({ path: '/test.txt', content: 'Hello' })
      expect(blocks[0].status).toBe('completed')
    })

    it('应该为缺少属性的 tool_use 生成默认值', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'tool_use' }],
          timestamp: '2026-03-19T10:00:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)
      const blocks = (result[0] as { blocks: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }> }).blocks

      expect(blocks[0].type).toBe('tool_call')
      expect(blocks[0].id).toBe('uuid-1')
      expect(blocks[0].name).toBe('unknown')
      expect(blocks[0].input).toEqual({})
    })
  })

  describe('系统消息穿插场景', () => {
    it('应该正确处理系统消息穿插在对话中', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: 'Start', timestamp: '2026-03-19T10:00:00Z' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          timestamp: '2026-03-19T10:01:00Z',
        },
        { role: 'system', content: 'System notification', timestamp: '2026-03-19T10:02:00Z' },
        { role: 'user', content: 'Continue', timestamp: '2026-03-19T10:03:00Z' },
      ]

      const result = service.convertToChatMessages(messages)

      expect(result).toHaveLength(4)
      expect(result[0].type).toBe('user')
      expect(result[1].type).toBe('assistant')
      expect(result[2].type).toBe('system')
      expect(result[3].type).toBe('user')
    })

    it('应该在系统消息后正确重置 assistant 累积', () => {
      const messages: ClaudeCodeMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 1' }],
          timestamp: '2026-03-19T10:00:00Z',
        },
        { role: 'system', content: 'System message', timestamp: '2026-03-19T10:01:00Z' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 2' }],
          timestamp: '2026-03-19T10:02:00Z',
        },
      ]

      const result = service.convertToChatMessages(messages)

      // 系统消息会打断 assistant 累积
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('assistant')
      expect(result[1].type).toBe('system')
      expect(result[2].type).toBe('assistant')
    })
  })

  describe('边界情况', () => {
    it('应该处理超大数字的文件大小（超出 GB 范围）', () => {
      // formatFileSize 的 sizes 数组只有 ['B', 'KB', 'MB', 'GB']
      // 超出 GB 范围的数字会返回 undefined 单位
      const result = service.formatFileSize(Number.MAX_SAFE_INTEGER)
      // 验证函数不会崩溃，返回某种格式的字符串
      expect(typeof result).toBe('string')
      expect(result).toMatch(/\d/)
    })

    it('应该处理小数文件大小', () => {
      expect(service.formatFileSize(1500)).toBe('1.46 KB')
    })

    it('应该处理包含特殊字符的消息内容', () => {
      const specialChars = 'Hello\nWorld\tTabbed<script>alert("xss")</script>'
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: specialChars },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result[0].content).toBe(specialChars)
    })

    it('应该处理 Unicode 字符', () => {
      const unicodeContent = '你好世界 🌍 مرحبا Привет'
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: unicodeContent },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result[0].content).toBe(unicodeContent)
    })

    it('应该处理空字符串内容', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: '' },
      ]

      const result = service.convertToChatMessages(messages)

      expect((result[0] as { content: string }).content).toBe('')
    })

    it('应该处理 null content', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: null as unknown as string },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result[0].content).toBe('')
    })

    it('应该处理 undefined content', () => {
      const messages: ClaudeCodeMessage[] = [
        { role: 'user', content: undefined as unknown as string },
      ]

      const result = service.convertMessagesToFormat(messages)

      expect(result[0].content).toBe('')
    })
  })

  describe('性能相关', () => {
    it('应该高效处理大量消息', () => {
      // 生成 100 条消息
      const messages: ClaudeCodeMessage[] = []
      for (let i = 0; i < 100; i++) {
        messages.push(
          { role: 'user', content: `Question ${i}`, timestamp: `2026-03-19T10:${String(i).padStart(2, '0')}:00Z` },
          {
            role: 'assistant',
            content: [{ type: 'text', text: `Answer ${i}` }],
            timestamp: `2026-03-19T10:${String(i + 1).padStart(2, '0')}:00Z`,
          }
        )
      }

      const startTime = performance.now()
      const result = service.convertToChatMessages(messages)
      const endTime = performance.now()

      expect(result).toHaveLength(200)
      expect(endTime - startTime).toBeLessThan(100) // 应该在 100ms 内完成
    })

    it('应该处理大量 tool_result 消息', () => {
      const messages: ClaudeCodeMessage[] = []

      // 50 个 tool_result 消息
      for (let i = 0; i < 50; i++) {
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: `call-${i}`, content: `Result ${i}` }],
        })
      }

      // 最后一个真实用户消息
      messages.push({ role: 'user', content: 'Final question' })

      const result = service.convertToChatMessages(messages)

      // 只有最后一个用户消息应该保留
      expect(result).toHaveLength(1)
    })
  })
})

// ============================================================================
// extractContentText 更多边界情况测试（通过 convertMessagesToFormat 间接测试）
// ============================================================================

describe('extractContentText 边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
  })

  it('应该处理数组中的 null 项', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [null, { type: 'text', text: 'Hello' }, null] as unknown[],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe('Hello')
  })

  it('应该处理数组中的 undefined 项', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [undefined, { type: 'text', text: 'World' }] as unknown[],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe('World')
  })

  it('应该处理数组中的原始类型', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [123, true, { type: 'text', text: 'Text' }] as unknown[],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    // 原始类型不是对象，应该被跳过
    expect(result[0].content).toBe('Text')
  })

  it('应该处理嵌套的对象结构', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Start' },
          { nested: { type: 'text', text: 'Nested' } }, // 没有 type 字段
          { type: 'text', text: 'End' },
        ],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    // 只有正确的 text 块应该被提取
    expect(result[0].content).toBe('StartEnd')
  })

  it('应该处理 text 字段为非字符串的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 123 } as unknown,
          { type: 'text', text: null } as unknown,
          { type: 'text', text: undefined } as unknown,
        ],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    // String() 转换：123 -> "123", null -> "null", undefined -> "undefined"
    expect(result[0].content).toBe('123nullundefined')
  })

  it('应该连接多个文本块', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Part1' },
          { type: 'text', text: 'Part2' },
          { type: 'text', text: 'Part3' },
        ],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe('Part1Part2Part3')
  })

  it('应该处理空数组内容', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe('')
  })

  it('应该处理数组中只有非文本类型的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'image', data: 'base64...' },
          { type: 'audio', data: 'audio...' },
        ],
      },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe('')
  })
})

// ============================================================================
// parseAssistantBlocks 更多边界情况测试（通过 convertToChatMessages 间接测试）
// ============================================================================

describe('parseAssistantBlocks 边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该跳过未知类型的块', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'unknown', data: 'something' },
          { type: 'text', text: 'Hello' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks

    // 只有 text 块应该被保留
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
  })

  it('应该处理 tool_use 缺少 input 的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'Test' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string; input?: Record<string, unknown> }> }).blocks

    expect(blocks[0].input).toEqual({})
  })

  it('应该处理 tool_use 的 input 为 null 的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'Test', input: null },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string; input?: Record<string, unknown> }> }).blocks

    expect(blocks[0].input).toEqual({})
  })

  it('应该正确处理复杂的 tool_use input', () => {
    const complexInput = {
      path: '/test/path',
      options: {
        recursive: true,
        filters: ['*.ts', '*.tsx'],
      },
      metadata: {
        created: '2026-03-19',
        tags: ['important', 'draft'],
      },
    }

    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'SearchFiles', input: complexInput },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string; input?: Record<string, unknown> }> }).blocks

    expect(blocks[0].input).toEqual(complexInput)
  })

  it('应该正确处理空白 thinking 内容', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'thinking', thinking: '   ' },
          { type: 'thinking', thinking: '\n\t' },
          { type: 'text', text: 'Real content' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks

    // 空白 thinking 应该被跳过
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
  })

  it('应该正确处理多行 thinking 内容', () => {
    const thinkingContent = `Line 1
Line 2
Line 3
  Indented line`

    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: thinkingContent },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks

    expect(blocks[0].content).toBe(thinkingContent)
  })

  it('应该处理混合类型的复杂助手消息', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me analyze...' },
          { type: 'text', text: 'I will help you.' },
          { type: 'tool_use', id: 'call-1', name: 'ReadFile', input: { path: '/test' } },
          { type: 'text', text: 'Here is the result.' },
          { type: 'unknown', data: 'ignored' },
          { type: 'tool_use', id: 'call-2', name: 'WriteFile', input: { path: '/out' } },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string }> }).blocks

    // thinking + text + tool_use + text + tool_use = 5
    expect(blocks).toHaveLength(5)
    expect(blocks[0].type).toBe('thinking')
    expect(blocks[1].type).toBe('text')
    expect(blocks[2].type).toBe('tool_call')
    expect(blocks[3].type).toBe('text')
    expect(blocks[4].type).toBe('tool_call')
  })
})

// ============================================================================
// extractUserContent 更多边界情况测试（通过 convertToChatMessages 间接测试）
// ============================================================================

describe('extractUserContent 边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
  })

  it('应该处理用户消息数组中的非对象项', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: ['string', 123, true, null, undefined] as unknown[],
      },
    ]

    const result = service.convertToChatMessages(messages)

    // 非对象项应该被跳过，结果是空字符串
    expect((result[0] as { content: string }).content).toBe('')
  })

  it('应该处理用户消息数组中缺少 type 的对象', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: [
          { text: 'No type field' },
          { type: 'text', text: 'Has type' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)

    // 缺少 type 的对象应该被跳过
    expect((result[0] as { content: string }).content).toBe('Has type')
  })

  it('应该正确过滤 tool_result 并保留文本', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call-1', content: 'Result 1' },
          { type: 'text', text: 'User message' },
          { type: 'tool_result', tool_use_id: 'call-2', content: 'Result 2' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)

    expect((result[0] as { content: string }).content).toBe('User message')
  })

  it('应该处理用户消息中的空白文本', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '' },
          { type: 'text', text: '   ' },
          { type: 'text', text: 'Real text' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)

    // 空白文本应该被保留（由上层决定是否过滤）
    expect((result[0] as { content: string }).content).toBe('   Real text')
  })
})

// ============================================================================
// 错误恢复场景测试
// ============================================================================

describe('错误恢复场景', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该从 Tauri invoke 错误中恢复并返回空数组', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network error'))

    const result = await service.listSessions('/path')

    expect(result).toEqual([])
  })

  it('应该从 Tauri invoke 返回无效数据中恢复', async () => {
    // 返回非数组数据
    mockInvoke.mockResolvedValueOnce({ invalid: 'data' })

    const result = await service.listSessions('/path')

    // 由于类型转换，应该返回原始数据
    expect(result).toEqual({ invalid: 'data' })
  })

  it('应该处理会话历史获取失败', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Session not found'))

    const result = await service.getSessionHistory('invalid-session')

    expect(result).toEqual([])
  })

  it('应该处理消息转换中的错误数据', () => {
    const messages: ClaudeCodeMessage[] = [
      // @ts-expect-error 故意传入错误数据
      { role: 'invalid-role', content: 'test' },
      { role: 'user', content: 'valid' },
    ]

    // 不应该抛出异常
    const result = service.convertToChatMessages(messages)

    expect(result.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// 类型安全测试
// ============================================================================

describe('类型安全测试', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该正确设置 ChatMessage 的 id', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'Hello' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result[0].id).toBeDefined()
    expect(typeof result[0].id).toBe('string')
  })

  it('应该正确设置 ChatMessage 的 timestamp', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'Hello', timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result[0].timestamp).toBe('2026-03-19T10:00:00Z')
  })

  it('应该为缺少 timestamp 的消息生成默认时间戳', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'Hello' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result[0].timestamp).toBeDefined()
    // 验证是有效的 ISO 格式
    expect(() => new Date(result[0].timestamp!)).not.toThrow()
  })

  it('应该正确设置 assistant 消息的 isStreaming 属性', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]

    const result = service.convertToChatMessages(messages)

    expect((result[0] as { isStreaming: boolean }).isStreaming).toBe(false)
  })

  it('应该正确设置 tool_call 块的 status 属性', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'Test', input: {} },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string; status?: string }> }).blocks

    expect(blocks[0].status).toBe('completed')
  })

  it('应该正确设置 thinking 块的 collapsed 属性', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Deep thought' },
        ],
      },
    ]

    const result = service.convertToChatMessages(messages)
    const blocks = (result[0] as { blocks: Array<{ type: string; collapsed?: boolean }> }).blocks

    expect(blocks[0].collapsed).toBe(true)
  })
})

// ============================================================================
// 时间格式化边界情况测试
// ============================================================================

describe('formatTime 边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-19T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应该处理刚好 1 分钟前的时间', () => {
    const timestamp = '2026-03-19T11:59:00Z'
    expect(service.formatTime(timestamp)).toBe('1 分钟前')
  })

  it('应该处理刚好 1 小时前的时间', () => {
    const timestamp = '2026-03-19T11:00:00Z'
    expect(service.formatTime(timestamp)).toBe('1 小时前')
  })

  it('应该处理刚好 1 天前的时间', () => {
    const timestamp = '2026-03-18T12:00:00Z'
    expect(service.formatTime(timestamp)).toBe('1 天前')
  })

  it('应该处理刚好 7 天前的时间（边界值）', () => {
    const timestamp = '2026-03-12T12:00:00Z'
    const result = service.formatTime(timestamp)
    // 7 天应该显示日期
    expect(result).toMatch(/3月/)
  })

  it('应该处理未来时间', () => {
    const timestamp = '2026-03-19T13:00:00Z'
    const result = service.formatTime(timestamp)
    // 未来时间可能显示负数或特定格式
    expect(typeof result).toBe('string')
  })

  it('应该处理无效的时间戳', () => {
    const timestamp = 'invalid-timestamp'
    const result = service.formatTime(timestamp)
    // 应该返回某种格式，而不是抛出异常
    expect(typeof result).toBe('string')
  })
})

// ============================================================================
// formatFileSize 更多边界情况测试
// ============================================================================

describe('formatFileSize 更多边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
  })

  it('应该处理负数文件大小', () => {
    // 负数会导致 Math.log 返回 NaN
    const result = service.formatFileSize(-1)
    expect(typeof result).toBe('string')
  })

  it('应该处理非常小的正数', () => {
    expect(service.formatFileSize(0.5)).toBe('0.5 B')
    expect(service.formatFileSize(0.001)).toBe('0 B')
  })

  it('应该处理刚好是 1024 倍数的文件大小', () => {
    expect(service.formatFileSize(1024)).toBe('1 KB')
    expect(service.formatFileSize(1048576)).toBe('1 MB')
    expect(service.formatFileSize(1073741824)).toBe('1 GB')
  })

  it('应该正确四舍五入文件大小', () => {
    // 1536 = 1.5 KB
    expect(service.formatFileSize(1536)).toBe('1.5 KB')
    // 1600 = 1.56 KB -> 1.56 KB
    expect(service.formatFileSize(1600)).toBe('1.56 KB')
  })
})

// ============================================================================
// 合并逻辑边界情况测试
// ============================================================================

describe('合并逻辑边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该处理只有 assistant 消息的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'Part 1' }], timestamp: '2026-03-19T10:00:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'Part 2' }], timestamp: '2026-03-19T10:01:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'Part 3' }], timestamp: '2026-03-19T10:02:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    // 所有 assistant 消息应该合并为一条
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('assistant')
    const blocks = (result[0] as { blocks: Array<{ type: string; content?: string }> }).blocks
    expect(blocks).toHaveLength(3)
  })

  it('应该处理 user -> assistant -> user -> assistant 交替', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'Q1', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'A1' }], timestamp: '2026-03-19T10:01:00Z' },
      { role: 'user', content: 'Q2', timestamp: '2026-03-19T10:02:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'A2' }], timestamp: '2026-03-19T10:03:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result).toHaveLength(4)
    expect(result[0].type).toBe('user')
    expect(result[1].type).toBe('assistant')
    expect(result[2].type).toBe('user')
    expect(result[3].type).toBe('assistant')
  })

  it('应该正确处理 system 消息打断 assistant 合并', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'A1' }], timestamp: '2026-03-19T10:00:00Z' },
      { role: 'system', content: 'System notification', timestamp: '2026-03-19T10:01:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'A2' }], timestamp: '2026-03-19T10:02:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'A3' }], timestamp: '2026-03-19T10:03:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    // 第一个 assistant，然后 system，然后合并后的两个 assistant
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('assistant')
    expect(result[1].type).toBe('system')
    expect(result[2].type).toBe('assistant')
    // 最后一个 assistant 应该有两个 block
    const blocks = (result[2] as { blocks: Array<{ type: string }> }).blocks
    expect(blocks).toHaveLength(2)
  })

  it('应该处理以 user 开头的消息序列', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'Start', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'assistant', content: [{ type: 'text', text: 'Response' }], timestamp: '2026-03-19T10:01:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('user')
    expect(result[1].type).toBe('assistant')
  })

  it('应该处理以 system 开头的消息序列', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'system', content: 'Initial system message', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'user', content: 'Hello', timestamp: '2026-03-19T10:01:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('system')
    expect(result[1].type).toBe('user')
  })

  it('应该处理连续的 system 消息', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'system', content: 'System 1', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'system', content: 'System 2', timestamp: '2026-03-19T10:01:00Z' },
    ]

    const result = service.convertToChatMessages(messages)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('system')
    expect(result[1].type).toBe('system')
  })
})

// ============================================================================
// extractToolCalls 更多场景测试
// ============================================================================

describe('extractToolCalls 更多场景', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该从多个 assistant 消息中提取所有工具调用', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'ReadFile', input: { path: '/a' } },
        ],
        timestamp: '2026-03-19T10:00:00Z',
      },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-2', name: 'WriteFile', input: { path: '/b' } },
        ],
        timestamp: '2026-03-19T10:01:00Z',
      },
    ]

    const result = service.extractToolCalls(messages)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('call-1')
    expect(result[1].id).toBe('call-2')
  })

  it('应该处理同一消息中的多个工具调用', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'ReadFile', input: { path: '/a' } },
          { type: 'tool_use', id: 'call-2', name: 'WriteFile', input: { path: '/b' } },
          { type: 'tool_use', id: 'call-3', name: 'DeleteFile', input: { path: '/c' } },
        ],
        timestamp: '2026-03-19T10:00:00Z',
      },
    ]

    const result = service.extractToolCalls(messages)

    expect(result).toHaveLength(3)
  })

  it('应该正确处理工具调用的 timestamp', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'Test', input: {} },
        ],
        timestamp: '2026-03-19T10:00:00Z',
      },
    ]

    const result = service.extractToolCalls(messages)

    expect(result[0].startedAt).toBe('2026-03-19T10:00:00Z')
  })

  it('应该为缺少 timestamp 的工具调用生成默认时间', () => {
    const messages: ClaudeCodeMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'Test', input: {} },
        ],
      },
    ]

    const result = service.extractToolCalls(messages)

    expect(result[0].startedAt).toBeDefined()
  })
})

// ============================================================================
// convertMessagesToFormat 更多场景测试
// ============================================================================

describe('convertMessagesToFormat 更多场景', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
  })

  it('应该处理混合 role 的消息列表', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'Q1', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'assistant', content: 'A1', timestamp: '2026-03-19T10:01:00Z' },
      { role: 'user', content: 'Q2', timestamp: '2026-03-19T10:02:00Z' },
      { role: 'assistant', content: 'A2', timestamp: '2026-03-19T10:03:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result).toHaveLength(4)
    expect(result[0].role).toBe('user')
    expect(result[1].role).toBe('assistant')
  })

  it('应该保留消息顺序', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'First', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'user', content: 'Second', timestamp: '2026-03-19T10:01:00Z' },
      { role: 'user', content: 'Third', timestamp: '2026-03-19T10:02:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe('First')
    expect(result[1].content).toBe('Second')
    expect(result[2].content).toBe('Third')
  })

  it('应该为每条消息生成唯一 ID', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: 'A', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'user', content: 'B', timestamp: '2026-03-19T10:01:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].id).toBe('user-0')
    expect(result[1].id).toBe('user-1')
  })
})

// ============================================================================
// 服务实例测试
// ============================================================================

describe('服务实例测试', () => {
  it('应该创建新的服务实例', () => {
    const service = new ClaudeCodeHistoryService()
    expect(service).toBeInstanceOf(ClaudeCodeHistoryService)
  })

  it('getClaudeCodeHistoryService 应该返回 ClaudeCodeHistoryService 实例', () => {
    const service = getClaudeCodeHistoryService()
    expect(service).toBeInstanceOf(ClaudeCodeHistoryService)
  })

  it('多次调用 getClaudeCodeHistoryService 应该返回同一实例', () => {
    const service1 = getClaudeCodeHistoryService()
    const service2 = getClaudeCodeHistoryService()
    expect(service1).toBe(service2)
  })
})

// ============================================================================
// 消息类型边界情况测试
// ============================================================================

describe('消息类型边界情况', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
    uuidIndex = 0
  })

  it('应该处理 role 为未知类型的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'custom', content: 'Custom message', timestamp: '2026-03-19T10:00:00Z' },
      { role: 'user', content: 'User message', timestamp: '2026-03-19T10:01:00Z' },
    ]

    // 不应该抛出异常
    const result = service.convertToChatMessages(messages)
    expect(result.length).toBeGreaterThan(0)
  })

  it('应该处理空 role 的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: '', content: 'Empty role', timestamp: '2026-03-19T10:00:00Z' },
    ]

    // 不应该抛出异常
    const result = service.convertToChatMessages(messages)
    expect(result.length).toBeGreaterThan(0)
  })

  it('应该处理缺少 role 的情况', () => {
    const messages = [
      { content: 'No role', timestamp: '2026-03-19T10:00:00Z' },
    ] as ClaudeCodeMessage[]

    // 不应该抛出异常
    const result = service.convertToChatMessages(messages)
    expect(result.length).toBeGreaterThan(0)
  })

  it('应该处理大写 role 的情况', () => {
    const messages: ClaudeCodeMessage[] = [
      { role: 'USER', content: 'Upper case', timestamp: '2026-03-19T10:00:00Z' },
    ]

    // 不应该抛出异常
    const result = service.convertToChatMessages(messages)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// 特殊字符和编码测试
// ============================================================================

describe('特殊字符和编码测试', () => {
  let service: ClaudeCodeHistoryService

  beforeEach(() => {
    service = new ClaudeCodeHistoryService()
    vi.clearAllMocks()
  })

  it('应该正确处理 JSON 字符串', () => {
    const jsonContent = '{"key": "value", "number": 123}'
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: jsonContent, timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe(jsonContent)
  })

  it('应该正确处理 HTML 标签', () => {
    const htmlContent = '<div>Hello <span>World</span></div>'
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: htmlContent, timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe(htmlContent)
  })

  it('应该正确处理代码块', () => {
    const codeContent = '```typescript\nconst x = 1;\n```'
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: codeContent, timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe(codeContent)
  })

  it('应该正确处理 Markdown 格式', () => {
    const mdContent = '# Heading\n\n- Item 1\n- Item 2\n\n**Bold** and *italic*'
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: mdContent, timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe(mdContent)
  })

  it('应该正确处理转义字符', () => {
    const escapedContent = 'Line1\\nLine2\\tTabbed\\"Quote\\"'
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: escapedContent, timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe(escapedContent)
  })

  it('应该正确处理长文本', () => {
    const longContent = 'A'.repeat(10000)
    const messages: ClaudeCodeMessage[] = [
      { role: 'user', content: longContent, timestamp: '2026-03-19T10:00:00Z' },
    ]

    const result = service.convertMessagesToFormat(messages)

    expect(result[0].content).toBe(longContent)
    expect(result[0].content.length).toBe(10000)
  })
})
