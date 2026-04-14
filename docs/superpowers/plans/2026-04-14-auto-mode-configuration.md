# Auto-Mode Configuration 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现自动模式配置面板，让用户可视化管理和编辑 Claude CLI 的安全规则

**Architecture:** 
- 后端：新增 `auto_mode_service.rs` 调用 `claude auto-mode config/defaults` 命令
- 前端：新增 `AutoModeTab.tsx` 组件，展示 Allow/Deny 规则列表，支持搜索和 AI 审查

**Tech Stack:** Tauri (Rust), React, TypeScript, Zustand, Tailwind CSS

---

## 文件结构

```
新建文件：
├── src-tauri/src/models/auto_mode.rs          # 自动模式数据模型
├── src-tauri/src/services/auto_mode_service.rs # CLI 调用服务
├── src-tauri/src/commands/auto_mode.rs         # Tauri 命令
├── src/types/autoMode.ts                       # TypeScript 类型
├── src/services/autoModeService.ts             # 前端服务
├── src/stores/autoModeStore.ts                 # 状态管理
└── src/components/Settings/tabs/AutoModeTab.tsx # UI 组件

修改文件：
├── src-tauri/src/models/mod.rs                 # 导出新模型
├── src-tauri/src/services/mod.rs               # 导出新服务
├── src-tauri/src/commands/mod.rs               # 导出新命令
├── src-tauri/src/lib.rs                        # 注册新命令
├── src/components/Settings/SettingsSidebar.tsx # 添加导航项
├── src/components/Settings/SettingsModal.tsx   # 渲染新 Tab
└── src/i18n/locales/zh-CN/settings.json        # 国际化
```

---

## Task 1: 后端数据模型

**Files:**
- Create: `src-tauri/src/models/auto_mode.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: 创建 auto_mode.rs 数据模型**

```rust
//! Auto-Mode 数据模型
//!
//! 用于 Claude CLI 自动模式配置的数据结构

use serde::{Deserialize, Serialize};

/// 自动模式配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoModeConfig {
    /// 允许规则列表
    pub allow: Vec<String>,
    /// 拒绝规则列表（软拒绝，需确认）
    pub soft_deny: Vec<String>,
    /// 环境配置
    pub environment: Vec<String>,
}

/// 自动模式默认配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoModeDefaults {
    /// 默认允许规则
    pub allow: Vec<String>,
    /// 默认拒绝规则
    pub soft_deny: Vec<String>,
    /// 默认环境配置
    pub environment: Vec<String>,
}
```

- [ ] **Step 2: 修改 models/mod.rs 导出新模块**

在 `src-tauri/src/models/mod.rs` 末尾添加：

```rust
pub mod auto_mode;
pub use auto_mode::{AutoModeConfig, AutoModeDefaults};
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && cargo check 2>&1 | head -20`
Expected: 无错误输出

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models/auto_mode.rs src-tauri/src/models/mod.rs
git commit -m "feat(auto-mode): add data models for auto-mode configuration"
```

---

## Task 2: 后端服务层

**Files:**
- Create: `src-tauri/src/services/auto_mode_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: 创建 auto_mode_service.rs**

```rust
//! Auto-Mode 服务
//!
//! 封装 Claude CLI 的 auto-mode 命令调用

use std::process::Command;

use crate::error::{AppError, Result};
use crate::models::auto_mode::{AutoModeConfig, AutoModeDefaults};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use crate::utils::CREATE_NO_WINDOW;

/// Auto-Mode 服务
pub struct AutoModeService {
    /// Claude CLI 路径
    claude_path: String,
}

impl AutoModeService {
    /// 创建新的 Auto-Mode 服务
    pub fn new(claude_path: String) -> Self {
        Self { claude_path }
    }

