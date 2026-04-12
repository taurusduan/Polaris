# Integration Left Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在左侧面板新增机器人集成管理入口，用户可通过 ActivityBar 一键管理 QQ/飞书机器人连接。

**Architecture:** 新增 `IntegrationPanel` 统一组件，通过 `platform` 状态参数区分 QQ/飞书，作为 `LeftPanel` 的新内容槽。ActivityBar 和 RadialMenu 各添加一个入口。

**Tech Stack:** React, TypeScript, Zustand (viewStore/integrationStore), Lucide Icons

---

### Task 1: viewStore 添加 integration 面板类型

**Files:**
- Modify: `src/stores/viewStore.ts:9`

- [ ] **Step 1: 更新 LeftPanelType 联合类型**

在 `src/stores/viewStore.ts` 第 9 行，将 `LeftPanelType` 类型扩展：

```typescript
export type LeftPanelType = 'files' | 'git' | 'todo' | 'translate' | 'scheduler' | 'requirement' | 'terminal' | 'tools' | 'developer' | 'integration' | 'none';
```

- [ ] **Step 2: 编译验证**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`
Expected: 可能有类型错误（`LeftPanelContent` 中未处理 `'integration'`），这是预期的，Task 3 会修复

---

### Task 2: ActivityBar + RadialMenu 添加机器人入口

**Files:**
- Modify: `src/components/Layout/ActivityBar.tsx`

- [ ] **Step 1: 导入 Bot 图标**

在 `ActivityBar.tsx` 顶部的 lucide-react 导入中（第 9 行），添加 `Bot`：

```typescript
import { Files, GitPullRequest, CheckSquare, Settings, Languages, Clock, ClipboardList, Terminal, Code2, PanelRight, Bot } from 'lucide-react'
```

- [ ] **Step 2: 在 panelButtons 数组中添加 integration 按钮**

在 `panelButtons` 数组（第 76-117 行）中，在 `developer` 之后添加：

```typescript
    {
      id: 'integration' as const,
      icon: Bot,
      label: t('labels.integrationPanel'),
    },
```

注意：`'integration' as const` 需要能赋值给 `LeftPanelType`，Task 1 完成后即可。

- [ ] **Step 3: 确认 RadialMenu 无需额外改动**

RadialMenu 接收 `buttons` prop，与 ActivityBar 的 `panelButtons` 共享同一数组。因此只需在 `panelButtons` 中添加即可，RadialMenu 自动获得新入口。

- [ ] **Step 4: 添加 i18n 翻译 key**

在 `src/locales/zh/common.json` 中找到 `labels` 对象，添加：
```json
"integrationPanel": "机器人管理"
```

在 `src/locales/en/common.json` 对应位置添加：
```json
"integrationPanel": "Bots"
```

- [ ] **Step 5: 编译验证**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`

---

### Task 3: LeftPanelContent 路由添加 integration case

**Files:**
- Modify: `src/components/Layout/LeftPanel.tsx:63-111`

- [ ] **Step 1: 给 LeftPanelContent 添加 integrationContent prop**

在 `LeftPanelContent` 组件的 props 类型中（约第 64-84 行），在 `developerContent` 之后添加：

```typescript
  integrationContent?: ReactNode
```

- [ ] **Step 2: 在 switch 中添加 integration case**

在 `LeftPanelContent` 函数体的条件判断链中（约第 107 行 `} else if (type === 'developer') {` 之后），添加：

```typescript
  } else if (type === 'integration') {
    return <>{integrationContent}</>
  }
```

- [ ] **Step 3: 编译验证**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`

---

### Task 4: App.tsx 接入 IntegrationPanel

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 懒加载导入 IntegrationPanel**

在 `App.tsx` 中找到其他懒加载导入（搜索 `lazy`），添加：

```typescript
const IntegrationPanel = lazy(() => import('./components/Integration/IntegrationPanel'))
```

- [ ] **Step 2: 在 LeftPanelContent 中传入 integrationContent**

找到 `App.tsx` 中渲染 `<LeftPanelContent>` 的位置，添加 `integrationContent` prop：

```tsx
integrationContent={<IntegrationPanel />}
```

- [ ] **Step 3: 编译验证**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`
Expected: 会有 IntegrationPanel 模块找不到的错误，Task 5 会创建它

