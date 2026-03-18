/**
 * IntegrationStore 单元测试
 *
 * 测试集成状态管理的核心功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initIntegration,
  onIntegrationMessage,
  getAllIntegrationStatus,
  getIntegrationStatus,
  startIntegration,
  stopIntegration,
} from '../services/tauri';

// Mock tauri services
vi.mock('../services/tauri', () => ({
  initIntegration: vi.fn(),
  onIntegrationMessage: vi.fn(),
  getAllIntegrationStatus: vi.fn(),
  getIntegrationStatus: vi.fn(),
  startIntegration: vi.fn(),
  stopIntegration: vi.fn(),
  sendIntegrationMessage: vi.fn(),
  getIntegrationSessions: vi.fn(),
  listIntegrationInstances: vi.fn(),
  listIntegrationInstancesByPlatform: vi.fn(),
  addIntegrationInstance: vi.fn(),
  updateIntegrationInstance: vi.fn(),
  removeIntegrationInstance: vi.fn(),
  switchIntegrationInstance: vi.fn(),
  disconnectIntegrationInstance: vi.fn(),
}));

import { useIntegrationStore } from './integrationStore';

describe('integrationStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useIntegrationStore.setState({
      platforms: {} as Record<string, unknown>,
      messages: [],
      sessions: [],
      initialized: false,
      loading: false,
      error: null,
      _qqbotConfig: null,
      _unlisten: null,
      instances: [],
      activeInstances: {} as Record<string, string | null>,
    });

    // 设置默认 mock 返回值
    vi.mocked(initIntegration).mockResolvedValue(undefined);
    vi.mocked(onIntegrationMessage).mockResolvedValue(vi.fn());
    vi.mocked(getAllIntegrationStatus).mockResolvedValue({
      qqbot: { connected: false },
    });
    vi.mocked(getIntegrationStatus).mockResolvedValue({ connected: true });
    vi.mocked(startIntegration).mockResolvedValue(undefined);
    vi.mocked(stopIntegration).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('应成功初始化并设置 initialized 为 true', async () => {
      const { initialize } = useIntegrationStore.getState();

      await initialize(null);

      expect(useIntegrationStore.getState().initialized).toBe(true);
      expect(useIntegrationStore.getState().loading).toBe(false);
      expect(useIntegrationStore.getState().error).toBeNull();
    });

    it('应存储 unlisten 函数到 store 内部', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(onIntegrationMessage).mockResolvedValueOnce(mockUnlisten);

      const { initialize } = useIntegrationStore.getState();
      await initialize(null);

      expect(useIntegrationStore.getState()._unlisten).toBe(mockUnlisten);
    });

    it('重复初始化应跳过', async () => {
      const { initialize } = useIntegrationStore.getState();

      await initialize(null);
      expect(useIntegrationStore.getState().initialized).toBe(true);

      // 重置 mock 计数
      vi.mocked(initIntegration).mockClear();

      await initialize(null);

      // 验证 initIntegration 没有被再次调用
      expect(initIntegration).toHaveBeenCalledTimes(0);
    });
  });

  describe('cleanup', () => {
    it('应调用 unlisten 函数并重置状态', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(onIntegrationMessage).mockResolvedValueOnce(mockUnlisten);

      const { initialize } = useIntegrationStore.getState();
      await initialize(null);

      expect(useIntegrationStore.getState()._unlisten).toBe(mockUnlisten);

      const { cleanup } = useIntegrationStore.getState();
      cleanup();

      expect(mockUnlisten).toHaveBeenCalled();
      expect(useIntegrationStore.getState()._unlisten).toBeNull();
      expect(useIntegrationStore.getState().initialized).toBe(false);
    });

    it('无 unlisten 时 cleanup 应安全处理', () => {
      const { cleanup } = useIntegrationStore.getState();

      // 不应抛出错误
      expect(() => cleanup()).not.toThrow();
      expect(useIntegrationStore.getState()._unlisten).toBeNull();
    });

    it('多次调用 cleanup 应幂等', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(onIntegrationMessage).mockResolvedValueOnce(mockUnlisten);

      const { initialize } = useIntegrationStore.getState();
      await initialize(null);

      const { cleanup } = useIntegrationStore.getState();
      cleanup();
      cleanup();
      cleanup();

      // unlisten 只应被调用一次
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe('_unlisten 存储', () => {
    it('不应使用 window 对象存储 unlisten', async () => {
      // 清除可能存在的 window.__integrationUnlisten
      delete (window as unknown as { __integrationUnlisten?: () => void }).__integrationUnlisten;

      const { initialize } = useIntegrationStore.getState();
      await initialize(null);

      // window.__integrationUnlisten 不应被设置
      expect((window as unknown as { __integrationUnlisten?: () => void }).__integrationUnlisten).toBeUndefined();

      // 应存储在 store 内部
      expect(useIntegrationStore.getState()._unlisten).toBeDefined();
    });
  });

  describe('startPlatform', () => {
    it('未初始化时应先初始化', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(onIntegrationMessage).mockResolvedValueOnce(mockUnlisten);

      const { startPlatform } = useIntegrationStore.getState();

      await startPlatform('qqbot', { appId: 'test', appSecret: 'test' });

      expect(useIntegrationStore.getState().initialized).toBe(true);
      expect(useIntegrationStore.getState()._unlisten).toBe(mockUnlisten);
    });

    it('已初始化时不应重复设置 unlisten', async () => {
      const mockUnlisten1 = vi.fn();
      vi.mocked(onIntegrationMessage).mockResolvedValueOnce(mockUnlisten1);

      const { initialize } = useIntegrationStore.getState();
      await initialize(null);

      expect(useIntegrationStore.getState()._unlisten).toBe(mockUnlisten1);

      // 设置新的返回值
      const mockUnlisten2 = vi.fn();
      vi.mocked(onIntegrationMessage).mockResolvedValueOnce(mockUnlisten2);

      // 第二次 startPlatform - 已初始化，不应设置新的 unlisten
      const { startPlatform } = useIntegrationStore.getState();
      await startPlatform('qqbot', { appId: 'test', appSecret: 'test' });

      // unlisten 应保持为第一个
      expect(useIntegrationStore.getState()._unlisten).toBe(mockUnlisten1);
      // onIntegrationMessage 不应被调用（因为已初始化）
      expect(onIntegrationMessage).toHaveBeenCalledTimes(1); // 只有 initialize 调用了一次
    });
  });

  describe('消息管理', () => {
    it('_addMessage 应添加消息到列表', () => {
      const { _addMessage } = useIntegrationStore.getState();

      _addMessage({
        platform: 'qqbot',
        type: 'text',
        content: 'Hello',
        timestamp: Date.now(),
      });

      expect(useIntegrationStore.getState().messages).toHaveLength(1);
      expect(useIntegrationStore.getState().messages[0].content).toBe('Hello');
    });

    it('消息列表应限制为最近 500 条', () => {
      const { _addMessage } = useIntegrationStore.getState();

      // 添加 501 条消息
      for (let i = 0; i < 501; i++) {
        _addMessage({
          platform: 'qqbot',
          type: 'text',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      expect(useIntegrationStore.getState().messages).toHaveLength(500);
      // 最早的消息应被移除
      expect(useIntegrationStore.getState().messages[0].content).toBe('Message 1');
    });

    it('clearMessages 应清空消息列表', () => {
      const { _addMessage, clearMessages } = useIntegrationStore.getState();

      _addMessage({
        platform: 'qqbot',
        type: 'text',
        content: 'Hello',
        timestamp: Date.now(),
      });

      expect(useIntegrationStore.getState().messages).toHaveLength(1);

      clearMessages();

      expect(useIntegrationStore.getState().messages).toHaveLength(0);
    });
  });

  describe('错误处理', () => {
    it('初始化失败应设置错误信息', async () => {
      vi.mocked(initIntegration).mockRejectedValueOnce(new Error('初始化失败'));

      const { initialize } = useIntegrationStore.getState();
      await initialize(null);

      expect(useIntegrationStore.getState().error).toBe('初始化失败');
      expect(useIntegrationStore.getState().initialized).toBe(false);
    });
  });
});
