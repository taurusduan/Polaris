import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore, useIntegrationStore, useIntegrationStatus } from '../../stores';
import { Button, ClaudePathSelector } from '../Common';
// import { LanguageSwitcher } from '../Common';
import type { Config, EngineId, FloatingWindowMode, Language } from '../../types';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)

  // 固定的传统引擎选项
  const FIXED_ENGINE_OPTIONS: { id: EngineId; name: string; description: string }[] = [
    {
      id: 'claude-code',
      name: 'Claude Code',
      description: t('engines.claudeCode.description'),
    },
    {
      id: 'iflow',
      name: 'IFlow',
      description: t('engines.iflow.description'),
    },
    {
      id: 'codex',
      name: 'Codex',
      description: t('engines.codex.description', 'OpenAI Codex CLI'),
    },
  ];

  const FLOATING_MODE_OPTIONS: { id: FloatingWindowMode; name: string; description: string }[] = [
    {
      id: 'auto',
      name: t('floatingWindow.modes.auto'),
      description: t('floatingWindow.modes.autoDesc'),
    },
    {
      id: 'manual',
      name: t('floatingWindow.modes.manual'),
      description: t('floatingWindow.modes.manualDesc'),
    },
  ];

  const { config, loading, error, updateConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Config | null>(config);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleSave = async () => {
    if (!localConfig) return;

    try {
      await updateConfig(localConfig);
      onClose();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const handleEngineChange = (engineId: EngineId) => {
    if (!localConfig) return;
    
    // 如果选择的是 OpenAI Provider，同时设置 activeProviderId
    const isProvider = engineId.startsWith('provider-');
    setLocalConfig({ 
      ...localConfig, 
      defaultEngine: engineId,
      // 同步 activeProviderId
      activeProviderId: isProvider ? engineId : localConfig.activeProviderId,
    });
  };

  const handleLanguageChange = (language: Language) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, language });
  };

  const handleClaudeCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      claudeCode: { ...localConfig.claudeCode, cliPath: cmd }
    });
  };

  const handleIFlowCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      iflow: { ...localConfig.iflow, cliPath: cmd }
    });
  };

  const handleCodexCmdChange = (cmd: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      codex: { ...localConfig.codex, cliPath: cmd }
    });
  };

  const handleFloatingWindowEnabledChange = (enabled: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, enabled }
    });
  };

  const handleFloatingWindowModeChange = (mode: FloatingWindowMode) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, mode }
    });
  };

  const handleFloatingWindowExpandOnHoverChange = (expandOnHover: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, expandOnHover }
    });
  };

  const handleFloatingWindowCollapseDelayChange = (collapseDelay: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      floatingWindow: { ...localConfig.floatingWindow, collapseDelay }
    });
  };

  const handleAddProvider = () => {
    if (!localConfig) return;
    const newProvider: import('../../types/config').OpenAIProvider = {
      id: `provider-${Date.now()}`,
      name: 'New Provider',
      apiKey: '',
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 8192,
      enabled: true,
      supportsTools: true,
    };
    setLocalConfig({
      ...localConfig,
      openaiProviders: [...localConfig.openaiProviders, newProvider],
    });
    // 自动展开新 Provider 的编辑
    setEditingProviderId(newProvider.id);
  };

  const handleUpdateProvider = (providerId: string, updates: Partial<import('../../types/config').OpenAIProvider>) => {
    if (!localConfig) return;
    const updatedProviders = localConfig.openaiProviders.map(p =>
      p.id === providerId ? { ...p, ...updates } : p
    );
    setLocalConfig({
      ...localConfig,
      openaiProviders: updatedProviders,
    });
  };

  const handleRemoveProvider = (providerId: string) => {
    if (!localConfig) return;
    const updatedProviders = localConfig.openaiProviders.filter(p => p.id !== providerId);

    // 如果删除的是当前选中的 Provider，清空选中状态
    if (localConfig.activeProviderId === providerId) {
      setLocalConfig({
        ...localConfig,
        openaiProviders: updatedProviders,
        activeProviderId: undefined,
      });
    } else {
      setLocalConfig({
        ...localConfig,
        openaiProviders: updatedProviders,
      });
    }

    // 如果删除的是当前引擎，切换到默认引擎
    if (localConfig.defaultEngine === providerId) {
      handleEngineChange('claude-code');
    }
  };

  const handleBaiduTranslateAppIdChange = (appId: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      baiduTranslate: { ...localConfig.baiduTranslate, appId, secretKey: localConfig.baiduTranslate?.secretKey || '' }
    });
  };

  const handleBaiduTranslateSecretKeyChange = (secretKey: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      baiduTranslate: { ...localConfig.baiduTranslate, appId: localConfig.baiduTranslate?.appId || '', secretKey }
    });
  };

  // 钉钉配置处理函数
  const handleDingTalkEnabledChange = (enabled: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      dingtalk: { ...localConfig.dingtalk, enabled }
    });
  };

  const handleDingTalkAppKeyChange = (appKey: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      dingtalk: { ...localConfig.dingtalk, appKey }
    });
  };

  const handleDingTalkAppSecretChange = (appSecret: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      dingtalk: { ...localConfig.dingtalk, appSecret }
    });
  };

  const handleDingTalkTestConversationIdChange = (testConversationId: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      dingtalk: { ...localConfig.dingtalk, testConversationId }
    });
  };

  const handleDingTalkWebhookPortChange = (webhookPort: number) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      dingtalk: { ...localConfig.dingtalk, webhookPort }
    });
  };

  // QQ Bot 配置处理函数
  const handleQQBotEnabledChange = (enabled: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      qqbot: { ...localConfig.qqbot, enabled }
    });
  };

  const handleQQBotAppIdChange = (appId: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      qqbot: { ...localConfig.qqbot, appId }
    });
  };

  const handleQQBotClientSecretChange = (clientSecret: string) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      qqbot: { ...localConfig.qqbot, clientSecret }
    });
  };

  const handleQQBotSandboxChange = (sandbox: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      qqbot: { ...localConfig.qqbot, sandbox }
    });
  };

  const handleQQBotDisplayModeChange = (displayMode: import('../../types/config').IntegrationDisplayMode) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      qqbot: { ...localConfig.qqbot, displayMode }
    });
  };

  const handleQQBotAutoConnectChange = (autoConnect: boolean) => {
    if (!localConfig) return;
    setLocalConfig({
      ...localConfig,
      qqbot: { ...localConfig.qqbot, autoConnect }
    });
  };

  // QQ Bot 连接状态和控制
  const qqbotStatus = useIntegrationStatus('qqbot');
  const { startPlatform, stopPlatform, loading: integrationLoading } = useIntegrationStore();
  const isQQBotConnected = qqbotStatus?.connected ?? false;

  const handleQQBotConnect = async () => {
    if (!localConfig?.qqbot) return;
    try {
      // 传入当前配置以确保初始化
      await startPlatform('qqbot', localConfig.qqbot);
    } catch (error) {
      console.error('Failed to connect QQ Bot:', error);
    }
  };

  const handleQQBotDisconnect = async () => {
    try {
      await stopPlatform('qqbot');
    } catch (error) {
      console.error('Failed to disconnect QQ Bot:', error);
    }
  };

  if (!localConfig) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background-elevated rounded-xl p-6 max-w-md w-full mx-4 shadow-soft">
          <div className="text-center">{tCommon('status.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-soft">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('title')}</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-faint border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-3">
            {t('aiEngine')}
          </label>
          <div className="space-y-2">
            {/* 固定的传统引擎 */}
            {FIXED_ENGINE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleEngineChange(option.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  localConfig.defaultEngine === option.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary">{option.name}</div>
                    <div className="text-sm text-text-secondary mt-1">{option.description}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    localConfig.defaultEngine === option.id
                      ? 'border-primary bg-primary'
                      : 'border-border'
                  }`}>
                    {localConfig.defaultEngine === option.id && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {/* 动态的 OpenAI Providers */}
            {localConfig.openaiProviders?.map((provider) => (
              <div
                key={provider.id}
                className={`border-2 rounded-lg transition-all ${
                  localConfig.defaultEngine === provider.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface'
                }`}
              >
                {/* 引擎选择行 */}
                <div className="flex items-center justify-between p-4">
                  <button
                    type="button"
                    onClick={() => handleEngineChange(provider.id as any)}
                    className="flex-1 text-left flex items-center gap-3"
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      localConfig.defaultEngine === provider.id
                        ? 'border-primary bg-primary'
                        : 'border-border'
                    }`}>
                      {localConfig.defaultEngine === provider.id && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-text-primary flex items-center gap-2">
                        {provider.name}
                        {!provider.enabled && (
                          <span className="px-2 py-0.5 text-xs bg-disabled text-text-muted rounded">已禁用</span>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary">
                        {provider.model} • {provider.apiBase}
                      </div>
                    </div>
                  </button>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingProviderId(provider.id)}
                      className="p-2 text-text-tertiary hover:text-primary transition-colors"
                      title="配置"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRemoveProvider(provider.id)}
                      className="p-2 text-text-tertiary hover:text-error transition-colors"
                      title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 001-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 011-1V7z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 展开的配置表单 */}
                {editingProviderId === provider.id && (
                  <div className="px-4 pb-4 border-t border-border-subtle">
                    <div className="pt-4 space-y-3">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Provider 名称</label>
                        <input
                          type="text"
                          value={provider.name}
                          onChange={(e) => handleUpdateProvider(provider.id, { name: e.target.value })}
                          className="w-full px-3 py-2 rounded border border-border bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">API Key</label>
                        <input
                          type="password"
                          value={provider.apiKey}
                          onChange={(e) => handleUpdateProvider(provider.id, { apiKey: e.target.value })}
                          className="w-full px-3 py-2 rounded border border-border bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">API Base URL</label>
                        <input
                          type="text"
                          value={provider.apiBase}
                          onChange={(e) => handleUpdateProvider(provider.id, { apiBase: e.target.value })}
                          className="w-full px-3 py-2 rounded border border-border bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">模型名称</label>
                        <input
                          type="text"
                          value={provider.model}
                          onChange={(e) => handleUpdateProvider(provider.id, { model: e.target.value })}
                          className="w-full px-3 py-2 rounded border border-border bg-background"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-text-secondary mb-1">温度 (0-2)</label>
                          <input
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                            value={provider.temperature ?? 0.7}
                            onChange={(e) => handleUpdateProvider(provider.id, { temperature: parseFloat(e.target.value) || 0.7 })}
                            className="w-full px-3 py-2 rounded border border-border bg-background"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-secondary mb-1">最大 Token 数</label>
                          <input
                            type="number"
                            min="1"
                            step="1024"
                            value={provider.maxTokens ?? 8192}
                            onChange={(e) => handleUpdateProvider(provider.id, { maxTokens: parseInt(e.target.value) || 8192 })}
                            className="w-full px-3 py-2 rounded border border-border bg-background"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={provider.enabled}
                            onChange={(e) => handleUpdateProvider(provider.id, { enabled: e.target.checked })}
                            className="w-4 h-4"
                          />
                          启用此 Provider
                        </label>
                        <label className="flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={provider.supportsTools ?? true}
                            onChange={(e) => handleUpdateProvider(provider.id, { supportsTools: e.target.checked })}
                            className="w-4 h-4"
                          />
                          支持工具调用
                        </label>
                        <button
                          onClick={() => setEditingProviderId(null)}
                          className="ml-auto px-3 py-1.5 text-xs border border-border rounded hover:bg-background-hover"
                        >
                          收起
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 添加新 Provider 按钮 */}
            <button
              onClick={handleAddProvider}
              className="w-full text-left p-4 rounded-lg border-2 border-dashed border-border-subtle text-text-tertiary hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm">添加 OpenAI Provider</span>
            </button>
          </div>
        </div>

        {localConfig.defaultEngine === 'claude-code' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('claudeCode.title')}</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                {t('claudeCode.cliPath')}
              </label>
              <ClaudePathSelector
                value={localConfig.claudeCode.cliPath}
                onChange={handleClaudeCmdChange}
                engineType="claude-code"
                disabled={loading}
              />
            </div>
          </div>
        )}

        {localConfig.defaultEngine === 'iflow' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('iflow.title')}</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                {t('iflow.cliPath')}
              </label>
              <ClaudePathSelector
                value={localConfig.iflow.cliPath || 'iflow'}
                onChange={handleIFlowCmdChange}
                engineType="iflow"
                disabled={loading}
                placeholder="iflow"
              />
            </div>
          </div>
        )}

        {localConfig.defaultEngine === 'codex' && (
          <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('codex.title', 'Codex CLI')}</h3>
            <div>
              <label className="block text-xs text-text-secondary mb-2">
                {t('codex.cliPath', 'CLI 路径')}
              </label>
              <ClaudePathSelector
                value={localConfig.codex?.cliPath || 'codex'}
                onChange={handleCodexCmdChange}
                engineType="codex"
                disabled={loading}
                placeholder="codex"
              />
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              {t('codex.hint', 'OpenAI Codex CLI 路径，留空使用系统 PATH 中的 codex 命令')}
            </p>
            
            {/* Sandbox 模式配置 */}
            <div className="mt-4">
              <label className="block text-xs text-text-secondary mb-2">
                {t('codex.sandboxMode', 'Sandbox 模式')}
              </label>
              <select
                value={localConfig.codex?.sandboxMode || 'workspace-write'}
                onChange={(e) => setLocalConfig(prev => prev ? {
                  ...prev,
                  codex: { ...prev.codex, sandboxMode: e.target.value }
                } : prev)}
                className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
              >
                <option value="workspace-write">workspace-write (创建/修改，可能不支持删除)</option>
                <option value="danger-full-access">danger-full-access (完整权限，包括删除)</option>
              </select>
              <p className="mt-1 text-xs text-text-tertiary">
                workspace-write: 较安全，但删除文件可能失败<br/>
                danger-full-access: 完整权限，但有安全风险
              </p>
            </div>

            {/* 危险模式开关 */}
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={localConfig.codex?.dangerousBypass || false}
                  onChange={(e) => setLocalConfig(prev => prev ? {
                    ...prev,
                    codex: { ...prev.codex, dangerousBypass: e.target.checked }
                  } : prev)}
                  className="w-4 h-4"
                />
                <span className="text-red-500">dangerously-bypass-approvals-and-sandbox</span>
              </label>
              <p className="mt-1 text-xs text-text-tertiary ml-6">
                ⚠️ 跳过所有审批和沙箱限制，极危险，仅限安全环境使用
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('language.title')}</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">{t('language.current')}</div>
              <div className="text-xs text-text-secondary">{t('language.hint')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleLanguageChange('zh-CN')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  (localConfig.language || 'zh-CN') === 'zh-CN'
                    ? 'bg-primary text-white'
                    : 'bg-background-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('en-US')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  localConfig.language === 'en-US'
                    ? 'bg-primary text-white'
                    : 'bg-background-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>

        {/* 钉钉集成配置 */}
        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">钉钉集成</h3>

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-text-primary">启用钉钉集成</div>
              <div className="text-xs text-text-secondary">接收和发送钉钉消息</div>
            </div>
            <button
              type="button"
              onClick={() => handleDingTalkEnabledChange(!localConfig.dingtalk?.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localConfig.dingtalk?.enabled ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.dingtalk?.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {localConfig.dingtalk?.enabled && (
            <>
              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  App Key
                </label>
                <input
                  type="text"
                  value={localConfig.dingtalk?.appKey || ''}
                  onChange={(e) => handleDingTalkAppKeyChange(e.target.value)}
                  placeholder="钉钉应用的 AppKey"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  App Secret
                </label>
                <input
                  type="password"
                  value={localConfig.dingtalk?.appSecret || ''}
                  onChange={(e) => handleDingTalkAppSecretChange(e.target.value)}
                  placeholder="钉钉应用的 AppSecret"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  测试群会话 ID
                </label>
                <input
                  type="text"
                  value={localConfig.dingtalk?.testConversationId || ''}
                  onChange={(e) => handleDingTalkTestConversationIdChange(e.target.value)}
                  placeholder="用于测试连接的会话 ID"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  Webhook 端口
                </label>
                <input
                  type="number"
                  value={localConfig.dingtalk?.webhookPort || 3456}
                  onChange={(e) => handleDingTalkWebhookPortChange(parseInt(e.target.value) || 3456)}
                  placeholder="3456"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs text-text-primary">
                      <span className="font-medium">配置说明：</span>
                    </p>
                    <ul className="text-xs text-text-tertiary mt-1 space-y-1 list-disc list-inside">
                      <li>在钉钉开放平台创建企业内部应用</li>
                      <li>获取 App Key 和 App Secret</li>
                      <li>配置机器人权限和消息接收地址</li>
                      <li>会话 ID 可以在群设置或单聊中查看</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* QQ Bot 集成配置 */}
        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">QQ Bot 集成</h3>

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-text-primary">启用 QQ Bot 集成</div>
              <div className="text-xs text-text-secondary">通过 QQ 机器人接收和发送消息</div>
            </div>
            <button
              type="button"
              onClick={() => handleQQBotEnabledChange(!localConfig.qqbot?.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localConfig.qqbot?.enabled ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.qqbot?.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {localConfig.qqbot?.enabled && (
            <>
              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  App ID
                </label>
                <input
                  type="text"
                  value={localConfig.qqbot?.appId || ''}
                  onChange={(e) => handleQQBotAppIdChange(e.target.value)}
                  placeholder="QQ 机器人应用的 App ID"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={localConfig.qqbot?.clientSecret || ''}
                  onChange={(e) => handleQQBotClientSecretChange(e.target.value)}
                  placeholder="QQ 机器人应用的 Client Secret"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-text-secondary mb-2">
                  消息显示模式
                </label>
                <select
                  value={localConfig.qqbot?.displayMode || 'chat'}
                  onChange={(e) => handleQQBotDisplayModeChange(e.target.value as import('../../types/config').IntegrationDisplayMode)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={loading}
                >
                  <option value="chat">聊天模式 - 消息显示在聊天窗口</option>
                  <option value="separate">独立模式 - 消息显示在独立面板</option>
                  <option value="both">双模式 - 同时显示在两处</option>
                </select>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localConfig.qqbot?.sandbox || false}
                    onChange={(e) => handleQQBotSandboxChange(e.target.checked)}
                    className="w-4 h-4"
                  />
                  沙箱环境
                </label>
                <span className="text-xs text-text-tertiary">（用于测试，不会发送真实消息）</span>
              </div>

              {/* 自动连接开关 */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-text-primary">启动时自动连接</div>
                  <div className="text-xs text-text-secondary">应用启动时自动建立 WebSocket 连接</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleQQBotAutoConnectChange(!localConfig.qqbot?.autoConnect)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    localConfig.qqbot?.autoConnect ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.qqbot?.autoConnect ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 连接状态和控制 */}
              <div className="p-3 bg-surface-secondary rounded-lg border border-border-subtle mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isQQBotConnected ? 'bg-success' : 'bg-text-tertiary'}`} />
                    <span className="text-sm text-text-primary">
                      {isQQBotConnected ? '已连接' : '未连接'}
                    </span>
                    {qqbotStatus?.error && (
                      <span className="text-xs text-danger ml-2">{qqbotStatus.error}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isQQBotConnected ? (
                      <button
                        type="button"
                        onClick={handleQQBotDisconnect}
                        disabled={integrationLoading}
                        className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors disabled:opacity-50"
                      >
                        {integrationLoading ? '断开中...' : '断开连接'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleQQBotConnect}
                        disabled={integrationLoading || !localConfig.qqbot?.appId || !localConfig.qqbot?.clientSecret}
                        className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {integrationLoading ? '连接中...' : '连接'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs text-text-primary">
                      <span className="font-medium">配置说明：</span>
                    </p>
                    <ul className="text-xs text-text-tertiary mt-1 space-y-1 list-disc list-inside">
                      <li>在 QQ 开放平台创建机器人应用</li>
                      <li>获取 App ID 和 Client Secret</li>
                      <li>配置机器人权限和事件订阅</li>
                      <li>沙箱环境用于开发测试</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('floatingWindow.title')}</h3>

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-text-primary">{t('floatingWindow.enabled')}</div>
              <div className="text-xs text-text-secondary">{t('floatingWindow.enabledHint')}</div>
            </div>
            <button
              type="button"
              onClick={() => handleFloatingWindowEnabledChange(!localConfig.floatingWindow.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                localConfig.floatingWindow.enabled ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.floatingWindow.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {localConfig.floatingWindow.enabled && (
            <>
              <div className="mb-4">
                <div className="text-xs text-text-secondary mb-2">{t('floatingWindow.mode')}</div>
                <div className="space-y-2">
                  {FLOATING_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleFloatingWindowModeChange(option.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        localConfig.floatingWindow.mode === option.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border-subtle hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-text-primary">{option.name}</div>
                          <div className="text-xs text-text-secondary mt-0.5">{option.description}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ml-2 ${
                          localConfig.floatingWindow.mode === option.id
                            ? 'border-primary'
                            : 'border-border'
                        }`}>
                          {localConfig.floatingWindow.mode === option.id && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-text-primary">{t('floatingWindow.expandOnHover')}</div>
                  <div className="text-xs text-text-secondary">{t('floatingWindow.expandOnHoverHint')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleFloatingWindowExpandOnHoverChange(!localConfig.floatingWindow.expandOnHover)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    localConfig.floatingWindow.expandOnHover ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      localConfig.floatingWindow.expandOnHover ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {localConfig.floatingWindow.mode === 'auto' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm text-text-primary">{t('floatingWindow.collapseDelay')}</div>
                      <div className="text-xs text-text-secondary">{t('floatingWindow.collapseDelayHint')}</div>
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {localConfig.floatingWindow.collapseDelay} ms
                    </div>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="3000"
                    step="100"
                    value={localConfig.floatingWindow.collapseDelay}
                    onChange={(e) => handleFloatingWindowCollapseDelayChange(Number(e.target.value))}
                    className="w-full h-2 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-text-tertiary mt-1">
                    <span>100ms</span>
                    <span>3000ms</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('baiduTranslate.title')}</h3>
          <p className="text-xs text-text-secondary mb-4">
            {t('baiduTranslate.hint')}
          </p>

          <div className="mb-4">
            <label className="block text-xs text-text-secondary mb-2">
              {t('baiduTranslate.appId')}
            </label>
            <input
              type="text"
              value={localConfig.baiduTranslate?.appId || ''}
              onChange={(e) => handleBaiduTranslateAppIdChange(e.target.value)}
              placeholder={t('baiduTranslate.appIdPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs text-text-secondary mb-2">
              {t('baiduTranslate.secretKey')}
            </label>
            <input
              type="password"
              value={localConfig.baiduTranslate?.secretKey || ''}
              onChange={(e) => handleBaiduTranslateSecretKeyChange(e.target.value)}
              placeholder={t('baiduTranslate.secretKeyPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
          </div>

          <p className="text-xs text-text-tertiary">
            {t('baiduTranslate.applyHint')} <a href="https://fanyi-api.baidu.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t('baiduTranslate.platform')}</a>
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {tCommon('buttons.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="min-w-[80px]"
          >
            {loading ? tCommon('status.saving') : tCommon('buttons.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
