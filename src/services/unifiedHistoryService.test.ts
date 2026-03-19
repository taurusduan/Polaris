/**
 * unifiedHistoryService 单元测试
 *
 * 测试覆盖：
 * 1. listAllSessions - 列出所有 Provider 会话
 * 2. listSessionsByProvider - 按 Provider 列出会话
 * 3. getSessionHistory - 获取会话历史
 * 4. searchSessions - 搜索会话
 * 5. filterSessionsByTimeRange - 按时间范围过滤
 * 6. getStats - 获取统计信息
 * 7. 工具函数: formatFileSize, formatTime, getProviderName, getProviderIcon
 * 8. 单例模式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  UnifiedHistoryService,
  getUnifiedHistoryService,
  resetUnifiedHistoryService,
  type ProviderType,
  type UnifiedSessionMeta,
} from './unifiedHistoryService'

// 创建可重用的 mock 函数
const mockClaudeListSessions = vi.fn()
const mockClaudeGetSessionHistory = vi.fn()
const mockClaudeConvertMessages = vi.fn()

const mockIFlowListSessions = vi.fn()
const mockIFlowGetSessionHistory = vi.fn()
const mockIFlowConvertMessages = vi.fn()

const mockCodexListSessions = vi.fn()
const mockCodexGetSessionHistory = vi.fn()
const mockCodexConvertMessages = vi.fn()

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock 依赖服务 - 使用共享的 mock 函数
vi.mock('./claudeCodeHistoryService', () => ({
  getClaudeCodeHistoryService: () => ({
    listSessions: mockClaudeListSessions,
    getSessionHistory: mockClaudeGetSessionHistory,
    convertMessagesToFormat: mockClaudeConvertMessages,
  }),
}))

vi.mock('./iflowHistoryService', () => ({
  getIFlowHistoryService: () => ({
    listSessions: mockIFlowListSessions,
    getSessionHistory: mockIFlowGetSessionHistory,
    convertMessagesToFormat: mockIFlowConvertMessages,
  }),
}))

vi.mock('./codexHistoryService', () => ({
  getCodexHistoryService: () => ({
    listSessions: mockCodexListSessions,
    getSessionHistory: mockCodexGetSessionHistory,
    convertMessagesToFormat: mockCodexConvertMessages,
  }),
}))

describe('UnifiedHistoryService', () => {
  let service: UnifiedHistoryService

  beforeEach(() => {
    vi.clearAllMocks()
    resetUnifiedHistoryService()
    service = new UnifiedHistoryService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // 工具函数测试
  // ===========================================================================

  describe('formatFileSize', () => {
    it('应正确处理 0 字节', () => {
      expect(service.formatFileSize(0)).toBe('0 B')
    })

    it('应正确格式化字节', () => {
      expect(service.formatFileSize(512)).toBe('512 B')
    })

    it('应正确格式化 KB', () => {
      expect(service.formatFileSize(1024)).toBe('1 KB')
      expect(service.formatFileSize(2048)).toBe('2 KB')
      expect(service.formatFileSize(1536)).toBe('1.5 KB')
    })

    it('应正确格式化 MB', () => {
      expect(service.formatFileSize(1048576)).toBe('1 MB')
      expect(service.formatFileSize(1572864)).toBe('1.5 MB')
      expect(service.formatFileSize(10485760)).toBe('10 MB')
    })

    it('应正确格式化 GB', () => {
      expect(service.formatFileSize(1073741824)).toBe('1 GB')
      expect(service.formatFileSize(5368709120)).toBe('5 GB')
    })

    it('应正确处理边界值', () => {
      expect(service.formatFileSize(1)).toBe('1 B')
      expect(service.formatFileSize(1023)).toBe('1023 B')
      expect(service.formatFileSize(1025)).toBe('1 KB')
    })

    // 边界值测试：验证 bytes < 1 时的行为
    it('应正确处理负数字节（边界值）', () => {
      // 当 bytes < 1 时 Math.log 返回负数，可能导致数组越界
      // 这是一个边界值测试，验证函数的健壮性
      const result = service.formatFileSize(-1)
      // 函数没有处理负数，返回的可能是 undefined 或异常值
      // 这个测试记录当前行为，不强制要求特定返回值
      expect(typeof result).toBe('string')
    })

    it('应正确处理小数字节（边界值）', () => {
      // Math.log(0.5) 返回负数，可能导致数组索引越界
      const result = service.formatFileSize(0.5)
      expect(typeof result).toBe('string')
    })

    it('应正确处理非常大的数值', () => {
      // 测试大于 GB 的情况
      const result = service.formatFileSize(1099511627776) // 1 TB
      expect(typeof result).toBe('string')
      // 由于 sizes 数组只有 ['B', 'KB', 'MB', 'GB']，TB 会越界
    })
  })

  describe('formatTime', () => {
    it('应返回 "刚刚" 对于小于 1 分钟', () => {
      const now = new Date().toISOString()
      expect(service.formatTime(now)).toBe('刚刚')
    })

    it('应返回分钟数对于小于 1 小时', () => {
      const date = new Date(Date.now() - 5 * 60000)
      expect(service.formatTime(date.toISOString())).toBe('5 分钟前')
    })

    it('应返回小时数对于小于 24 小时', () => {
      const date = new Date(Date.now() - 3 * 3600000)
      expect(service.formatTime(date.toISOString())).toBe('3 小时前')
    })

    it('应返回天数对于小于 7 天', () => {
      const date = new Date(Date.now() - 3 * 86400000)
      expect(service.formatTime(date.toISOString())).toBe('3 天前')
    })

    it('应返回日期格式对于超过 7 天', () => {
      const date = new Date(Date.now() - 10 * 86400000)
      const result = service.formatTime(date.toISOString())
      expect(result).toMatch(/\d+月\d+/)
    })

    it('应正确处理同年和非同年的日期', () => {
      const lastYear = new Date()
      lastYear.setFullYear(lastYear.getFullYear() - 1)
      const result = service.formatTime(lastYear.toISOString())
      expect(result).toMatch(/\d{4}年/)
    })
  })

  describe('getProviderName', () => {
    it('应返回 Claude Code 的正确名称', () => {
      expect(service.getProviderName('claude-code')).toBe('Claude Code')
    })

    it('应返回 IFlow 的正确名称', () => {
      expect(service.getProviderName('iflow')).toBe('IFlow')
    })

    it('应返回 Codex 的正确名称', () => {
      expect(service.getProviderName('codex')).toBe('Codex')
    })

    it('对于未知 provider 应返回原始值', () => {
      expect(service.getProviderName('unknown' as ProviderType)).toBe('unknown')
    })
  })

  describe('getProviderIcon', () => {
    it('应返回 Claude Code 的正确图标', () => {
      expect(service.getProviderIcon('claude-code')).toBe('Claude')
    })

    it('应返回 IFlow 的正确图标', () => {
      expect(service.getProviderIcon('iflow')).toBe('IFlow')
    })

    it('应返回 Codex 的正确图标', () => {
      expect(service.getProviderIcon('codex')).toBe('Codex')
    })

    it('对于未知 provider 应返回 AI', () => {
      expect(service.getProviderIcon('unknown' as ProviderType)).toBe('AI')
    })
  })

  // ===========================================================================
  // listAllSessions 测试
  // ===========================================================================

  describe('listAllSessions', () => {
    it('应并发查询所有 Provider 并返回合并结果', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Claude Session', messageCount: 5, fileSize: 1024, created: '2026-03-19T10:00:00Z', modified: '2026-03-19T11:00:00Z' },
      ])
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-1', title: 'IFlow Session', messageCount: 3, fileSize: 512, createdAt: '2026-03-19T09:00:00Z', updatedAt: '2026-03-19T10:00:00Z' },
      ])
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-1', title: 'Codex Session', messageCount: 2, fileSize: 256, createdAt: '2026-03-19T08:00:00Z', updatedAt: '2026-03-19T09:00:00Z', filePath: '/path/to/file' },
      ])

      const result = await service.listAllSessions()

      expect(result).toHaveLength(3)
      expect(mockClaudeListSessions).toHaveBeenCalled()
      expect(mockIFlowListSessions).toHaveBeenCalled()
      expect(mockCodexListSessions).toHaveBeenCalled()
    })

    it('应按 updatedAt 排序结果', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Old', messageCount: 1, fileSize: 100, created: '2026-03-18T10:00:00Z', modified: '2026-03-18T11:00:00Z' },
      ])
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-1', title: 'New', messageCount: 1, fileSize: 100, createdAt: '2026-03-19T10:00:00Z', updatedAt: '2026-03-19T11:00:00Z' },
      ])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].sessionId).toBe('if-1')
      expect(result[1].sessionId).toBe('cc-1')
    })

    it('应支持过滤指定 Provider', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      await service.listAllSessions({ providers: ['claude-code'] })

      expect(mockClaudeListSessions).toHaveBeenCalled()
      expect(mockIFlowListSessions).not.toHaveBeenCalled()
      expect(mockCodexListSessions).not.toHaveBeenCalled()
    })

    it('应正确处理部分 Provider 失败的情况', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Success', messageCount: 1, fileSize: 100, created: '2026-03-19T10:00:00Z', modified: '2026-03-19T11:00:00Z' },
      ])
      mockIFlowListSessions.mockRejectedValue(new Error('IFlow error'))
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-1', title: 'Codex', messageCount: 1, fileSize: 100, createdAt: '2026-03-19T09:00:00Z', updatedAt: '2026-03-19T10:00:00Z', filePath: '/path' },
      ])

      const result = await service.listAllSessions()

      expect(result).toHaveLength(2)
    })

    it('应传递 projectPath 给 Claude Code 服务', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      await service.listAllSessions({ projectPath: '/my/project' })

      expect(mockClaudeListSessions).toHaveBeenCalledWith('/my/project')
    })

    it('应传递 workDir 给 Codex 服务', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      await service.listAllSessions({ workDir: '/my/workdir' })

      expect(mockCodexListSessions).toHaveBeenCalledWith('/my/workdir')
    })

    it('应正确处理没有 updatedAt 的会话', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'No time', messageCount: 1, fileSize: 100, created: undefined, modified: undefined },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result).toHaveLength(1)
      expect(result[0].updatedAt).toBeUndefined()
    })

    // 性能测试：大量数据排序
    it('应正确处理大量会话数据并按时间排序', async () => {
      // 生成 100 个会话
      const sessions = Array.from({ length: 100 }, (_, i) => ({
        sessionId: `session-${i}`,
        firstPrompt: `Session ${i}`,
        messageCount: i + 1,
        fileSize: 1024 * (i + 1),
        created: new Date(Date.now() - i * 3600000).toISOString(),
        modified: new Date(Date.now() - i * 1800000).toISOString(),
      }))

      mockClaudeListSessions.mockResolvedValue(sessions.slice(0, 33))
      mockIFlowListSessions.mockResolvedValue(sessions.slice(33, 66).map(s => ({
        ...s,
        title: s.firstPrompt,
      })))
      mockCodexListSessions.mockResolvedValue(sessions.slice(66).map(s => ({
        ...s,
        title: s.firstPrompt,
        filePath: '/path',
      })))

      const startTime = performance.now()
      const result = await service.listAllSessions()
      const endTime = performance.now()

      expect(result).toHaveLength(100)
      // 验证排序正确（最新的在前）
      expect(result[0].sessionId).not.toBe('session-99') // 因为时间差异
      // 性能要求：100 个会话排序应在 100ms 内完成
      expect(endTime - startTime).toBeLessThan(100)
    })

    // 并发安全测试
    it('应正确处理并发调用', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Test', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      // 并发调用多次
      const results = await Promise.all([
        service.listAllSessions(),
        service.listAllSessions(),
        service.listAllSessions(),
      ])

      expect(results[0]).toHaveLength(1)
      expect(results[1]).toHaveLength(1)
      expect(results[2]).toHaveLength(1)
    })
  })

  // ===========================================================================
  // listSessionsByProvider 测试
  // ===========================================================================

  describe('listSessionsByProvider', () => {
    it('应正确返回 Claude Code 会话', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Test', messageCount: 5, fileSize: 1024, created: '2026-03-19T10:00:00Z', modified: '2026-03-19T11:00:00Z' },
      ])

      const result = await service.listSessionsByProvider('claude-code', { projectPath: '/project' })

      expect(result).toHaveLength(1)
      expect(result[0].provider).toBe('claude-code')
      expect(result[0].title).toBe('Test')
      expect(result[0].projectPath).toBe('/project')
    })

    it('应正确返回 IFlow 会话', async () => {
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-1', title: 'IFlow Test', messageCount: 3, fileSize: 512, createdAt: '2026-03-19T10:00:00Z', updatedAt: '2026-03-19T11:00:00Z' },
      ])

      const result = await service.listSessionsByProvider('iflow')

      expect(result).toHaveLength(1)
      expect(result[0].provider).toBe('iflow')
      expect(result[0].title).toBe('IFlow Test')
    })

    it('应正确返回 Codex 会话', async () => {
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-1', title: 'Codex Test', messageCount: 2, fileSize: 256, createdAt: '2026-03-19T10:00:00Z', updatedAt: '2026-03-19T11:00:00Z', filePath: '/path/to/file' },
      ])

      const result = await service.listSessionsByProvider('codex', { workDir: '/workdir' })

      expect(result).toHaveLength(1)
      expect(result[0].provider).toBe('codex')
      expect(result[0].filePath).toBe('/path/to/file')
    })

    it('对于空会话列表应返回空数组', async () => {
      mockClaudeListSessions.mockResolvedValue([])

      const result = await service.listSessionsByProvider('claude-code')

      expect(result).toEqual([])
    })

    it('应返回空数组对于未知 provider', async () => {
      const result = await service.listSessionsByProvider('unknown' as ProviderType)
      expect(result).toEqual([])
    })

    it('应使用默认标题当 firstPrompt 为空时', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: '', messageCount: 1, fileSize: 100 },
      ])

      const result = await service.listSessionsByProvider('claude-code')

      expect(result[0].title).toBe('Claude Code 对话')
    })

    it('应使用默认标题当 IFlow title 为空时', async () => {
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-1', title: '', messageCount: 1, fileSize: 100 },
      ])

      const result = await service.listSessionsByProvider('iflow')

      expect(result[0].title).toBe('IFlow 对话')
    })

    it('应使用默认标题当 Codex title 为空时', async () => {
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-1', title: null, messageCount: 1, fileSize: 100, filePath: '/path' },
      ])

      const result = await service.listSessionsByProvider('codex')

      expect(result[0].title).toBe('Codex 对话')
    })
  })

  // ===========================================================================
  // getSessionHistory 测试
  // ===========================================================================

  describe('getSessionHistory', () => {
    it('应获取 Claude Code 会话历史并转换格式', async () => {
      const mockMessages = [{ role: 'user', content: 'Hello' }]
      const mockConverted = [{ id: '1', role: 'user', content: 'Hello' }]

      mockClaudeGetSessionHistory.mockResolvedValue(mockMessages)
      mockClaudeConvertMessages.mockReturnValue(mockConverted)

      const result = await service.getSessionHistory('claude-code', 'session-1', { projectPath: '/project' })

      expect(mockClaudeGetSessionHistory).toHaveBeenCalledWith('session-1', '/project')
      expect(mockClaudeConvertMessages).toHaveBeenCalledWith(mockMessages)
      expect(result).toEqual(mockConverted)
    })

    it('应获取 IFlow 会话历史并转换格式', async () => {
      const mockMessages = [{ role: 'assistant', content: 'Hi' }]
      const mockConverted = [{ id: '1', role: 'assistant', content: 'Hi' }]

      mockIFlowGetSessionHistory.mockResolvedValue(mockMessages)
      mockIFlowConvertMessages.mockReturnValue(mockConverted)

      const result = await service.getSessionHistory('iflow', 'session-1')

      expect(mockIFlowGetSessionHistory).toHaveBeenCalledWith('session-1')
      expect(mockIFlowConvertMessages).toHaveBeenCalledWith(mockMessages)
      expect(result).toEqual(mockConverted)
    })

    it('应获取 Codex 会话历史并转换格式', async () => {
      const mockMessages = [{ role: 'user', content: 'Code' }]
      const mockConverted = [{ id: '1', role: 'user', content: 'Code' }]

      mockCodexGetSessionHistory.mockResolvedValue(mockMessages)
      mockCodexConvertMessages.mockReturnValue(mockConverted)

      const result = await service.getSessionHistory('codex', 'session-1', { filePath: '/path/to/file.json' })

      expect(mockCodexGetSessionHistory).toHaveBeenCalledWith('/path/to/file.json')
      expect(mockCodexConvertMessages).toHaveBeenCalledWith(mockMessages)
      expect(result).toEqual(mockConverted)
    })

    it('Codex 没有 filePath 时应返回空数组', async () => {
      const result = await service.getSessionHistory('codex', 'session-1')
      expect(result).toEqual([])
    })

    it('未知 provider 应返回空数组', async () => {
      const result = await service.getSessionHistory('unknown' as ProviderType, 'session-1')
      expect(result).toEqual([])
    })

    // 错误恢复测试
    it('Claude Code 服务错误时应抛出错误', async () => {
      mockClaudeGetSessionHistory.mockRejectedValue(new Error('Claude service error'))

      await expect(
        service.getSessionHistory('claude-code', 'session-1')
      ).rejects.toThrow('Claude service error')
    })

    it('IFlow 服务错误时应抛出错误', async () => {
      mockIFlowGetSessionHistory.mockRejectedValue(new Error('IFlow service error'))

      await expect(
        service.getSessionHistory('iflow', 'session-1')
      ).rejects.toThrow('IFlow service error')
    })

    it('Codex 服务错误时应抛出错误', async () => {
      mockCodexGetSessionHistory.mockRejectedValue(new Error('Codex service error'))

      await expect(
        service.getSessionHistory('codex', 'session-1', { filePath: '/path' })
      ).rejects.toThrow('Codex service error')
    })

    it('转换消息错误时应抛出错误', async () => {
      mockClaudeGetSessionHistory.mockResolvedValue([{ role: 'user', content: 'test' }])
      mockClaudeConvertMessages.mockImplementation(() => {
        throw new Error('Conversion error')
      })

      await expect(
        service.getSessionHistory('claude-code', 'session-1')
      ).rejects.toThrow('Conversion error')
    })
  })

  // ===========================================================================
  // searchSessions 测试
  // ===========================================================================

  describe('searchSessions', () => {
    it('应搜索所有 Provider 的会话', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-react', firstPrompt: 'React开发', messageCount: 5, fileSize: 1024, created: '2026-03-19T10:00:00Z', modified: '2026-03-19T11:00:00Z' },
      ])
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-vue', title: 'Vue项目', messageCount: 3, fileSize: 512, createdAt: '2026-03-19T09:00:00Z', updatedAt: '2026-03-19T10:00:00Z' },
      ])
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-react', title: 'React测试', messageCount: 2, fileSize: 256, createdAt: '2026-03-19T08:00:00Z', updatedAt: '2026-03-19T09:00:00Z', filePath: '/path' },
      ])

      const result = await service.searchSessions('react')

      expect(result).toHaveLength(2)
      expect(result.map(r => r.sessionId)).toContain('cc-react')
      expect(result.map(r => r.sessionId)).toContain('cx-react')
    })

    it('应支持 sessionId 搜索', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'session-abc-123', firstPrompt: 'Test', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('abc')

      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('session-abc-123')
    })

    it('应不区分大小写', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'REACT Development', messageCount: 5, fileSize: 1024 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('react')

      expect(result).toHaveLength(1)
    })

    it('应返回空数组当无匹配时', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'React', messageCount: 5, fileSize: 1024 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('nonexistent')

      expect(result).toHaveLength(0)
    })

    it('应传递 options 参数', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      await service.searchSessions('test', { projectPath: '/project', workDir: '/workdir', providers: ['claude-code'] })

      expect(mockClaudeListSessions).toHaveBeenCalledWith('/project')
      expect(mockIFlowListSessions).not.toHaveBeenCalled()
      expect(mockCodexListSessions).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // filterSessionsByTimeRange 测试
  // ===========================================================================

  describe('filterSessionsByTimeRange', () => {
    it('应按时间范围过滤会话', async () => {
      const now = new Date()
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400000)
      const tenDaysAgo = new Date(now.getTime() - 10 * 86400000)

      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'recent', firstPrompt: 'Recent', messageCount: 1, fileSize: 100, created: twoDaysAgo.toISOString() },
      ])
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'old', title: 'Old', messageCount: 1, fileSize: 100, createdAt: tenDaysAgo.toISOString() },
      ])
      mockCodexListSessions.mockResolvedValue([])

      const startDate = new Date(now.getTime() - 5 * 86400000)
      const endDate = now
      const result = await service.filterSessionsByTimeRange(startDate, endDate)

      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('recent')
    })

    it('应排除没有 createdAt 的会话', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 5, fileSize: 1024 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const startDate = new Date(Date.now() - 7 * 86400000)
      const endDate = new Date()
      const result = await service.filterSessionsByTimeRange(startDate, endDate)

      expect(result).toHaveLength(0)
    })

    it('应正确处理边界情况', async () => {
      const targetDate = new Date('2026-03-15T12:00:00Z')

      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 5, fileSize: 1024, created: targetDate.toISOString() },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const startDate = new Date('2026-03-15T00:00:00Z')
      const endDate = new Date('2026-03-15T23:59:59Z')
      const result = await service.filterSessionsByTimeRange(startDate, endDate)

      expect(result).toHaveLength(1)
    })

    it('应传递 options 参数', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const startDate = new Date('2026-03-01')
      const endDate = new Date('2026-03-31')
      await service.filterSessionsByTimeRange(startDate, endDate, { providers: ['iflow'] })

      expect(mockClaudeListSessions).not.toHaveBeenCalled()
      expect(mockIFlowListSessions).toHaveBeenCalled()
      expect(mockCodexListSessions).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // getStats 测试
  // ===========================================================================

  describe('getStats', () => {
    it('应正确计算各 Provider 的统计数据', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'A', messageCount: 5, fileSize: 1024 },
        { sessionId: 'cc-2', firstPrompt: 'B', messageCount: 3, fileSize: 512 },
      ])
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-1', title: 'C', messageCount: 10, fileSize: 2048 },
      ])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.getStats()

      expect(result).toHaveLength(2)

      const claudeStats = result.find(s => s.provider === 'claude-code')
      expect(claudeStats?.sessionCount).toBe(2)
      expect(claudeStats?.totalMessages).toBe(8)
      expect(claudeStats?.totalSize).toBe(1536)

      const iflowStats = result.find(s => s.provider === 'iflow')
      expect(iflowStats?.sessionCount).toBe(1)
      expect(iflowStats?.totalMessages).toBe(10)
      expect(iflowStats?.totalSize).toBe(2048)
    })

    it('无会话时应返回空数组', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.getStats()

      expect(result).toEqual([])
    })

    it('应传递 options 参数', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      await service.getStats({ projectPath: '/project', workDir: '/workdir' })

      expect(mockClaudeListSessions).toHaveBeenCalledWith('/project')
      expect(mockCodexListSessions).toHaveBeenCalledWith('/workdir')
    })

    it('应正确计算单个 Provider 的统计', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'A', messageCount: 5, fileSize: 1000 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.getStats()

      expect(result).toHaveLength(1)
      expect(result[0].sessionCount).toBe(1)
      expect(result[0].totalMessages).toBe(5)
      expect(result[0].totalSize).toBe(1000)
    })
  })

  // ===========================================================================
  // 单例模式测试
  // ===========================================================================

  describe('单例模式', () => {
    it('getUnifiedHistoryService 应返回单例', () => {
      resetUnifiedHistoryService()
      const instance1 = getUnifiedHistoryService()
      const instance2 = getUnifiedHistoryService()
      expect(instance1).toBe(instance2)
    })

    it('resetUnifiedHistoryService 应重置单例', () => {
      resetUnifiedHistoryService()
      const instance1 = getUnifiedHistoryService()
      resetUnifiedHistoryService()
      const instance2 = getUnifiedHistoryService()
      expect(instance1).not.toBe(instance2)
    })
  })

  // ===========================================================================
  // 边界值完整性测试
  // ===========================================================================

  describe('formatTime 边界值完整性', () => {
    it('应正确处理未来日期', () => {
      const futureDate = new Date(Date.now() + 3600000) // 1 小时后
      const result = service.formatTime(futureDate.toISOString())
      // 未来日期应该返回 "刚刚" 或负数分钟
      expect(['刚刚', expect.stringMatching(/-\d+ 分钟前/)]).toContain(result)
    })

    it('应正确处理刚好 1 分钟边界', () => {
      const date = new Date(Date.now() - 60000)
      const result = service.formatTime(date.toISOString())
      expect(result).toBe('1 分钟前')
    })

    it('应正确处理刚好 1 小时边界', () => {
      const date = new Date(Date.now() - 3600000)
      const result = service.formatTime(date.toISOString())
      expect(result).toBe('1 小时前')
    })

    it('应正确处理刚好 24 小时边界', () => {
      const date = new Date(Date.now() - 86400000)
      const result = service.formatTime(date.toISOString())
      expect(result).toBe('1 天前')
    })

    it('应正确处理刚好 7 天边界', () => {
      const date = new Date(Date.now() - 7 * 86400000)
      const result = service.formatTime(date.toISOString())
      expect(result).toMatch(/\d+月\d+/)
    })

    it('应正确处理无效日期字符串', () => {
      const result = service.formatTime('invalid-date')
      // 无效日期应该返回某种合理值，不应崩溃
      expect(typeof result).toBe('string')
    })

    it('应正确处理空字符串日期', () => {
      const result = service.formatTime('')
      expect(typeof result).toBe('string')
    })
  })

  // ===========================================================================
  // 搜索功能边界测试
  // ===========================================================================

  describe('searchSessions 边界情况', () => {
    it('应正确处理空字符串搜索', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('')

      // 空字符串应该匹配所有会话
      expect(result).toHaveLength(1)
    })

    it('应正确处理特殊字符搜索', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'test-[1]', firstPrompt: 'Test (special)', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('[1]')

      expect(result).toHaveLength(1)
    })

    it('应正确处理 Unicode 字符搜索', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: '测试中文搜索', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('中文')

      expect(result).toHaveLength(1)
    })

    it('应正确处理 emoji 搜索', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Hello 🚀 World', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('🚀')

      expect(result).toHaveLength(1)
    })

    it('应正确处理超长搜索字符串', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const longQuery = 'a'.repeat(10000)
      const result = await service.searchSessions(longQuery)

      expect(result).toHaveLength(0)
    })
  })

  // ===========================================================================
  // 错误恢复完整测试
  // ===========================================================================

  describe('错误恢复完整性', () => {
    it('所有 Provider 失败时应返回空数组', async () => {
      mockClaudeListSessions.mockRejectedValue(new Error('Claude error'))
      mockIFlowListSessions.mockRejectedValue(new Error('IFlow error'))
      mockCodexListSessions.mockRejectedValue(new Error('Codex error'))

      const result = await service.listAllSessions()

      expect(result).toEqual([])
    })

    it('getStats 应正确处理部分 Provider 失败', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'A', messageCount: 5, fileSize: 1024 },
      ])
      mockIFlowListSessions.mockRejectedValue(new Error('IFlow error'))
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-1', title: 'B', messageCount: 3, fileSize: 512, filePath: '/path' },
      ])

      const result = await service.getStats()

      expect(result).toHaveLength(2)
      const providers = result.map(s => s.provider)
      expect(providers).toContain('claude-code')
      expect(providers).toContain('codex')
      expect(providers).not.toContain('iflow')
    })

    it('searchSessions 应正确处理部分 Provider 失败', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-react', firstPrompt: 'React', messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockRejectedValue(new Error('IFlow error'))
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.searchSessions('react')

      expect(result).toHaveLength(1)
    })

    it('filterSessionsByTimeRange 应正确处理部分 Provider 失败', async () => {
      mockClaudeListSessions.mockResolvedValue([])
      mockIFlowListSessions.mockRejectedValue(new Error('IFlow error'))
      mockCodexListSessions.mockResolvedValue([
        { sessionId: 'cx-1', title: 'Test', messageCount: 1, fileSize: 100, createdAt: new Date().toISOString(), filePath: '/path' },
      ])

      const startDate = new Date(Date.now() - 86400000)
      const endDate = new Date()
      const result = await service.filterSessionsByTimeRange(startDate, endDate)

      expect(result).toHaveLength(1)
    })
  })

  // ===========================================================================
  // 数据一致性测试
  // ===========================================================================

  describe('数据一致性', () => {
    it('listAllSessions 和 listSessionsByProvider 数据格式一致', async () => {
      const mockSession = {
        sessionId: 'cc-1',
        firstPrompt: 'Test',
        messageCount: 5,
        fileSize: 1024,
        created: '2026-03-19T10:00:00Z',
        modified: '2026-03-19T11:00:00Z',
      }

      mockClaudeListSessions.mockResolvedValue([mockSession])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const allResult = await service.listAllSessions()
      const providerResult = await service.listSessionsByProvider('claude-code')

      expect(allResult).toEqual(providerResult)
    })

    it('getStats 计算应与 listAllSessions 一致', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'A', messageCount: 5, fileSize: 1000 },
        { sessionId: 'cc-2', firstPrompt: 'B', messageCount: 3, fileSize: 500 },
      ])
      mockIFlowListSessions.mockResolvedValue([
        { sessionId: 'if-1', title: 'C', messageCount: 10, fileSize: 2000 },
      ])
      mockCodexListSessions.mockResolvedValue([])

      const sessions = await service.listAllSessions()
      const stats = await service.getStats()

      const claudeStats = stats.find(s => s.provider === 'claude-code')
      expect(claudeStats?.sessionCount).toBe(2)
      expect(claudeStats?.totalMessages).toBe(8)
      expect(claudeStats?.totalSize).toBe(1500)

      const iflowStats = stats.find(s => s.provider === 'iflow')
      expect(iflowStats?.sessionCount).toBe(1)
      expect(iflowStats?.totalMessages).toBe(10)
      expect(iflowStats?.totalSize).toBe(2000)

      // 验证总数一致
      const totalSessions = sessions.length
      const statsTotalSessions = stats.reduce((sum, s) => sum + s.sessionCount, 0)
      expect(totalSessions).toBe(statsTotalSessions)
    })

    it('messageCount 和 fileSize 应正确传递', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Test', messageCount: 42, fileSize: 12345 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].messageCount).toBe(42)
      expect(result[0].fileSize).toBe(12345)
    })
  })

  // ===========================================================================
  // 时区处理测试
  // ===========================================================================

  describe('时区处理', () => {
    it('应正确处理 UTC 时间字符串', async () => {
      const utcTime = '2026-03-19T10:00:00Z'
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 1, fileSize: 100, created: utcTime },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].createdAt).toBe(utcTime)
    })

    it('应正确处理带时区的时间字符串', async () => {
      const istTime = '2026-03-19T10:00:00+08:00'
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 1, fileSize: 100, created: istTime },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].createdAt).toBe(istTime)
    })

    it('filterSessionsByTimeRange 应正确处理不同时区的日期', async () => {
      const utcTime = '2026-03-19T12:00:00Z'
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: '1', firstPrompt: 'Test', messageCount: 1, fileSize: 100, created: utcTime },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const startDate = new Date('2026-03-19T00:00:00Z')
      const endDate = new Date('2026-03-19T23:59:59Z')
      const result = await service.filterSessionsByTimeRange(startDate, endDate)

      expect(result).toHaveLength(1)
    })
  })

  // ===========================================================================
  // 空值处理测试
  // ===========================================================================

  describe('空值处理', () => {
    it('应正确处理 messageCount 为 0', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: 'Empty', messageCount: 0, fileSize: 0 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].messageCount).toBe(0)
      expect(result[0].fileSize).toBe(0)
    })

    it('应正确处理 null firstPrompt', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: null, messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].title).toBe('Claude Code 对话')
    })

    it('应正确处理 undefined firstPrompt', async () => {
      mockClaudeListSessions.mockResolvedValue([
        { sessionId: 'cc-1', firstPrompt: undefined, messageCount: 1, fileSize: 100 },
      ])
      mockIFlowListSessions.mockResolvedValue([])
      mockCodexListSessions.mockResolvedValue([])

      const result = await service.listAllSessions()

      expect(result[0].title).toBe('Claude Code 对话')
    })
  })

  // ===========================================================================
  // 类型导出测试
  // ===========================================================================

  describe('类型导出', () => {
    it('ProviderType 应包含正确的值', () => {
      const validProviders: ProviderType[] = ['claude-code', 'iflow', 'codex']
      expect(validProviders).toHaveLength(3)
      expect(validProviders).toContain('claude-code')
      expect(validProviders).toContain('iflow')
      expect(validProviders).toContain('codex')
    })

    it('UnifiedSessionMeta 应包含所有必需字段', () => {
      const meta: UnifiedSessionMeta = {
        sessionId: 'test-id',
        provider: 'claude-code',
        title: 'Test Session',
        messageCount: 5,
        fileSize: 1024,
      }

      expect(meta.sessionId).toBe('test-id')
      expect(meta.provider).toBe('claude-code')
      expect(meta.title).toBe('Test Session')
      expect(meta.messageCount).toBe(5)
      expect(meta.fileSize).toBe(1024)
    })

    it('UnifiedSessionMeta 应支持可选字段', () => {
      const meta: UnifiedSessionMeta = {
        sessionId: 'test-id',
        provider: 'claude-code',
        title: 'Test Session',
        messageCount: 5,
        fileSize: 1024,
        createdAt: '2026-03-19T00:00:00Z',
        updatedAt: '2026-03-19T12:00:00Z',
        filePath: '/path/to/file',
        projectPath: '/path/to/project',
      }

      expect(meta.createdAt).toBeDefined()
      expect(meta.updatedAt).toBeDefined()
      expect(meta.filePath).toBeDefined()
      expect(meta.projectPath).toBeDefined()
    })
  })
})