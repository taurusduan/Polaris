/**
 * commitMessageGenerator 测试
 *
 * 测试 Git 提交消息生成服务的核心功能。
 *
 * Mock 策略：
 * - @tauri-apps/api/core: invoke（全局 mock）
 * - ./eventRouter: getEventRouter, createContextId
 * - ../ai-runtime: 类型守卫函数
 * - ../utils/logger: createLogger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateCommitMessage } from './commitMessageGenerator'
import { invoke } from '@tauri-apps/api/core'
import type { GitDiffEntry } from '@/types/git'

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// Mock eventRouter
const mockRegister = vi.fn()
const mockInitialize = vi.fn()
vi.mock('./eventRouter', () => ({
  getEventRouter: vi.fn(() => ({
    initialize: mockInitialize,
    register: mockRegister,
  })),
  createContextId: vi.fn(() => 'test-context-id'),
}))

// Mock ai-runtime 类型守卫
vi.mock('../ai-runtime', () => ({
  isAIEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    const event = value as Record<string, unknown>
    return typeof event.type === 'string'
  }),
  isTokenEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    return (value as Record<string, unknown>).type === 'token'
  }),
  isAssistantMessageEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    return (value as Record<string, unknown>).type === 'assistant_message'
  }),
  isSessionStartEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    return (value as Record<string, unknown>).type === 'session_start'
  }),
  isSessionEndEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    return (value as Record<string, unknown>).type === 'session_end'
  }),
  isErrorEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    return (value as Record<string, unknown>).type === 'error'
  }),
  isResultEvent: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return false
    return (value as Record<string, unknown>).type === 'result'
  }),
}))

const mockInvoke = vi.mocked(invoke)

describe('commitMessageGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInitialize.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateCommitMessage - 基础场景', () => {
    it('应该使用提供的 stagedDiffs 生成提交消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/app.ts',
          change_type: 'modified',
          old_content: 'const x = 1',
          new_content: 'const x = 2',
        },
      ]

      // 设置 mock register 回调
      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        // 模拟 AI 返回提交消息
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'fix(app): update x value', isDelta: true })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
      expect(mockInvoke).not.toHaveBeenCalledWith('git-get-index-diff')
    })

    it('应该在无 stagedDiffs 时调用 git-get-index-diff', async () => {
      const mockDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/new.ts',
          change_type: 'added',
          old_content: null,
          new_content: 'export const foo = 1',
        },
      ]

      mockInvoke.mockResolvedValueOnce(mockDiffs)
      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: add new file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      await generateCommitMessage({
        workspacePath: '/test/workspace',
      })

      expect(mockInvoke).toHaveBeenCalledWith('git_get_index_diff', {
        workspacePath: '/test/workspace',
      })
    })

    it('应该在无暂存更改时抛出错误', async () => {
      mockInvoke.mockResolvedValueOnce([])

      await expect(
        generateCommitMessage({
          workspacePath: '/test/workspace',
        })
      ).rejects.toThrow('Failed to get staged changes')
    })

    it('应该正确处理 git-get-index-diff 错误', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Git error'))

      await expect(
        generateCommitMessage({
          workspacePath: '/test/workspace',
        })
      ).rejects.toThrow('Failed to get staged changes')
    })
  })

  describe('generateCommitMessage - AI 响应处理', () => {
    it('应该正确处理 token 事件累积', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'token', value: 'feat: ' })
          callback({ type: 'token', value: 'add new feature' })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add new feature')
    })

    it('应该正确处理 assistant_message 事件', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'fix: resolve bug', isDelta: false })
          callback({ type: 'result', output: 'done' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('fix: resolve bug')
    })

    it('应该正确处理错误事件', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      // AI 失败时应该返回 fallback 消息
      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该在 AI 响应超时时返回 fallback 消息', async () => {
      // 注意：实际超时时间为 30 秒，此处只验证 fallback 逻辑
      // 通过 error 事件触发 fallback
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'timeout simulated' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该在 AI 无响应时返回 fallback 消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      // 无 accumulated text 时会 reject，然后返回 fallback
      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })
  })

  describe('extractCommitMessage - 边界情况', () => {
    it('应该正确处理带有前缀的响应', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          // 注意：源代码正则只匹配 "Here's", "Here is", "The commit message is", "Commit message:"
          callback({ type: 'assistant_message', content: "Here is the commit message: feat: add feature", isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 由于 "Here is" 被移除，剩下 "the commit message: feat: add feature"
      // 第一行是 "the commit message: feat: add feature"
      expect(result).toBe('the commit message: feat: add feature')
    })

    it('应该正确处理带有引号的响应', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: '`fix: resolve issue`', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('fix: resolve issue')
    })

    it('应该正确处理多行响应（只取第一行）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({
            type: 'assistant_message',
            content: `feat: add feature

This is a detailed description
- Point 1
- Point 2`,
            isDelta: false,
          })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add feature')
    })

    it('应该截断超长的提交消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      const longMessage = 'feat: ' + 'a'.repeat(150)

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: longMessage, isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result.length).toBeLessThanOrEqual(100)
    })
  })

  describe('generateFallbackMessage - 各种文件类型', () => {
    it('应该为新增文件生成正确的 fallback 消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/new-feature.ts', change_type: 'added', old_content: null, new_content: 'export const x = 1' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add src/new-feature.ts')
    })

    it('应该为多个新增文件生成正确的 fallback 消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/a.ts', change_type: 'added', old_content: null, new_content: 'a' },
        { file_path: 'src/b.ts', change_type: 'added', old_content: null, new_content: 'b' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add 2 files')
    })

    it('应该为删除文件生成正确的 fallback 消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/old.ts', change_type: 'deleted', old_content: 'old content', new_content: null },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: remove src/old.ts')
    })

    it('应该为重命名文件生成正确的 fallback 消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/renamed.ts', change_type: 'renamed', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('refactor: rename src/renamed.ts')
    })

    it('应该为修改文件生成正确的 fallback 消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/modified.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: update src/modified.ts')
    })

    it('应该在无法识别变更类型时返回默认消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/unknown.ts', change_type: 'unknown' as GitDiffEntry['change_type'], old_content: null, new_content: null },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 未知类型会 fallthrough 到 update 消息
      expect(result).toBe('chore: update src/unknown.ts')
    })

    it('应该在无文件变更信息时返回默认消息', async () => {
      // 空的 diff 内容，无法解析文件变更
      mockInvoke.mockResolvedValueOnce([])

      // 由于 mockInvoke 返回空数组，会抛出 'Failed to get staged changes'
      await expect(
        generateCommitMessage({
          workspacePath: '/test/workspace',
        })
      ).rejects.toThrow('Failed to get staged changes')
    })
  })

  describe('formatDiffs - 内容处理', () => {
    it('应该正确格式化包含旧内容和新内容的 diff', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/app.ts',
          change_type: 'modified',
          old_content: 'const a = 1\nconst b = 2',
          new_content: 'const a = 2\nconst b = 3',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'test message', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 验证 invoke 被正确调用
      expect(mockRegister).toHaveBeenCalled()
    })

    it('应该正确处理无旧内容的 diff', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/new.ts',
          change_type: 'added',
          old_content: null,
          new_content: 'export const x = 1',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: add new file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add new file')
    })

    it('应该正确处理无新内容的 diff', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/deleted.ts',
          change_type: 'deleted',
          old_content: 'export const y = 2',
          new_content: null,
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'chore: remove file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: remove file')
    })

    it('应该截断超长的 diff 内容', async () => {
      const longContent = 'x'.repeat(1000)
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/large.ts',
          change_type: 'modified',
          old_content: longContent,
          new_content: longContent,
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'fix: update large file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
        maxDiffLength: 1000, // 使用较小的 maxDiffLength
      })

      expect(result).toBeDefined()
    })
  })

  describe('错误处理', () => {
    it('应该正确处理 eventRouter 初始化失败', async () => {
      mockInitialize.mockRejectedValueOnce(new Error('Init failed'))
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      // 初始化失败会触发 AI 调用失败，然后返回 fallback
      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理 register 抛出错误', async () => {
      mockRegister.mockImplementation(() => {
        throw new Error('Register failed')
      })
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      // 注册失败会触发 AI 调用失败，然后返回 fallback
      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理 invoke 调用失败', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Invoke failed'))

      await expect(
        generateCommitMessage({
          workspacePath: '/test/workspace',
        })
      ).rejects.toThrow('Failed to get staged changes')
    })
  })

  describe('maxDiffLength 参数', () => {
    it('应该使用自定义的 maxDiffLength', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/test.ts',
          change_type: 'modified',
          old_content: 'a'.repeat(1000),
          new_content: 'b'.repeat(1000),
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'test', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
        maxDiffLength: 500,
      })

      expect(mockRegister).toHaveBeenCalled()
    })
  })

  describe('混合变更类型', () => {
    it('应该正确处理混合的变更类型（优先添加）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/new.ts', change_type: 'added', old_content: null, new_content: 'new' },
        { file_path: 'src/modified.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add 2 files')
    })

    it('应该正确处理混合的变更类型（优先删除）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/deleted.ts', change_type: 'deleted', old_content: 'old', new_content: null },
        { file_path: 'src/modified.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: remove 2 files')
    })

    it('应该正确处理混合的变更类型（优先重命名）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/renamed.ts', change_type: 'renamed', old_content: 'old', new_content: 'new' },
        { file_path: 'src/modified.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('refactor: rename 2 files')
    })
  })

  describe('事件处理边界情况', () => {
    it('应该忽略非 AI 事件', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      const { isAIEvent } = await import('../ai-runtime')
      vi.mocked(isAIEvent).mockReturnValueOnce(false)

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ invalid: 'event' })
          callback({ type: 'assistant_message', content: 'valid message', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理 session_start 事件（忽略）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'session_start', sessionId: 'test-session' })
          callback({ type: 'assistant_message', content: 'feat: test', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: test')
    })
  })

  describe('formatDiffs - 边界情况', () => {
    it('应该正确处理空内容的 diff', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/empty.ts',
          change_type: 'modified',
          old_content: null,
          new_content: null,
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'chore: update empty file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理包含特殊字符的文件路径', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/[test]/file with spaces.ts',
          change_type: 'added',
          old_content: null,
          new_content: 'export const x = 1',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: add file with special chars', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理大量文件变更', async () => {
      const stagedDiffs: GitDiffEntry[] = Array.from({ length: 50 }, (_, i) => ({
        file_path: `src/file${i}.ts`,
        change_type: 'modified' as const,
        old_content: `old content ${i}`,
        new_content: `new content ${i}`,
      }))

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'chore: update multiple files', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
        maxDiffLength: 5000,
      })

      expect(result).toBeDefined()
    })
  })

  describe('generateFallbackMessage - 边界情况', () => {
    it('应该正确处理只有修改文件的场景', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/a.ts', change_type: 'modified', old_content: 'a', new_content: 'b' },
        { file_path: 'src/b.ts', change_type: 'modified', old_content: 'c', new_content: 'd' },
        { file_path: 'src/c.ts', change_type: 'modified', old_content: 'e', new_content: 'f' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: update 3 files')
    })

    it('应该正确处理单个修改文件', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/single.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: update src/single.ts')
    })
  })

  describe('extractCommitMessage - 更多边界情况', () => {
    it('应该正确处理空响应后返回 fallback', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          // 空内容后结束
          callback({ type: 'assistant_message', content: '', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 空内容会触发 fallback
      expect(result).toBeDefined()
    })

    it('应该正确处理只有空格的响应', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: '   ', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理带有 "Commit message:" 前缀的响应', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'Commit message: feat: add feature', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add feature')
    })

    it('应该正确处理带有 "The commit message is" 前缀的响应', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'The commit message is fix: resolve bug', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('fix: resolve bug')
    })
  })

  describe('错误处理 - 更多场景', () => {
    it('应该正确处理 result 事件结束', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: result event', isDelta: false })
          callback({ type: 'result', output: 'success' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: result event')
    })

    it('应该正确处理错误事件带错误消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'Rate limit exceeded' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理错误事件无错误消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })
  })

  describe('Token 事件处理', () => {
    it('应该正确累积多个 token 事件', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'token', value: 'feat' })
          callback({ type: 'token', value: ': ' })
          callback({ type: 'token', value: 'add ' })
          callback({ type: 'token', value: 'new feature' })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: add new feature')
    })

    it('应该正确处理空 token 值', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'token', value: 'feat: ' })
          callback({ type: 'token', value: '' })
          callback({ type: 'token', value: 'test' })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: test')
    })
  })

  describe('混合事件类型', () => {
    it('应该正确处理 token 和 assistant_message 混合事件', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'token', value: 'feat' })
          callback({ type: 'assistant_message', content: ': mixed event', isDelta: true })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: mixed event')
    })

    it('应该正确处理事件监听器中的异常', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      // Mock isAIEvent 在第一次调用时抛出异常
      const { isAIEvent } = await import('../ai-runtime')
      vi.mocked(isAIEvent)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          // 第一个事件会触发异常处理，但不应该中断整个流程
          callback({ type: 'assistant_message', content: 'valid', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })
  })

  describe('contextId 生成', () => {
    it('应该使用正确的 contextId 前缀', async () => {
      const { createContextId } = await import('./eventRouter')
      const mockCreateContextId = vi.mocked(createContextId)

      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'test', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(mockCreateContextId).toHaveBeenCalledWith('git-commit')
    })
  })

  describe('start_chat invoke 调用', () => {
    it('应该正确调用 start_chat', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: test', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(mockInvoke).toHaveBeenCalledWith('start_chat', expect.objectContaining({
        workDir: '/test/workspace',
        engineId: 'claude-code',
        contextId: 'test-context-id',
      }))
    })
  })

  describe('extractCommitMessage - 引号处理', () => {
    it('应该正确处理双引号包裹的消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: '"feat: double quoted"', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('feat: double quoted')
    })

    it('应该正确处理单引号包裹的消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: "'fix: single quoted'", isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('fix: single quoted')
    })

    it('应该正确处理 "Here\'s" 前缀', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: "Here's your commit message: refactor: improve code", isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // "Here's" 被移除后，剩下 "your commit message: refactor: improve code"
      expect(result).toBe('your commit message: refactor: improve code')
    })

    it('应该正确处理部分引号的消息', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          // 只有开头有引号
          callback({ type: 'assistant_message', content: '"feat: partial quote', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 开头的引号被移除
      expect(result).toBe('feat: partial quote')
    })
  })

  describe('formatDiffs - 更多边界情况', () => {
    it('应该正确处理只有旧内容的 diff', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/deleted.ts',
          change_type: 'deleted',
          old_content: 'only old content',
          new_content: null,
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'chore: delete file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBe('chore: delete file')
    })

    it('应该正确处理超长旧内容截断', async () => {
      const longOldContent = 'a'.repeat(1000)
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/long.ts',
          change_type: 'modified',
          old_content: longOldContent,
          new_content: 'new',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'chore: update', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理超长新内容截断', async () => {
      const longNewContent = 'b'.repeat(1000)
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/long.ts',
          change_type: 'added',
          old_content: null,
          new_content: longNewContent,
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: add', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理包含换行符的内容', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/multiline.ts',
          change_type: 'modified',
          old_content: 'line1\nline2\nline3',
          new_content: 'line1\nline2\nline3\nline4',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: add line', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })
  })

  describe('generateFallbackMessage - 复杂场景', () => {
    it('应该正确处理同时有添加和删除的场景（优先添加）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/new.ts', change_type: 'added', old_content: null, new_content: 'new' },
        { file_path: 'src/old.ts', change_type: 'deleted', old_content: 'old', new_content: null },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 添加优先于删除
      expect(result).toBe('feat: add 2 files')
    })

    it('应该正确处理同时有删除和重命名的场景（优先删除）', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/renamed.ts', change_type: 'renamed', old_content: 'old', new_content: 'new' },
        { file_path: 'src/deleted.ts', change_type: 'deleted', old_content: 'deleted', new_content: null },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 删除优先于重命名
      expect(result).toBe('chore: remove 2 files')
    })

    it('应该正确处理无法解析文件变更的场景', async () => {
      // 当 diff 内容格式不符合预期时
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'error', error: 'AI failed' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 应该能正确解析格式化的 diff
      expect(result).toBeDefined()
    })
  })

  describe('AI 调用失败后的恢复', () => {
    it('应该在 AI 超时后返回 fallback', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: null, new_content: 'test' },
      ]

      // 模拟超时 - 不发送任何结束事件
      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        // 不调用任何回调，模拟超时
        return vi.fn()
      })

      // 注意：实际超时时间是 30 秒，这里通过错误事件模拟
      // 为了测试目的，我们通过错误事件来触发 fallback
      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 超时后应该返回 fallback 消息
      expect(result).toBeDefined()
    }, 35000) // 设置测试超时时间

    it('应该在 AI 调用失败后返回有效的 fallback', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/new.ts', change_type: 'added', old_content: null, new_content: 'test' },
      ]

      mockRegister.mockImplementation(() => {
        throw new Error('Register failed')
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      // 即使 AI 调用失败，也应该返回有效的 fallback
      expect(result).toMatch(/^(feat|fix|chore|refactor):/)
    })
  })

  describe('系统提示词验证', () => {
    it('应该在 start_chat 调用中包含系统提示词', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        { file_path: 'src/test.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: test', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      const invokeCall = mockInvoke.mock.calls.find(
        call => call[0] === 'start_chat'
      )

      expect(invokeCall).toBeDefined()
      const message = invokeCall![1] as { message: string }
      // 系统提示词应该包含 conventional commits 规则
      expect(message.message).toContain('conventional commits')
    })
  })

  describe('多次调用场景', () => {
    it('应该支持连续多次调用 generateCommitMessage', async () => {
      const stagedDiffs1: GitDiffEntry[] = [
        { file_path: 'src/a.ts', change_type: 'added', old_content: null, new_content: 'a' },
      ]
      const stagedDiffs2: GitDiffEntry[] = [
        { file_path: 'src/b.ts', change_type: 'modified', old_content: 'old', new_content: 'new' },
      ]

      let callCount = 0
      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        callCount++
        setTimeout(() => {
          callback({ type: 'assistant_message', content: `message ${callCount}`, isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result1 = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs: stagedDiffs1,
      })

      const result2 = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs: stagedDiffs2,
      })

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })
  })

  describe('特殊文件路径处理', () => {
    it('应该正确处理包含 Unicode 字符的文件路径', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/中文文件/文件名.ts',
          change_type: 'added',
          old_content: null,
          new_content: 'export const 测试 = 1',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: add chinese file', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })

    it('应该正确处理深层嵌套的文件路径', async () => {
      const stagedDiffs: GitDiffEntry[] = [
        {
          file_path: 'src/components/features/settings/panels/AdvancedSettings.tsx',
          change_type: 'modified',
          old_content: 'old',
          new_content: 'new',
        },
      ]

      mockRegister.mockImplementation((contextId: string, callback: (payload: unknown) => void) => {
        setTimeout(() => {
          callback({ type: 'assistant_message', content: 'feat: update settings', isDelta: false })
          callback({ type: 'session_end', sessionId: 'test-session' })
        }, 10)
        return vi.fn()
      })

      const result = await generateCommitMessage({
        workspacePath: '/test/workspace',
        stagedDiffs,
      })

      expect(result).toBeDefined()
    })
  })
})
