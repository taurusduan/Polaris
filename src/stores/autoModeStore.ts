/**
 * Auto-Mode 状态管理
 *
 * 管理自动模式配置的状态
 */

import { create } from 'zustand';
import type { AutoModeConfig, AutoModeDefaults } from '../types/autoMode';
import * as autoModeService from '../services/autoModeService';
import { createLogger } from '../utils/logger';

const log = createLogger('AutoModeStore');

interface AutoModeState {
  /** 当前配置 */
  config: AutoModeConfig | null;
  /** 默认配置 */
  defaults: AutoModeDefaults | null;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 搜索关键词 */
  searchQuery: string;

  // Actions

  /** 获取配置 */
  fetchConfig: () => Promise<void>;
  /** 获取默认配置 */
  fetchDefaults: () => Promise<void>;
  /** 刷新所有数据 */
  refreshAll: () => Promise<void>;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 清除错误 */
  clearError: () => void;
}

export const useAutoModeStore = create<AutoModeState>((set, get) => ({
  config: null,
  defaults: null,
  loading: false,
  error: null,
  searchQuery: '',

  fetchConfig: async () => {
    try {
      set({ loading: true, error: null });
      const config = await autoModeService.getAutoModeConfig();
      set({ config, loading: false });
    } catch (err) {
      log.error('获取自动模式配置失败', err instanceof Error ? err : new Error(String(err)));
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  fetchDefaults: async () => {
    try {
      set({ loading: true, error: null });
      const defaults = await autoModeService.getAutoModeDefaults();
      set({ defaults, loading: false });
    } catch (err) {
      log.error('获取默认配置失败', err instanceof Error ? err : new Error(String(err)));
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  refreshAll: async () => {
    const { fetchConfig, fetchDefaults } = get();
    await Promise.all([fetchConfig(), fetchDefaults()]);
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  clearError: () => {
    set({ error: null });
  },
}));
