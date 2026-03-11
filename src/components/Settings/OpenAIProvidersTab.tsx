/**
 * OpenAI Providers 配置组件
 *
 * 用于管理多个 OpenAI 兼容的 API Provider
 *
 * @author Polaris Team
 * @since 2025-03-11
 */

import { useState, useEffect } from 'react'
import { useConfigStore } from '../../stores'
import { Button } from '../Common'
import type { OpenAIProvider } from '../../types/config'
import { clsx } from 'clsx'

interface OpenAIProvidersTabProps {
  onClose?: () => void
}

export function OpenAIProvidersTab({ onClose }: OpenAIProvidersTabProps) {
  const { config, updateConfig } = useConfigStore()
  const [providers, setProviders] = useState<OpenAIProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string>()
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Map<string, boolean>>(new Map())

  // 初始化：从配置加载 Providers
  useEffect(() => {
    if (config?.openaiProviders) {
      setProviders(config.openaiProviders)
      setActiveProviderId(config.activeProviderId)
    }
  }, [config])

  // 保存配置
  const handleSave = async () => {
    if (!config) return

    try {
      await updateConfig({
        ...config,
        openaiProviders: providers,
        activeProviderId: activeProviderId,
      })
      onClose?.()
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  // 添加新 Provider
  const addProvider = () => {
    const newProvider: OpenAIProvider = {
      id: `provider-${Date.now()}`,
      name: 'New Provider',
      apiKey: '',
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 8192,
      enabled: true,
      supportsTools: false,
    }
    setProviders([...providers, newProvider])
  }

  // 删除 Provider
  const removeProvider = (id: string) => {
    const updatedProviders = providers.filter(p => p.id !== id)

    // 如果删除的是当前选中的，清空选中状态
    if (activeProviderId === id) {
      setActiveProviderId(undefined)
    }

    setProviders(updatedProviders)
    // 清除测试结果
    setTestResults(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  // 更新 Provider
  const updateProvider = (id: string, updates: Partial<OpenAIProvider>) => {
    setProviders(providers.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  // 测试连接
  const testConnection = async (provider: OpenAIProvider) => {
    setTestingProviderId(provider.id)

    try {
      const response = await fetch(`${provider.apiBase.replace(/\/$/, '')}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        signal: AbortSignal.timeout(10000), // 10 秒超时
      })

      const success = response.ok
      setTestResults(prev => new Map(prev).set(provider.id, success))

      return success
    } catch (error) {
      console.error(`Test connection failed for ${provider.name}:`, error)
      setTestResults(prev => new Map(prev).set(provider.id, false))
      return false
    } finally {
      setTestingProviderId(null)
    }
  }

  // 复制 Provider
  const duplicateProvider = (provider: OpenAIProvider) => {
    const duplicated: OpenAIProvider = {
      ...provider,
      id: `provider-${Date.now()}`,
      name: `${provider.name} (Copy)`,
      enabled: false, // 默认禁用复制的 Provider
    }
    setProviders([...providers, duplicated])
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div>
        <h3 className="text-lg font-semibold mb-2">OpenAI Providers</h3>
        <p className="text-sm text-text-secondary">
          配置多个 OpenAI 协议兼容的 API 服务。支持 OpenAI 官方、DeepSeek、Ollama 本地等。
        </p>
      </div>

      {/* Provider 列表 */}
      <div className="space-y-4">
        {providers.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isActive={provider.id === activeProviderId}
            isTesting={testingProviderId === provider.id}
            testResult={testResults.get(provider.id)}
            onUpdate={(updates) => updateProvider(provider.id, updates)}
            onRemove={() => removeProvider(provider.id)}
            onDuplicate={() => duplicateProvider(provider)}
            onTest={() => testConnection(provider)}
            onSelectActive={() => setActiveProviderId(provider.id)}
          />
        ))}
      </div>

      {/* 添加按钮 */}
      <Button
        onClick={addProvider}
        className="w-full"
        variant="secondary"
      >
        + 添加 Provider
      </Button>

      {/* 保存按钮 */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          onClick={onClose}
          variant="secondary"
        >
          取消
        </Button>
        <Button onClick={handleSave}>
          保存配置
        </Button>
      </div>
    </div>
  )
}

/**
 * Provider 卡片组件
 */
interface ProviderCardProps {
  provider: OpenAIProvider
  isActive: boolean
  isTesting: boolean
  testResult?: boolean
  onUpdate: (updates: Partial<OpenAIProvider>) => void
  onRemove: () => void
  onDuplicate: () => void
  onTest: () => Promise<boolean>
  onSelectActive: () => void
}

function ProviderCard({
  provider,
  isActive,
  isTesting,
  testResult,
  onUpdate,
  onRemove,
  onDuplicate,
  onTest,
  onSelectActive,
}: ProviderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={clsx(
        "border rounded-lg overflow-hidden transition-all",
        isActive ? "border-primary-500 bg-primary-faint" : "border-border-subtle"
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 bg-background-secondary">
        <div className="flex items-center gap-3 flex-1">
          {/* 启用开关 */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={provider.enabled}
              onChange={(e) => onUpdate({ enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-text-secondary">启用</span>
          </label>

          {/* Provider 名称 */}
          <input
            type="text"
            value={provider.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Provider 名称"
            className={clsx(
              "flex-1 px-3 py-1.5 rounded border bg-background",
              isActive ? "border-primary-500" : "border-border-subtle focus:border-primary-500"
            )}
          />

          {/* 状态指示 */}
          {testResult === true && (
            <span className="text-success text-xs">✓ 连接成功</span>
          )}
          {testResult === false && (
            <span className="text-error text-xs">✗ 连接失败</span>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {/* 设为当前 */}
          {!isActive && provider.enabled && (
            <button
              onClick={onSelectActive}
              className="px-3 py-1 text-xs rounded border border-primary-500 text-primary-500 hover:bg-primary-faint"
            >
              设为当前
            </button>
          )}

          {isActive && (
            <span className="px-3 py-1 text-xs rounded bg-primary-500 text-white">
              当前
            </span>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-text-subtle hover:text-text transition-colors"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {/* 展开配置 */}
      {isExpanded && (
        <div className="p-4 space-y-3 border-t border-border-subtle">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-1">API Key</label>
            <input
              type="password"
              value={provider.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 rounded border border-border-subtle bg-background"
            />
          </div>

          {/* API Base URL */}
          <div>
            <label className="block text-sm font-medium mb-1">API Base URL</label>
            <input
              type="text"
              value={provider.apiBase}
              onChange={(e) => onUpdate({ apiBase: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 rounded border border-border-subtle bg-background"
            />
          </div>

          {/* 模型名称 */}
          <div>
            <label className="block text-sm font-medium mb-1">模型名称</label>
            <input
              type="text"
              value={provider.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 rounded border border-border-subtle bg-background"
            />
            <p className="text-xs text-text-subtle mt-1">
              完全由您决定，可以是任意模型名称
            </p>
          </div>

          {/* 温度和 Token 数 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">温度 (0-2)</label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={provider.temperature}
                onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 rounded border border-border-subtle bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">最大 Token 数</label>
              <input
                type="number"
                min="1"
                value={provider.maxTokens}
                onChange={(e) => onUpdate({ maxTokens: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded border border-border-subtle bg-background"
              />
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-between items-center pt-2">
            <div className="flex gap-2">
              <button
                onClick={onTest}
                disabled={isTesting || !provider.apiKey}
                className={clsx(
                  "px-4 py-2 text-sm rounded border",
                  isTesting
                    ? "bg-disabled text-text-muted cursor-wait"
                    : "border-primary-500 text-primary-500 hover:bg-primary-fight"
                )}
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>

              <button
                onClick={onDuplicate}
                className="px-4 py-2 text-sm rounded border border-border-subtle hover:bg-background-hover"
              >
                复制
              </button>
            </div>

            <button
              onClick={onRemove}
              className="px-4 py-2 text-sm rounded border border-error/30 text-error hover:bg-error-faint"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
