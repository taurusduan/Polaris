/**
 * AI 引擎配置 Tab
 */

import { useTranslation } from 'react-i18next';
import { ClaudePathSelector } from '../../Common';
import type { Config, EngineId } from '../../../types';

interface AIEngineTabProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  loading: boolean;
}

// 固定的传统引擎选项
const FIXED_ENGINE_OPTIONS: { id: EngineId; nameKey: string; descKey: string }[] = [
  { id: 'claude-code', nameKey: 'engines.claudeCode.name', descKey: 'engines.claudeCode.description' },
  { id: 'iflow', nameKey: 'engines.iflow.name', descKey: 'engines.iflow.description' },
  { id: 'codex', nameKey: 'engines.codex.name', descKey: 'engines.codex.description' },
];

export function AIEngineTab({ config, onConfigChange, loading }: AIEngineTabProps) {
  const { t } = useTranslation('settings');

  // 获取启用的 OpenAI Providers
  const enabledProviders = config.openaiProviders?.filter(p => p.enabled) || [];

  const handleEngineChange = (engineId: EngineId) => {
    const isProvider = engineId.startsWith('provider-');
    onConfigChange({
      ...config,
      defaultEngine: engineId,
      activeProviderId: isProvider ? engineId.replace('provider-', '') : config.activeProviderId,
    });
  };

  const handleClaudeCmdChange = (cmd: string) => {
    onConfigChange({
      ...config,
      claudeCode: { ...config.claudeCode, cliPath: cmd }
    });
  };

  const handleIFlowCmdChange = (cmd: string) => {
    onConfigChange({
      ...config,
      iflow: { ...config.iflow, cliPath: cmd }
    });
  };

  const handleCodexCmdChange = (cmd: string) => {
    onConfigChange({
      ...config,
      codex: { ...config.codex, cliPath: cmd }
    });
  };

  return (
    <div className="space-y-6">
      {/* 引擎选择 */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          {t('aiEngine')}
        </label>
        <div className="space-y-2">
          {FIXED_ENGINE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleEngineChange(option.id)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                config.defaultEngine === option.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-surface hover:border-primary/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-text-primary">{t(option.nameKey)}</div>
                  <div className="text-sm text-text-secondary mt-1">{t(option.descKey)}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  config.defaultEngine === option.id
                    ? 'border-primary bg-primary'
                    : 'border-border'
                }`}>
                  {config.defaultEngine === option.id && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
          
          {/* OpenAI Provider 选项 */}
          {enabledProviders.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-sm font-medium text-text-secondary mb-2">
                OpenAI Provider
              </div>
              {enabledProviders.map((provider) => {
                const providerEngineId = `provider-${provider.id}` as EngineId;
                const isSelected = config.defaultEngine === providerEngineId;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleEngineChange(providerEngineId)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all mb-2 ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-surface hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{provider.name}</span>
                          {provider.supportsTools && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                              工具支持
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-secondary mt-1">
                          模型: <span className="text-blue-400">{provider.model}</span>
                        </div>
                        <div className="text-xs text-text-tertiary mt-0.5 truncate">
                          {provider.apiBase}
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-primary bg-primary' : 'border-border'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-sm font-medium text-text-secondary mb-2">
                OpenAI Provider
              </div>
              <p className="text-sm text-yellow-500 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                未配置 OpenAI Provider，请在"OpenAI Provider"标签页中添加配置
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Claude Code 配置 */}
      {config.defaultEngine === 'claude-code' && (
        <div className="p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('claudeCode.title')}</h3>
          <div>
            <label className="block text-xs text-text-secondary mb-2">
              {t('claudeCode.cliPath')}
            </label>
            <ClaudePathSelector
              value={config.claudeCode.cliPath}
              onChange={handleClaudeCmdChange}
              engineType="claude-code"
              disabled={loading}
            />
          </div>
        </div>
      )}

      {/* IFlow 配置 */}
      {config.defaultEngine === 'iflow' && (
        <div className="p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('iflow.title')}</h3>
          <div>
            <label className="block text-xs text-text-secondary mb-2">
              {t('iflow.cliPath')}
            </label>
            <ClaudePathSelector
              value={config.iflow.cliPath || 'iflow'}
              onChange={handleIFlowCmdChange}
              engineType="iflow"
              disabled={loading}
              placeholder="iflow"
            />
          </div>
        </div>
      )}

      {/* Codex 配置 */}
      {config.defaultEngine === 'codex' && (
        <div className="p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-3">{t('codex.title', 'Codex CLI')}</h3>
          <div>
            <label className="block text-xs text-text-secondary mb-2">
              {t('codex.cliPath', 'CLI 路径')}
            </label>
            <ClaudePathSelector
              value={config.codex?.cliPath || 'codex'}
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
              value={config.codex?.sandboxMode || 'workspace-write'}
              onChange={(e) => onConfigChange({
                ...config,
                codex: { ...config.codex, sandboxMode: e.target.value }
              })}
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
                checked={config.codex?.dangerousBypass || false}
                onChange={(e) => onConfigChange({
                  ...config,
                  codex: { ...config.codex, dangerousBypass: e.target.checked }
                })}
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
    </div>
  );
}
