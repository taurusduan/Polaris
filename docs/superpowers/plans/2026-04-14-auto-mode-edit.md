# Auto-Mode 配置增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强自动模式配置面板，支持可视化编辑自定义规则和高级 JSON 编辑模式

**Architecture:** 后端新增 Tauri 命令读写 `~/.claude/settings.json`，前端扩展 Store 和 UI 组件，实现双模式（规则列表 + JSON 编辑器）交互

**Tech Stack:** Tauri (Rust), React, TypeScript, Zustand, CodeMirror

---

## 文件结构

```
新建:
├── src-tauri/src/commands/claude_settings.rs    # 后端命令
├── src/services/claudeSettingsService.ts         # 前端服务

修改:
├── src-tauri/src/commands/mod.rs                 # 导出新模块
├── src-tauri/src/lib.rs                          # 注册新命令
├── src/types/autoMode.ts                         # 新增类型
├── src/stores/autoModeStore.ts                   # 扩展状态管理
├── src/components/Settings/tabs/AutoModeTab.tsx  # 重构 UI
├── src/locales/zh-CN/settings.json               # 中文国际化
├── src/locales/en-US/settings.json               # 英文国际化
```

---

## Task 1: 后端数据模型和命令

**Files:**
- Create: `src-tauri/src/commands/claude_settings.rs`

- [ ] **Step 1: 创建 claude_settings.rs**

```rust
//! Claude Settings 文件读写命令

use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

/// Claude settings.json 结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_plugins: Option<HashMap<String, bool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_known_marketplaces: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_mode: Option<AutoModeCustomRules>,
    #[serde(flatten)]
    pub other: serde_json::Map<String, serde_json::Value>,
}

/// 自定义自动模式规则
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoModeCustomRules {
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub soft_deny: Vec<String>,
}

fn get_settings_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".claude").join("settings.json")
}

#[tauri::command]
pub async fn read_claude_settings() -> Result<ClaudeSettings> {
    let path = get_settings_path();
    if !path.exists() {
        return Ok(ClaudeSettings::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::ProcessError(format!("读取 settings.json 失败: {}", e)))?;
    let settings: ClaudeSettings = serde_json::from_str(&content)
        .map_err(|e| AppError::ProcessError(format!("解析 settings.json 失败: {}", e)))?;
    Ok(settings)
}

#[tauri::command]
pub async fn write_claude_settings(settings: ClaudeSettings) -> Result<()> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::ProcessError(format!("创建目录失败: {}", e)))?;
        }
    }
    if path.exists() {
        let backup_path = path.with_extension("json.bak");
        let _ = std::fs::copy(&path, &backup_path);
    }
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::ProcessError(format!("序列化失败: {}", e)))?;
    std::fs::write(&path, content)
        .map_err(|e| AppError::ProcessError(format!("写入文件失败: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub async fn get_claude_settings_path() -> Result<String> {
    Ok(get_settings_path().to_string_lossy().to_string())
}
```

- [ ] **Step 2: 验证 Rust 编译**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/claude_settings.rs
git commit -m "feat(auto-mode): add Claude settings read/write commands"
```

---

## Task 2: 后端命令注册

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 修改 mod.rs**

在 `src-tauri/src/commands/mod.rs` 末尾添加：

```rust
pub mod claude_settings;
pub use claude_settings::{read_claude_settings, write_claude_settings, get_claude_settings_path};
```

- [ ] **Step 2: 修改 lib.rs**

1. 添加导入：
```rust
use commands::claude_settings::{
    read_claude_settings, write_claude_settings, get_claude_settings_path,
};
```

2. 在 `invoke_handler` 中添加命令：
```rust
    read_claude_settings,
    write_claude_settings,
    get_claude_settings_path,
```

- [ ] **Step 3: 验证编译**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(auto-mode): register Claude settings commands"
```

---

## Task 3: 前端类型定义

**Files:**
- Modify: `src/types/autoMode.ts`

- [ ] **Step 1: 扩展类型定义**

完整替换文件内容为设计文档中定义的类型（见 spec 第 51-68 行）

- [ ] **Step 2: 验证编译**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/types/autoMode.ts
git commit -m "feat(auto-mode): add ClaudeSettings and custom rules types"
```

---

## Task 4: 前端服务层

**Files:**
- Create: `src/services/claudeSettingsService.ts`

- [ ] **Step 1: 创建服务文件**

```typescript
/**
 * Claude Settings 服务
 */

import { invoke } from '@tauri-apps/api/core';
import type { ClaudeSettings, AutoModeCustomRules } from '../types/autoMode';

