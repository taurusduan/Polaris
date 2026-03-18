/**
 * 窗口设置 Tab
 * 包含窗口置顶、透明度等设置
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import type { Config, WindowSettings } from '../../../types';
import { createLogger } from '../../../utils/logger';

const log = createLogger('WindowTab');

interface WindowTabProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  loading: boolean;
}

export function WindowTab({ config, onConfigChange, loading }: WindowTabProps) {
  const { t } = useTranslation('settings');
  const [windowLoading, setWindowLoading] = useState(false);

  // 获取窗口设置
  const windowSettings: WindowSettings = config.window || {
    alwaysOnTop: false,
    opacity: 1.0,
  };

  // 初始化时同步窗口状态
  useEffect(() => {
    const syncWindowState = async () => {
      try {
        const isOnTop = await invoke<boolean>('is_always_on_top');
        if (isOnTop !== windowSettings.alwaysOnTop) {
          onConfigChange({
            ...config,
            window: { ...windowSettings, alwaysOnTop: isOnTop },
          });
        }
      } catch (error) {
        log.warn('Failed to sync window state:', { error: String(error) });
      }
    };
    syncWindowState();
  }, []);

  // 切换置顶状态
  const handleToggleAlwaysOnTop = async (enabled: boolean) => {
    setWindowLoading(true);
    try {
      await invoke('set_always_on_top', { alwaysOnTop: enabled });
      onConfigChange({
        ...config,
        window: { ...windowSettings, alwaysOnTop: enabled },
      });
      log.info(`Window always on top set to: ${enabled}`);
    } catch (error) {
      log.error('Failed to set always on top:', error instanceof Error ? error : new Error(String(error)));
    } finally {
      setWindowLoading(false);
    }
  };

  // 处理透明度变化
  const handleOpacityChange = (value: number) => {
    onConfigChange({
      ...config,
      window: { ...windowSettings, opacity: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* 窗口置顶设置 */}
      <div className="p-4 bg-surface rounded-lg border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {t('window.title')}
        </h3>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-text-primary">
              {t('window.alwaysOnTop')}
            </div>
            <div className="text-xs text-text-secondary">
              {t('window.alwaysOnTopHint')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleAlwaysOnTop(!windowSettings.alwaysOnTop)}
            disabled={loading || windowLoading}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              windowSettings.alwaysOnTop ? 'bg-primary' : 'bg-border'
            } ${loading || windowLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                windowSettings.alwaysOnTop ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* 透明度滑块 */}
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-4">
            <div className="text-sm text-text-primary">{t('window.opacity')}</div>
            <div className="text-xs text-text-secondary">{t('window.opacityHint')}</div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              value={windowSettings.opacity}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
              disabled={loading}
              className="w-24 h-1.5 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />
            <span className="text-xs text-text-secondary w-10 text-right">
              {Math.round(windowSettings.opacity * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