    /// 执行 Claude CLI 命令并获取输出
    fn execute_claude(&self, args: &[&str]) -> Result<String> {
        let mut cmd = self.build_command();
        cmd.args(args);

        let output = cmd.output().map_err(|e| {
            AppError::ProcessError(format!("执行 Claude CLI 失败: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::ProcessError(format!(
                "Claude CLI 执行失败: {}",
                stderr
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// 构建命令
    #[cfg(windows)]
    fn build_command(&self) -> Command {
        let mut cmd = Command::new(&self.claude_path);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    /// 构建命令 (非 Windows)
    #[cfg(not(windows))]
    fn build_command(&self) -> Command {
        Command::new(&self.claude_path)
    }

    /// 获取当前配置
    ///
    /// 调用 `claude auto-mode config`
    pub fn get_config(&self) -> Result<AutoModeConfig> {
        let output = self.execute_claude(&["auto-mode", "config"])?;
        
        let config: AutoModeConfig = serde_json::from_str(&output).map_err(|e| {
            AppError::ProcessError(format!("解析自动模式配置失败: {}", e))
        })?;

        Ok(config)
    }

    /// 获取默认配置
    ///
    /// 调用 `claude auto-mode defaults`
    pub fn get_defaults(&self) -> Result<AutoModeDefaults> {
        let output = self.execute_claude(&["auto-mode", "defaults"])?;
        
        let defaults: AutoModeDefaults = serde_json::from_str(&output).map_err(|e| {
            AppError::ProcessError(format!("解析默认配置失败: {}", e))
        })?;

        Ok(defaults)
    }
}
```

- [ ] **Step 2: 修改 services/mod.rs 导出新服务**

在 `src-tauri/src/services/mod.rs` 添加：

```rust
pub mod auto_mode_service;
pub use auto_mode_service::AutoModeService;
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && cargo check 2>&1 | head -20`
Expected: 无错误输出

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/auto_mode_service.rs src-tauri/src/services/mod.rs
git commit -m "feat(auto-mode): add service for CLI auto-mode commands"
```

---

## Task 3: 后端 Tauri 命令

**Files:**
- Create: `src-tauri/src/commands/auto_mode.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 commands/auto_mode.rs**

```rust
//! Auto-Mode Tauri 命令
//!
//! 提供自动模式配置的 API 接口

use tauri::State;

use crate::error::Result;
use crate::models::auto_mode::{AutoModeConfig, AutoModeDefaults};
use crate::services::auto_mode_service::AutoModeService;
use crate::state::AppState;

/// 获取 Claude CLI 路径
fn get_claude_path(state: &State<'_, AppState>) -> Result<String> {
    let store = state.config_store.lock()
        .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
    Ok(store.get().get_claude_cmd())
}

/// 获取自动模式配置
#[tauri::command]
pub async fn auto_mode_config(state: State<'_, AppState>) -> Result<AutoModeConfig> {
    let claude_path = get_claude_path(&state)?;
    let service = AutoModeService::new(claude_path);
    service.get_config()
}

/// 获取默认配置
#[tauri::command]
pub async fn auto_mode_defaults(state: State<'_, AppState>) -> Result<AutoModeDefaults> {
    let claude_path = get_claude_path(&state)?;
    let service = AutoModeService::new(claude_path);
    service.get_defaults()
}
```

- [ ] **Step 2: 修改 commands/mod.rs 导出新命令**

在 `src-tauri/src/commands/mod.rs` 添加：

```rust
pub mod auto_mode;
pub use auto_mode::{auto_mode_config, auto_mode_defaults};
```

- [ ] **Step 3: 修改 lib.rs 注册新命令**

找到 `invoke_handler` 部分，添加新命令。在 `src-tauri/src/lib.rs` 中找到类似这样的代码块：

```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令
])
```

添加新命令：

```rust
    // 在 invoke_handler 的命令列表中添加
    commands::auto_mode::auto_mode_config,
    commands::auto_mode::auto_mode_defaults,
```

- [ ] **Step 4: 验证编译**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: 无错误输出

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/auto_mode.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(auto-mode): add Tauri commands for auto-mode config"
```

---

## Task 4: 前端类型定义

**Files:**
- Create: `src/types/autoMode.ts`

- [ ] **Step 1: 创建 TypeScript 类型**

```typescript
/**
 * Auto-Mode 类型定义
 *
 * 用于自动模式配置的 TypeScript 类型
 */

/**
 * 自动模式配置
 */
export interface AutoModeConfig {
  /** 允许规则列表 */
  allow: string[];
  /** 拒绝规则列表（软拒绝，需确认） */
  softDeny: string[];
  /** 环境配置 */
  environment: string[];
}

/**
 * 自动模式默认配置
 */
export interface AutoModeDefaults {
  /** 默认允许规则 */
  allow: string[];
  /** 默认拒绝规则 */
  softDeny: string[];
  /** 默认环境配置 */
  environment: string[];
}

/**
 * 规则类型
 */
export type RuleType = 'allow' | 'softDeny';

/**
 * 规则分类
 */
export interface RuleCategory {
  id: string;
  name: string;
  description: string;
  rules: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/autoMode.ts
git commit -m "feat(auto-mode): add TypeScript types for auto-mode configuration"
```

---

## Task 5: 前端服务层

**Files:**
- Create: `src/services/autoModeService.ts`

- [ ] **Step 1: 创建前端服务**

```typescript
/**
 * Auto-Mode 服务
 *
 * 封装 Tauri 命令调用
 */

import { invoke } from '@tauri-apps/api/core';
import type { AutoModeConfig, AutoModeDefaults } from '../types/autoMode';

/**
 * 获取自动模式配置
 */
export async function getAutoModeConfig(): Promise<AutoModeConfig> {
  return invoke<AutoModeConfig>('auto_mode_config');
}

/**
 * 获取默认配置
 */
export async function getAutoModeDefaults(): Promise<AutoModeDefaults> {
  return invoke<AutoModeDefaults>('auto_mode_defaults');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/autoModeService.ts
git commit -m "feat(auto-mode): add frontend service for auto-mode API"
```

---

## Task 6: 状态管理

**Files:**
- Create: `src/stores/autoModeStore.ts`

- [ ] **Step 1: 创建 Zustand Store**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/autoModeStore.ts
git commit -m "feat(auto-mode): add Zustand store for auto-mode state"
```

---

## Task 7: UI 组件 - 基础结构

**Files:**
- Create: `src/components/Settings/tabs/AutoModeTab.tsx`

- [ ] **Step 1: 创建 AutoModeTab 组件框架**

```tsx
/**
 * Auto-Mode 配置 Tab
 *
 * 显示允许/拒绝规则，支持搜索和查看详情
 */

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, AlertTriangle, CheckCircle, Search, Info } from 'lucide-react';
import { useAutoModeStore } from '../../../stores/autoModeStore';
import { Button } from '../../Common';
import type { RuleType } from '../../../types/autoMode';

export function AutoModeTab() {
  const { t } = useTranslation('settings');
  const {
    config,
    defaults,
    loading,
    error,
    searchQuery,
    fetchConfig,
    fetchDefaults,
    setSearchQuery,
    clearError,
  } = useAutoModeStore();

  const [activeSection, setActiveSection] = useState<RuleType>('allow');

  // 初始化加载
  useEffect(() => {
    fetchConfig();
    fetchDefaults();
  }, [fetchConfig, fetchDefaults]);

  // 过滤规则
  const filteredAllowRules = useMemo(() => {
    if (!config?.allow) return [];
    if (!searchQuery) return config.allow;
    return config.allow.filter(rule =>
      rule.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [config?.allow, searchQuery]);

  const filteredDenyRules = useMemo(() => {
    if (!config?.softDeny) return [];
    if (!searchQuery) return config.softDeny;
    return config.softDeny.filter(rule =>
      rule.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [config?.softDeny, searchQuery]);

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg">
        <p className="text-danger text-sm">{error}</p>
        <Button variant="ghost" onClick={clearError} className="mt-2">
          {t('common.dismiss', '关闭')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 说明区域 */}
      <div className="p-4 bg-surface rounded-lg border border-border">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">
              {t('autoMode.description', '自动模式控制 Claude 在没有用户确认的情况下可以执行哪些操作')}
            </p>
            <p>
              {t('autoMode.descriptionDetail', '允许规则会自动执行，拒绝规则需要用户确认。这些规则用于保护您的系统和数据安全。')}
            </p>
          </div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('autoMode.searchPlaceholder', '搜索规则...')}
          className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-primary"
        />
      </div>

      {/* 规则统计 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setActiveSection('allow')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            activeSection === 'allow'
              ? 'bg-green-500/10 text-green-600 border border-green-500/30'
              : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          {t('autoMode.allow', '允许')} ({filteredAllowRules.length})
        </button>
        <button
          onClick={() => setActiveSection('softDeny')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            activeSection === 'softDeny'
              ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/30'
              : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          {t('autoMode.softDeny', '需确认')} ({filteredDenyRules.length})
        </button>
      </div>

      {/* 规则列表 */}
      <div className="border border-border rounded-lg overflow-hidden">
        {activeSection === 'allow' ? (
          <RuleList
            rules={filteredAllowRules}
            type="allow"
            searchQuery={searchQuery}
          />
        ) : (
          <RuleList
            rules={filteredDenyRules}
            type="softDeny"
            searchQuery={searchQuery}
          />
        )}
      </div>

      {/* 环境配置 */}
      {config?.environment && config.environment.length > 0 && (
        <div className="p-4 bg-surface rounded-lg border border-border">
          <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            {t('autoMode.environment', '环境配置')}
          </h4>
          <ul className="space-y-1">
            {config.environment.map((env, index) => (
              <li key={index} className="text-xs text-text-secondary pl-6">
                {env.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*\*(.*?)\*\*/g, '')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 规则列表组件
function RuleList({
  rules,
  type,
  searchQuery,
}: {
  rules: string[];
  type: RuleType;
  searchQuery: string;
}) {
  const { t } = useTranslation('settings');

  if (rules.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        {searchQuery
          ? t('autoMode.noResults', '没有找到匹配的规则')
          : t('autoMode.noRules', '暂无规则')}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {rules.map((rule, index) => (
        <RuleItem key={index} rule={rule} type={type} searchQuery={searchQuery} />
      ))}
    </ul>
  );
}

// 规则项组件
function RuleItem({
  rule,
  type,
  searchQuery,
}: {
  rule: string;
  type: RuleType;
  searchQuery: string;
}) {
  // 解析规则名称和描述
  const colonIndex = rule.indexOf(':');
  const name = colonIndex > 0 ? rule.slice(0, colonIndex).trim() : rule;
  const description = colonIndex > 0 ? rule.slice(colonIndex + 1).trim() : '';

  // 高亮搜索词
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const Icon = type === 'allow' ? CheckCircle : AlertTriangle;
  const iconColor = type === 'allow' ? 'text-green-500' : 'text-yellow-500';

  return (
    <li className="p-4 hover:bg-background-hover transition-colors">
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">
            {highlightText(name)}
          </div>
          {description && (
            <div className="mt-1 text-xs text-text-secondary leading-relaxed">
              {highlightText(description)}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Settings/tabs/AutoModeTab.tsx
git commit -m "feat(auto-mode): add AutoModeTab UI component"
```

---

## Task 8: 集成到设置系统

**Files:**
- Modify: `src/components/Settings/SettingsSidebar.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx`

- [ ] **Step 1: 修改 SettingsSidebar.tsx 添加导航项**

在 `src/components/Settings/SettingsSidebar.tsx` 中：

1. 导入图标：
```tsx
import { Shield } from 'lucide-react';
```

2. 在 `NAV_ITEMS` 数组中添加（在 `advanced` 之前）：
```tsx
  { id: 'auto-mode', icon: <Shield size={16} />, labelKey: 'nav.autoMode' },
```

3. 在 `SettingsTabId` 类型中添加（需要修改 `SettingsSidebar.tsx` 顶部的 export）：
```tsx
export type SettingsTabId =
  | 'general'
  // ... 其他
  | 'auto-mode'  // 添加这一行
  | 'advanced';
```

- [ ] **Step 2: 修改 SettingsModal.tsx 渲染新 Tab**

1. 导入组件：
```tsx
import { AutoModeTab } from './tabs/AutoModeTab';
```

2. 在 `TAB_TITLE_KEYS` 中添加：
```tsx
const TAB_TITLE_KEYS: Record<SettingsTabId, string> = {
  // ... 其他
  'auto-mode': 'nav.autoMode',
  // ...
};
```

3. 在 Tab 内容渲染区域添加：
```tsx
{activeTab === 'auto-mode' && (
  <AutoModeTab />
)}
```

- [ ] **Step 3: 验证编译**

Run: `npm run build 2>&1 | tail -20`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/SettingsSidebar.tsx src/components/Settings/SettingsModal.tsx
git commit -m "feat(auto-mode): integrate AutoModeTab into settings modal"
```

---

## Task 9: 国际化支持

**Files:**
- Modify: `src/i18n/locales/zh-CN/settings.json`
- Modify: `src/i18n/locales/en-US/settings.json`

- [ ] **Step 1: 添加中文翻译**

在 `src/i18n/locales/zh-CN/settings.json` 的 `nav` 部分添加：
```json
{
  "nav": {
    "autoMode": "自动模式"
  },
  "autoMode": {
    "description": "自动模式控制 Claude 在没有用户确认的情况下可以执行哪些操作",
    "descriptionDetail": "允许规则会自动执行，拒绝规则需要用户确认。这些规则用于保护您的系统和数据安全。",
    "searchPlaceholder": "搜索规则...",
    "allow": "允许",
    "softDeny": "需确认",
    "environment": "环境配置",
    "noResults": "没有找到匹配的规则",
    "noRules": "暂无规则"
  }
}
```

- [ ] **Step 2: 添加英文翻译**

在 `src/i18n/locales/en-US/settings.json` 的 `nav` 部分添加：
```json
{
  "nav": {
    "autoMode": "Auto Mode"
  },
  "autoMode": {
    "description": "Auto mode controls which actions Claude can perform without user confirmation",
    "descriptionDetail": "Allow rules are executed automatically, deny rules require confirmation. These rules protect your system and data.",
    "searchPlaceholder": "Search rules...",
    "allow": "Allow",
    "softDeny": "Require Confirmation",
    "environment": "Environment Configuration",
    "noResults": "No matching rules found",
    "noRules": "No rules"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/zh-CN/settings.json src/i18n/locales/en-US/settings.json
git commit -m "feat(auto-mode): add i18n translations for auto-mode settings"
```

---

## Task 10: 完整测试

**Files:**
- 无新文件

- [ ] **Step 1: 完整编译测试**

Run: `npm run build 2>&1`
Expected: 构建成功

- [ ] **Step 2: 后端编译测试**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: 编译成功

- [ ] **Step 3: 运行应用验证功能**

Run: `npm run tauri dev`
手动测试：
1. 打开设置 → 找到"自动模式"导航项
2. 验证规则列表显示
3. 测试搜索功能
4. 切换允许/需确认视图

- [ ] **Step 4: Final Commit**

```bash
git add -A
git commit -m "feat(auto-mode): complete auto-mode configuration panel implementation

- Add backend models and service for auto-mode CLI commands
- Add Tauri commands for config and defaults API
- Add frontend types, service, and Zustand store
- Add AutoModeTab UI component with search and filtering
- Integrate into settings modal with i18n support

Refs: #auto-mode-implementation"
```

---

## 完成检查清单

- [ ] 后端数据模型编译通过
- [ ] 后端服务层编译通过
- [ ] Tauri 命令注册成功
- [ ] 前端类型定义完整
- [ ] 前端服务调用正确
- [ ] 状态管理工作正常
- [ ] UI 组件渲染正确
- [ ] 导航集成正确
- [ ] 国际化翻译完整
- [ ] 完整构建通过
- [ ] 功能测试通过

---

## 扩展功能（可选，后续迭代）

1. **规则编辑** - 支持用户自定义规则
2. **AI 审查** - 调用 `claude auto-mode critique` 获取 AI 反馈
3. **规则导出/导入** - 支持配置文件导入导出
4. **规则模板** - 提供常用规则模板