---

### Task 5: 创建 IntegrationPanel 统一组件

**Files:**
- Create: `src/components/Integration/IntegrationPanel.tsx`

这是核心新文件。统一管理 QQ 和飞书的面板，通过内部 `platform` 状态区分。

- [ ] **Step 1: 创建组件文件**

创建 `src/components/Integration/IntegrationPanel.tsx`：

```tsx
/**
 * IntegrationPanel - 统一机器人集成管理面板
 *
 * 通过顶部 Tab 切换 QQ Bot / 飞书平台，
 * 共享实例列表管理、连接控制和轻量配置编辑逻辑。
 */

import { useState, useEffect } from 'react'
import {
  useIntegrationStore,
  useIntegrationStatus,
  useIntegrationInstances,
  useActiveIntegrationInstance,
} from '../../stores'
import type { Platform, PlatformInstance } from '../../types'
import {
  ConnectionStateLabels,
  type ConnectionState,
} from '../../types/integration'
import { createLogger } from '../../utils/logger'

const log = createLogger('IntegrationPanel')

type PlatformTab = 'qqbot' | 'feishu'

/** QQ Bot 平台的配置字段 */
const QQ_FIELDS = [
  { key: 'appId', label: 'App ID', type: 'text', placeholder: 'QQ 开放平台应用 App ID' },
  { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Client Secret' },
] as const

/** 飞书平台的配置字段 */
const FEISHU_FIELDS = [
  { key: 'appId', label: 'App ID', type: 'text', placeholder: '飞书开放平台应用 App ID' },
  { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: 'App Secret' },
] as const

/** 通用配置字段（两个平台共享） */
const COMMON_FIELDS = [
  { key: 'workDir', label: '默认工作区', type: 'text', placeholder: '新会话自动使用此目录（可选）' },
] as const

/** 获取平台对应的配置字段 */
function getPlatformFields(platform: PlatformTab) {
  return platform === 'qqbot' ? QQ_FIELDS : FEISHU_FIELDS
}

/** 获取连接状态的徽章样式 */
function getStateBadgeStyle(state: ConnectionState): string {
  switch (state) {
    case 'ready': return 'bg-success/20 text-success'
    case 'connecting': case 'authenticating': case 'reconnecting': return 'bg-warning/20 text-warning animate-pulse'
    case 'failed': return 'bg-danger/20 text-danger'
    default: return 'bg-text-tertiary/20 text-text-tertiary'
  }
}

export function IntegrationPanel() {
  const [platform, setPlatform] = useState<PlatformTab>('qqbot')

  // 从 integrationStore 获取状态和操作
  const status = useIntegrationStatus(platform)
  const instances = useIntegrationInstances(platform)
  const activeInstance = useActiveIntegrationInstance(platform)
  const {
    startPlatform,
    stopPlatform,
    loadInstances,
    addInstance,
    updateInstance,
    removeInstance,
    switchInstance,
  } = useIntegrationStore()

  const isConnected = status?.connected ?? false
  const connectionState = status?.connectionState ?? 'disconnected'
  const errorMessage = status?.error

  // 编辑状态
  const [editingInstance, setEditingInstance] = useState<PlatformInstance | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // 加载实例
  useEffect(() => { loadInstances() }, [loadInstances])

  // 同步激活实例到编辑状态
  useEffect(() => {
    if (activeInstance && !editingInstance) {
      setEditingInstance(activeInstance)
    }
  }, [activeInstance?.id, editingInstance?.id, platform])

  // 切换平台时重置编辑状态
  useEffect(() => {
    setEditingInstance(null)
    setHasChanges(false)
  }, [platform])

  // 创建空实例
  const handleAddInstance = () => {
    const newInstance: PlatformInstance = {
      id: `${platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '新机器人',
      platform: platform as Platform,
      config: {
        type: platform,
        enabled: true,
        appId: '',
        clientSecret: '',
        sandbox: false,
        appSecret: '',
        verificationToken: '',
        encryptKey: '',
        displayMode: 'chat',
        autoConnect: false,
        workDir: '',
      },
      createdAt: new Date().toISOString(),
      enabled: true,
    }
    setEditingInstance(newInstance)
    setHasChanges(true)
  }

  // 保存
  const handleSave = async () => {
    if (!editingInstance) return
    setSaving(true)
    try {
      const existing = instances.find((i) => i.id === editingInstance.id)
      if (!existing) {
        await addInstance(editingInstance)
      } else {
        await updateInstance(editingInstance)
      }
      setHasChanges(false)
    } catch (err) {
      log.error('保存失败', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  // 连接
  const handleConnect = async () => {
    if (!editingInstance) return
    try {
      if (hasChanges) {
        setSaving(true)
        const existing = instances.find((i) => i.id === editingInstance.id)
        if (!existing) await addInstance(editingInstance)
        else await updateInstance(editingInstance)
        setHasChanges(false)
        setSaving(false)
      }

      if (activeInstance?.id !== editingInstance.id) {
        await switchInstance(editingInstance.id)
      }

      // 构建 platform config
      if (platform === 'qqbot') {
        await startPlatform('qqbot', {
          enabled: true,
          instances: [{
            id: editingInstance.id,
            name: editingInstance.name,
            enabled: editingInstance.enabled,
            appId: editingInstance.config.appId,
            clientSecret: editingInstance.config.clientSecret,
            sandbox: editingInstance.config.sandbox ?? false,
            displayMode: editingInstance.config.displayMode,
            autoConnect: editingInstance.config.autoConnect,
            workDir: editingInstance.config.workDir || undefined,
            createdAt: editingInstance.createdAt,
            lastActive: editingInstance.lastActive,
          }],
          activeInstanceId: editingInstance.id,
        })
      } else {
        await startPlatform('feishu', undefined, {
          enabled: true,
          instances: [{
            id: editingInstance.id,
            name: editingInstance.name,
            enabled: editingInstance.enabled,
            appId: editingInstance.config.appId,
            appSecret: editingInstance.config.appSecret || '',
            verificationToken: '',
            encryptKey: '',
            displayMode: editingInstance.config.displayMode,
            autoConnect: editingInstance.config.autoConnect,
            workDir: editingInstance.config.workDir || undefined,
            createdAt: editingInstance.createdAt,
            lastActive: editingInstance.lastActive,
          }],
          activeInstanceId: editingInstance.id,
        })
      }
    } catch (err) {
      log.error('连接失败', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  // 断开
  const handleDisconnect = async () => {
    try { await stopPlatform(platform as Platform) } catch {}
  }

  // 切换实例
  const handleSwitchInstance = async (id: string) => {
    if (isConnected) await stopPlatform(platform as Platform)
    await switchInstance(id)
    setHasChanges(false)
  }

  // 更新编辑配置
  const updateConfig = (updates: Partial<PlatformInstance['config']>) => {
    if (!editingInstance) return
    setEditingInstance({ ...editingInstance, config: { ...editingInstance.config, ...updates } })
    setHasChanges(true)
  }

  const isEditingActive = activeInstance?.id === editingInstance?.id
  const platformFields = getPlatformFields(platform)

  return (
    <div className="flex flex-col h-full">
      {/* 平台切换 Tab */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setPlatform('qqbot')}
          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
            platform === 'qqbot'
              ? 'text-primary border-b-2 border-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          QQ Bot
        </button>
        <button
          onClick={() => setPlatform('feishu')}
          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
            platform === 'feishu'
              ? 'text-primary border-b-2 border-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          飞书
        </button>
      </div>

      {/* 面板内容 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 实例列表 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">实例</span>
            <button onClick={handleAddInstance} className="text-[11px] text-primary hover:underline">+ 添加</button>
          </div>

          {instances.length === 0 ? (
            <div className="py-4 text-center text-xs text-text-tertiary">暂无实例</div>
          ) : (
            instances.map((inst) => (
              <div
                key={inst.id}
                onClick={() => { if (!hasChanges || confirm('有未保存的更改，确定要切换吗？')) { setEditingInstance(inst); setHasChanges(false) } }}
                className={`p-2.5 rounded-lg border cursor-pointer transition-colors mb-1.5 ${
                  editingInstance?.id === inst.id ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border hover:bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-primary">{inst.name}</span>
                  <div className="flex items-center gap-1.5">
                    {activeInstance?.id === inst.id ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStateBadgeStyle(connectionState)}`}>
                        {ConnectionStateLabels[connectionState]}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-text-tertiary/15 text-text-tertiary font-medium">未激活</span>
                    )}
                    {activeInstance?.id !== inst.id && !isConnected && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSwitchInstance(inst.id) }}
                        className="text-[10px] text-text-tertiary hover:text-primary"
                      >切换</button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm('确定删除？')) removeInstance(inst.id) }}
                      className="text-[10px] text-text-tertiary hover:text-danger"
                    >删除</button>
                  </div>
                </div>
                <div className="text-[10px] text-text-tertiary mt-0.5">
                  {inst.config.appId ? `App ID: ${inst.config.appId.slice(0, 8)}...` : '未配置'}
                  {inst.config.workDir && ` | 📂 ${inst.config.workDir.split(/[\\/]/).pop()}`}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 快速配置 */}
        {editingInstance && (
          <div>
            <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">快速配置</div>
            <div className="bg-surface rounded-lg p-3 space-y-2.5">
              {/* 实例名称 */}
              <div>
                <label className="block text-[11px] text-text-tertiary mb-1">名称</label>
                <input
                  type="text"
                  value={editingInstance.name}
                  onChange={(e) => { setEditingInstance({ ...editingInstance, name: e.target.value }); setHasChanges(true) }}
                  className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              {/* 平台特有字段 */}
              {platformFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] text-text-tertiary mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    value={(editingInstance.config as any)[field.key] || ''}
                    onChange={(e) => updateConfig({ [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
              ))}

              {/* 通用字段 */}
              {COMMON_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] text-text-tertiary mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    value={(editingInstance.config as any)[field.key] || ''}
                    onChange={(e) => updateConfig({ [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
              ))}

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="flex-1 py-1.5 text-[11px] border border-border rounded-md text-text-secondary hover:border-primary hover:text-primary disabled:opacity-40 transition-colors"
                >{saving ? '保存中...' : '保存'}</button>
                {isEditingActive && isConnected ? (
                  <button
                    onClick={handleDisconnect}
                    className="flex-1 py-1.5 text-[11px] border border-danger/30 rounded-md text-danger hover:bg-danger/10 transition-colors"
                  >断开</button>
                ) : (
                  <button
                    onClick={handleConnect}
                    disabled={saving || !editingInstance.config.appId}
                    className="flex-1 py-1.5 text-[11px] bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >{saving ? '...' : '连接'}</button>
                )}
              </div>

              {/* 错误信息 */}
              {isEditingActive && connectionState === 'failed' && errorMessage && (
                <div className="text-[10px] text-danger bg-danger/10 p-2 rounded-md">{errorMessage}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 编译验证**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`
Expected: 无类型错误

---

### Task 6: 全量编译验证 + 清理

- [ ] **Step 1: TypeScript 编译检查**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`
Expected: 零错误

- [ ] **Step 2: Rust 编译检查**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -5`
Expected: 编译成功（无 Rust 改动，验证无回归）

- [ ] **Step 3: 确认变更文件**

Run: `git diff --stat HEAD`
Expected: 约 7 个文件变更（viewStore, ActivityBar, LeftPanel, App, IntegrationPanel, 2个i18n文件）