export async function readClaudeSettings(): Promise<ClaudeSettings> {
  return invoke<ClaudeSettings>('read_claude_settings');
}

export async function writeClaudeSettings(settings: ClaudeSettings): Promise<void> {
  return invoke('write_claude_settings', { settings });
}

export async function getClaudeSettingsPath(): Promise<string> {
  return invoke<string>('get_claude_settings_path');
}

export function extractCustomRules(settings: ClaudeSettings | null): AutoModeCustomRules {
  if (!settings?.autoMode) {
    return { allow: [], softDeny: [] };
  }
  return {
    allow: settings.autoMode.allow || [],
    softDeny: settings.autoMode.softDeny || [],
  };
}

export function updateCustomRules(
  settings: ClaudeSettings,
  rules: AutoModeCustomRules
): ClaudeSettings {
  return { ...settings, autoMode: rules };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/services/claudeSettingsService.ts
git commit -m "feat(auto-mode): add Claude settings frontend service"
```

---

## Task 5: 状态管理扩展

**Files:**
- Modify: `src/stores/autoModeStore.ts`

- [ ] **Step 1: 扩展 Store**

```typescript
/**
 * Auto-Mode 状态管理
 */

import { create } from 'zustand';
import type {
  AutoModeConfig,
  AutoModeDefaults,
  AutoModeCustomRules,
  ClaudeSettings,
  EditMode,
  RuleType,
} from '../types/autoMode';
import * as autoModeService from '../services/autoModeService';
import * as claudeSettingsService from '../services/claudeSettingsService';
import { createLogger } from '../utils/logger';

const log = createLogger('AutoModeStore');

interface AutoModeState {
  config: AutoModeConfig | null;
  defaults: AutoModeDefaults | null;
  customRules: AutoModeCustomRules;
  settings: ClaudeSettings | null;
  settingsPath: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  searchQuery: string;
  editMode: EditMode;

  fetchConfig: () => Promise<void>;
  fetchDefaults: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  refreshAll: () => Promise<void>;
  addCustomRule: (type: RuleType, rule: string) => Promise<void>;
  removeCustomRule: (type: RuleType, index: number) => Promise<void>;
  updateCustomRules: (rules: AutoModeCustomRules) => Promise<void>;
  updateSettings: (settings: ClaudeSettings) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setEditMode: (mode: EditMode) => void;
  clearError: () => void;
}

export const useAutoModeStore = create<AutoModeState>((set, get) => ({
  config: null,
  defaults: null,
  customRules: { allow: [], softDeny: [] },
  settings: null,
  settingsPath: null,
  loading: false,
  saving: false,
  error: null,
  searchQuery: '',
  editMode: 'list',

  fetchConfig: async () => {
    try {
      set({ loading: true, error: null });
      const config = await autoModeService.getAutoModeConfig();
      set({ config, loading: false });
    } catch (err) {
      log.error('获取配置失败', err instanceof Error ? err : new Error(String(err)));
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

  fetchSettings: async () => {
    try {
      set({ loading: true, error: null });
      const [settings, settingsPath] = await Promise.all([
        claudeSettingsService.readClaudeSettings(),
        claudeSettingsService.getClaudeSettingsPath(),
      ]);
      const customRules = claudeSettingsService.extractCustomRules(settings);
      set({ settings, settingsPath, customRules, loading: false });
    } catch (err) {
      log.error('读取 settings 失败', err instanceof Error ? err : new Error(String(err)));
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  refreshAll: async () => {
    const { fetchConfig, fetchDefaults, fetchSettings } = get();
    set({ loading: true });
    await Promise.all([fetchConfig(), fetchDefaults(), fetchSettings()]);
    set({ loading: false });
  },

  addCustomRule: async (type: RuleType, rule: string) => {
    const { customRules } = get();
    const key = type === 'allow' ? 'allow' : 'softDeny';
    const newRules = { ...customRules, [key]: [...customRules[key], rule] };
    await get().updateCustomRules(newRules);
  },

  removeCustomRule: async (type: RuleType, index: number) => {
    const { customRules } = get();
    const key = type === 'allow' ? 'allow' : 'softDeny';
    const list = [...customRules[key]];
    list.splice(index, 1);
    await get().updateCustomRules({ ...customRules, [key]: list });
  },

  updateCustomRules: async (rules: AutoModeCustomRules) => {
    const { settings } = get();
    try {
      set({ saving: true });
      const newSettings = claudeSettingsService.updateCustomRules(settings || {}, rules);
      await claudeSettingsService.writeClaudeSettings(newSettings);
      set({ customRules: rules, settings: newSettings, saving: false });
      await get().fetchConfig();
    } catch (err) {
      log.error('保存规则失败', err instanceof Error ? err : new Error(String(err)));
      set({ error: err instanceof Error ? err.message : String(err), saving: false });
    }
  },

  updateSettings: async (newSettings: ClaudeSettings) => {
    try {
      set({ saving: true });
      await claudeSettingsService.writeClaudeSettings(newSettings);
      const customRules = claudeSettingsService.extractCustomRules(newSettings);
      set({ settings: newSettings, customRules, saving: false });
      await get().fetchConfig();
    } catch (err) {
      log.error('保存 settings 失败', err instanceof Error ? err : new Error(String(err)));
      set({ error: err instanceof Error ? err.message : String(err), saving: false });
    }
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setEditMode: (mode: EditMode) => set({ editMode: mode }),
  clearError: () => set({ error: null }),
}));
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/stores/autoModeStore.ts
git commit -m "feat(auto-mode): extend store with custom rules editing"
```

---

## Task 6: 国际化支持

**Files:**
- Modify: `src/locales/zh-CN/settings.json`
- Modify: `src/locales/en-US/settings.json`

- [ ] **Step 1: 添加中文翻译**

在 `autoMode` 节点添加：

```json
{
  "autoMode": {
    "description": "自动模式控制 Claude 在没有用户确认的情况下可以执行哪些操作",
    "descriptionDetail": "允许规则会自动执行，拒绝规则需要用户确认。这些规则用于保护您的系统和数据安全。",
    "searchPlaceholder": "搜索规则...",
    "allow": "允许",
    "softDeny": "需确认",
    "environment": "环境配置",
    "noResults": "没有找到匹配的规则",
    "noRules": "暂无规则",
    "tabRulesList": "规则列表",
    "tabAdvancedEdit": "高级编辑",
    "myRules": "我的规则",
    "defaultRules": "默认规则",
    "defaultRulesHint": "内置规则，不可修改",
    "addAllowRule": "添加允许规则",
    "addSoftDenyRule": "添加需确认规则",
    "editJson": "直接编辑 settings.json",
    "save": "保存",
    "reset": "重置",
    "ruleName": "规则名称",
    "ruleDescription": "规则描述",
    "confirmDelete": "确定删除此规则？",
    "settingsPath": "配置文件路径",
    "expandDefault": "展开默认规则",
    "collapseDefault": "收起默认规则"
  }
}
```

- [ ] **Step 2: 添加英文翻译**

```json
{
  "autoMode": {
    "description": "Auto mode controls which actions Claude can perform without user confirmation",
    "descriptionDetail": "Allow rules are executed automatically, deny rules require confirmation. These rules protect your system and data.",
    "searchPlaceholder": "Search rules...",
    "allow": "Allow",
    "softDeny": "Require Confirmation",
    "environment": "Environment Configuration",
    "noResults": "No matching rules found",
    "noRules": "No rules",
    "tabRulesList": "Rules List",
    "tabAdvancedEdit": "Advanced Edit",
    "myRules": "My Rules",
    "defaultRules": "Default Rules",
    "defaultRulesHint": "Built-in rules, cannot be modified",
    "addAllowRule": "Add Allow Rule",
    "addSoftDenyRule": "Add Confirmation Rule",
    "editJson": "Edit settings.json directly",
    "save": "Save",
    "reset": "Reset",
    "ruleName": "Rule Name",
    "ruleDescription": "Rule Description",
    "confirmDelete": "Delete this rule?",
    "settingsPath": "Settings File Path",
    "expandDefault": "Expand default rules",
    "collapseDefault": "Collapse default rules"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/zh-CN/settings.json src/locales/en-US/settings.json
git commit -m "feat(auto-mode): add i18n for custom rules editing"
```

---

## Task 7: UI 组件重构

**Files:**
- Modify: `src/components/Settings/tabs/AutoModeTab.tsx`

- [ ] **Step 1: 重构组件**

实现双模式 UI（详见完整代码，包含 TabSwitcher、CustomRulesSection、DefaultRulesSection、AdvancedEditMode）

- [ ] **Step 2: 验证编译和 UI**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/tabs/AutoModeTab.tsx
git commit -m "feat(auto-mode): implement dual-mode UI with rules editing"
```

---

## Task 8: 集成测试

- [ ] **Step 1: 手动测试所有功能**

测试项：
- 读取空 settings.json
- 添加/删除自定义规则
- JSON 编辑模式保存
- 与 CLI 输出一致性

- [ ] **Step 2: Final Commit**

```bash
git add -A
git commit -m "feat(auto-mode): complete auto-mode configuration enhancement"
```
