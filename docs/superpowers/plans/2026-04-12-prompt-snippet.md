# Prompt Snippet 快捷片段 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户可自建 prompt 模板片段，通过 ChatInput 行首输入 `/` 快速调用，模板中的变量在使用时由用户填写或自动注入。

**Architecture:** 后端新增 `PromptSnippet` 模型 + CRUD service（存储于 `.polaris/prompt-snippets.json`），前端通过 Tauri 命令交互。设置页新增 "快捷片段" tab 进行管理。ChatInput 在行首检测 `/` 触发片段建议，选中后弹出变量填写面板，确认后展开模板到输入框。

**Tech Stack:** Rust (Tauri backend), TypeScript + Zustand (frontend), i18next (locales)

---

## File Structure

### 后端（Rust）

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `src-tauri/src/models/prompt_snippet.rs` | 数据模型定义 |
| Modify | `src-tauri/src/models/mod.rs` | 注册新模块 |
| Create | `src-tauri/src/services/prompt_snippet_service.rs` | CRUD 服务 |
| Modify | `src-tauri/src/services/mod.rs` | 注册新模块 |
| Create | `src-tauri/src/commands/prompt_snippet.rs` | Tauri 命令 |
| Modify | `src-tauri/src/commands/mod.rs` | 注册新模块 |
| Modify | `src-tauri/src/lib.rs` | 注册命令到 invoke_handler |

### 前端（TypeScript/React）

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `src/types/promptSnippet.ts` | 前端类型定义 + 变量常量 |
| Modify | `src/services/tauri.ts` | 添加 invoke 包装函数 |
| Create | `src/stores/snippetStore.ts` | Zustand store |
| Create | `src/locales/zh-CN/promptSnippet.json` | 中文文案 |
| Create | `src/locales/en-US/promptSnippet.json` | 英文文案 |
| Modify | `src/i18n/index.ts` | 注册新 namespace |
| Create | `src/components/Settings/tabs/PromptSnippetTab.tsx` | 设置页管理面板 |
| Modify | `src/components/Settings/SettingsSidebar.tsx` | 添加 tab 导航项 |
| Modify | `src/components/Settings/SettingsModal.tsx` | 添加 tab 内容渲染 |
| Modify | `src/components/Chat/FileSuggestion.tsx` | 扩展 SuggestionItem 类型 |
| Create | `src/components/Chat/SnippetParamPanel.tsx` | 片段变量填写浮窗 |
| Modify | `src/components/Chat/ChatInput.tsx` | `/` 触发检测 + 片段选中处理 |
| Modify | `src/locales/zh-CN/settings.json` | 导航项文案 |
| Modify | `src/locales/en-US/settings.json` | 导航项文案 |

---

## Task 1: 后端 — 数据模型

**Files:**
- Create: `src-tauri/src/models/prompt_snippet.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: 创建 prompt_snippet.rs 数据模型**

```rust
/*! 快捷片段数据模型
 *
 * 用户自定义的 prompt 模板片段，支持变量注入。
 */

use serde::{Deserialize, Serialize};

/// 片段变量类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SnippetVarType {
    /// 单行文本
    #[default]
    Text,
    /// 多行文本
    Textarea,
}

/// 片段变量定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetVariable {
    /// 变量键名（对应模板中的 {{key}}）
    pub key: String,
    /// 显示标签
    pub label: String,
    /// 变量类型
    #[serde(rename = "type")]
    pub var_type: SnippetVarType,
    /// 是否必填
    #[serde(default)]
    pub required: bool,
    /// 默认值
    #[serde(default)]
    pub default_value: Option<String>,
    /// 占位提示
    #[serde(default)]
    pub placeholder: Option<String>,
}

/// 快捷片段
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSnippet {
    /// 片段 ID
    pub id: String,
    /// 片段名称（也作为 /name 快捷调用）
    pub name: String,
    /// 描述
    #[serde(default)]
    pub description: Option<String>,
    /// 模板内容，支持 {{variable}} 占位符
    pub content: String,
    /// 用户定义的变量列表
    #[serde(default)]
    pub variables: Vec<SnippetVariable>,
    /// 是否启用
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// 创建时间
    pub created_at: i64,
    /// 更新时间
    pub updated_at: i64,
}

fn default_enabled() -> bool {
    true
}

/// 创建片段参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnippetParams {
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    pub variables: Vec<SnippetVariable>,
    pub enabled: Option<bool>,
}

/// 更新片段参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnippetParams {
    pub name: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub variables: Option<Vec<SnippetVariable>>,
    pub enabled: Option<bool>,
}

/// 片段存储
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SnippetStore {
    pub version: String,
    pub snippets: Vec<PromptSnippet>,
}
```

- [ ] **Step 2: 在 models/mod.rs 中注册模块**

在 `src-tauri/src/models/mod.rs` 中添加：

```rust
pub mod prompt_snippet;
```

添加在 `pub mod prompt;` 之后。

- [ ] **Step 3: 编译验证**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: 编译通过，无错误

---

## Task 2: 后端 — CRUD 服务

**Files:**
- Create: `src-tauri/src/services/prompt_snippet_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: 创建 prompt_snippet_service.rs**

```rust
//! 快捷片段 CRUD 服务

use crate::error::{AppError, Result};
use crate::models::prompt_snippet::{
    CreateSnippetParams, PromptSnippet, SnippetStore, UpdateSnippetParams,
};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct PromptSnippetService {
    store_path: PathBuf,
    cache: Arc<Mutex<Option<SnippetStore>>>,
}

impl PromptSnippetService {
    pub fn new(config_dir: &PathBuf) -> Self {
        let store_path = config_dir.join("prompt-snippets.json");
        Self {
            store_path,
            cache: Arc::new(Mutex::new(None)),
        }
    }

    fn load_store(&self) -> Result<SnippetStore> {
        if let Some(ref cache) = *self.cache.lock().unwrap() {
            return Ok(cache.clone());
        }
        let store = if self.store_path.exists() {
            let content = fs::read_to_string(&self.store_path)?;
            serde_json::from_str(&content).unwrap_or_else(|_| SnippetStore::default())
        } else {
            SnippetStore::default()
        };
        *self.cache.lock().unwrap() = Some(store.clone());
        Ok(store)
    }

    fn save_store(&self, store: &SnippetStore) -> Result<()> {
        if let Some(parent) = self.store_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(store)?;
        fs::write(&self.store_path, content)?;
        *self.cache.lock().unwrap() = Some(store.clone());
        Ok(())
    }

    pub fn list_snippets(&self) -> Result<Vec<PromptSnippet>> {
        let store = self.load_store()?;
        Ok(store.snippets.into_iter().filter(|s| s.enabled).collect())
    }

    pub fn list_all_snippets(&self) -> Result<Vec<PromptSnippet>> {
        let store = self.load_store()?;
        Ok(store.snippets)
    }

    pub fn get_snippet(&self, id: &str) -> Result<Option<PromptSnippet>> {
        let store = self.load_store()?;
        Ok(store.snippets.into_iter().find(|s| s.id == id))
    }

    pub fn create_snippet(&self, params: CreateSnippetParams) -> Result<PromptSnippet> {
        let mut store = self.load_store()?;
        let now = chrono::Utc::now().timestamp_millis();

        let snippet = PromptSnippet {
            id: format!("snippet-{}", uuid::Uuid::new_v4()),
            name: params.name,
            description: params.description,
            content: params.content,
            variables: params.variables,
            enabled: params.enabled.unwrap_or(true),
            created_at: now,
            updated_at: now,
        };

        // 检查名称重复
        if store.snippets.iter().any(|s| s.name == snippet.name) {
            return Err(AppError::Validation(format!(
                "片段名称 '{}' 已存在",
                snippet.name
            )));
        }

        store.snippets.push(snippet.clone());
        store.version = "1.0.0".to_string();
        self.save_store(&store)?;
        Ok(snippet)
    }

    pub fn update_snippet(
        &self,
        id: &str,
        params: UpdateSnippetParams,
    ) -> Result<Option<PromptSnippet>> {
        let mut store = self.load_store()?;

        if let Some(snippet) = store.snippets.iter_mut().find(|s| s.id == id) {
            // 如果改名，检查新名称是否重复
            if let Some(ref new_name) = params.name {
                if new_name != &snippet.name
                    && store.snippets.iter().any(|s| s.name == *new_name)
                {
                    return Err(AppError::Validation(format!(
                        "片段名称 '{}' 已存在",
                        new_name
                    )));
                }
                snippet.name = new_name.clone();
            }
            if let Some(desc) = params.description {
                snippet.description = Some(desc);
            }
            if let Some(content) = params.content {
                snippet.content = content;
            }
            if let Some(variables) = params.variables {
                snippet.variables = variables;
            }
            if let Some(enabled) = params.enabled {
                snippet.enabled = enabled;
            }
            snippet.updated_at = chrono::Utc::now().timestamp_millis();

            let updated = snippet.clone();
            self.save_store(&store)?;
            Ok(Some(updated))
        } else {
            Ok(None)
        }
    }

    pub fn delete_snippet(&self, id: &str) -> Result<bool> {
        let mut store = self.load_store()?;
        let before = store.snippets.len();
        store.snippets.retain(|s| s.id != id);
        let deleted = store.snippets.len() < before;
        if deleted {
            self.save_store(&store)?;
        }
        Ok(deleted)
    }

    pub fn clear_cache(&self) {
        *self.cache.lock().unwrap() = None;
    }
}
```

- [ ] **Step 2: 在 services/mod.rs 中注册模块**

在 `src-tauri/src/services/mod.rs` 中添加：

```rust
pub mod prompt_snippet_service;
```

添加在 `pub mod prompt_store;` 之后。

- [ ] **Step 3: 编译验证**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: 编译通过

---

## Task 3: 后端 — Tauri 命令

**Files:**
- Create: `src-tauri/src/commands/prompt_snippet.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 Tauri 命令**

```rust
//! 快捷片段 Tauri 命令

use crate::error::Result;
use crate::models::prompt_snippet::{
    CreateSnippetParams, PromptSnippet, UpdateSnippetParams,
};
use crate::services::prompt_snippet_service::PromptSnippetService;
use std::path::PathBuf;
use tauri::AppHandle;

fn get_snippet_service(app: &AppHandle) -> Result<PromptSnippetService> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| crate::error::AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    // 使用 .polaris 目录
    let polaris_dir = config_dir.join(".polaris");
    Ok(PromptSnippetService::new(&polaris_dir))
}

#[tauri::command]
pub async fn snippet_list(app: AppHandle) -> Result<Vec<PromptSnippet>> {
    let service = get_snippet_service(&app)?;
    service.list_all_snippets()
}

#[tauri::command]
pub async fn snippet_get(app: AppHandle, id: String) -> Result<Option<PromptSnippet>> {
    let service = get_snippet_service(&app)?;
    service.get_snippet(&id)
}

#[tauri::command]
pub async fn snippet_create(app: AppHandle, params: CreateSnippetParams) -> Result<PromptSnippet> {
    let service = get_snippet_service(&app)?;
    service.create_snippet(params)
}

#[tauri::command]
pub async fn snippet_update(
    app: AppHandle,
    id: String,
    params: UpdateSnippetParams,
) -> Result<Option<PromptSnippet>> {
    let service = get_snippet_service(&app)?;
    service.update_snippet(&id, params)
}

#[tauri::command]
pub async fn snippet_delete(app: AppHandle, id: String) -> Result<bool> {
    let service = get_snippet_service(&app)?;
    service.delete_snippet(&id)
}
```

> **注意**: `get_snippet_service` 中需要确认 config_dir 路径是否与工作区的 `.polaris/` 一致。如果现有代码使用 `get_config_dir(app)` 获取路径，应复用同一 helper。参考 `src-tauri/src/commands/scheduler.rs` 中的 `get_config_dir` 函数。

- [ ] **Step 2: 在 commands/mod.rs 中注册**

在 `src-tauri/src/commands/mod.rs` 中添加：

```rust
pub mod prompt_snippet;
```

- [ ] **Step 3: 在 lib.rs 中注册命令**

在 `src-tauri/src/lib.rs` 中：

1. 顶部 import 区域添加：
```rust
use commands::prompt_snippet::{
    snippet_list, snippet_get, snippet_create, snippet_update, snippet_delete,
};
```

2. 在 `invoke_handler` 的 `generate_handler![]` 宏中添加：
```rust
// Prompt Snippet 相关
snippet_list,
snippet_get,
snippet_create,
snippet_update,
snippet_delete,
```

- [ ] **Step 4: 编译验证**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: 编译通过

- [ ] **Step 5: 提交后端部分**

```bash
git add src-tauri/src/models/prompt_snippet.rs src-tauri/src/models/mod.rs src-tauri/src/services/prompt_snippet_service.rs src-tauri/src/services/mod.rs src-tauri/src/commands/prompt_snippet.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(prompt-snippet): 后端数据模型、CRUD 服务和 Tauri 命令"
```

---

## Task 4: 前端 — 类型定义和 Tauri 包装

**Files:**
- Create: `src/types/promptSnippet.ts`
- Modify: `src/services/tauri.ts`

- [ ] **Step 1: 创建前端类型定义**

```typescript
/**
 * 快捷片段类型定义
 */

/** 片段变量类型 */
export type SnippetVarType = 'text' | 'textarea';

/** 片段变量定义 */
export interface SnippetVariable {
  /** 变量键名（对应模板中的 {{key}}） */
  key: string;
  /** 显示标签 */
  label: string;
  /** 变量类型 */
  type: SnippetVarType;
  /** 是否必填 */
  required: boolean;
  /** 默认值 */
  defaultValue?: string;
  /** 占位提示 */
  placeholder?: string;
}

/** 快捷片段 */
export interface PromptSnippet {
  id: string;
  name: string;
  description?: string;
  /** 模板内容，支持 {{variable}} 占位符 */
  content: string;
  /** 用户定义的变量列表 */
  variables: SnippetVariable[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 创建片段参数 */
export interface CreateSnippetParams {
  name: string;
  description?: string;
  content: string;
  variables: SnippetVariable[];
  enabled?: boolean;
}

/** 更新片段参数 */
export interface UpdateSnippetParams {
  name?: string;
  description?: string;
  content?: string;
  variables?: SnippetVariable[];
  enabled?: boolean;
}

/** 自动注入变量（系统提供，无需用户填写） */
export const AUTO_VARIABLES = [
  { key: 'date', label: '当前日期', description: 'YYYY-MM-DD' },
  { key: 'time', label: '当前时间', description: 'HH:MM' },
  { key: 'workspaceName', label: '工作区名称', description: '当前工作区' },
  { key: 'workspacePath', label: '工作区路径', description: '当前工作区路径' },
] as const;

/** 从模板内容中提取变量占位符 */
export function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  const vars = [...new Set(matches.map(m => m.slice(2, -2)))];
  // 排除自动注入变量
  const autoKeys = AUTO_VARIABLES.map(v => v.key);
  return vars.filter(v => !autoKeys.includes(v));
}
```

- [ ] **Step 2: 在 tauri.ts 中添加 invoke 包装**

在 `src/services/tauri.ts` 末尾添加：

```typescript
// ===== Prompt Snippet =====

/** 列出所有快捷片段 */
export async function snippetList(): Promise<PromptSnippet[]> {
  return invoke<PromptSnippet[]>('snippet_list');
}

/** 获取单个快捷片段 */
export async function snippetGet(id: string): Promise<PromptSnippet | null> {
  return invoke<PromptSnippet | null>('snippet_get', { id });
}

/** 创建快捷片段 */
export async function snippetCreate(params: CreateSnippetParams): Promise<PromptSnippet> {
  return invoke<PromptSnippet>('snippet_create', { params });
}

/** 更新快捷片段 */
export async function snippetUpdate(id: string, params: UpdateSnippetParams): Promise<PromptSnippet | null> {
  return invoke<PromptSnippet | null>('snippet_update', { id, params });
}

/** 删除快捷片段 */
export async function snippetDelete(id: string): Promise<boolean> {
  return invoke<boolean>('snippet_delete', { id });
}
```

同时在 tauri.ts 顶部 import 区域添加类型导入：

```typescript
import type { PromptSnippet, CreateSnippetParams, UpdateSnippetParams } from '../types/promptSnippet';
```

- [ ] **Step 3: TypeScript 编译检查**

Run: `cd /d/space/base/Polaris && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误（可能与未使用的导入相关，修复即可）

---

## Task 5: 前端 — Zustand Store

**Files:**
- Create: `src/stores/snippetStore.ts`

- [ ] **Step 1: 创建 snippetStore**

```typescript
/**
 * 快捷片段状态管理
 */

import { create } from 'zustand';
import * as tauri from '../services/tauri';
import type { PromptSnippet, CreateSnippetParams, UpdateSnippetParams } from '../types/promptSnippet';
import { createLogger } from '../utils/logger';

const log = createLogger('SnippetStore');

interface SnippetState {
  snippets: PromptSnippet[];
  loading: boolean;
  error: string | null;

  loadSnippets: () => Promise<void>;
  createSnippet: (params: CreateSnippetParams) => Promise<PromptSnippet>;
  updateSnippet: (id: string, params: UpdateSnippetParams) => Promise<PromptSnippet | null>;
  deleteSnippet: (id: string) => Promise<boolean>;
  searchSnippets: (query: string) => PromptSnippet[];
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  snippets: [],
  loading: false,
  error: null,

  loadSnippets: async () => {
    set({ loading: true, error: null });
    try {
      const snippets = await tauri.snippetList();
      set({ snippets, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('加载片段失败', err instanceof Error ? err : new Error(msg));
      set({ error: msg, loading: false });
    }
  },

  createSnippet: async (params) => {
    const snippet = await tauri.snippetCreate(params);
    set(state => ({ snippets: [...state.snippets, snippet] }));
    return snippet;
  },

  updateSnippet: async (id, params) => {
    const result = await tauri.snippetUpdate(id, params);
    if (result) {
      set(state => ({
        snippets: state.snippets.map(s => (s.id === id ? result : s)),
      }));
    }
    return result;
  },

  deleteSnippet: async (id) => {
    const deleted = await tauri.snippetDelete(id);
    if (deleted) {
      set(state => ({
        snippets: state.snippets.filter(s => s.id !== id),
      }));
    }
    return deleted;
  },

  searchSnippets: (query) => {
    const { snippets } = get();
    if (!query) return snippets.filter(s => s.enabled);
    const lower = query.toLowerCase();
    return snippets.filter(
      s =>
        s.enabled &&
        (s.name.toLowerCase().includes(lower) ||
          (s.description?.toLowerCase().includes(lower) ?? false))
    );
  },
}));
```

---

## Task 6: 前端 — 国际化

**Files:**
- Create: `src/locales/zh-CN/promptSnippet.json`
- Create: `src/locales/en-US/promptSnippet.json`
- Modify: `src/locales/zh-CN/settings.json` — 添加导航项
- Modify: `src/locales/en-US/settings.json` — 添加导航项
- Modify: `src/i18n/index.ts` — 注册 namespace

- [ ] **Step 1: 创建中文 locale**

```json
{
  "title": "快捷片段",
  "description": "自定义 prompt 模板，在聊天中通过 / 快速调用",
  "empty": "暂无片段，点击上方按钮创建",
  "create": "新建片段",
  "edit": "编辑",
  "delete": "删除",
  "deleteConfirm": "确定删除片段「{{name}}」吗？",
  "save": "保存",
  "cancel": "取消",
  "form": {
    "name": "片段名称",
    "namePlaceholder": "例如：code-review",
    "nameHint": "用于 /name 快捷调用，不可重复",
    "description": "描述",
    "descriptionPlaceholder": "片段用途简述",
    "content": "模板内容",
    "contentPlaceholder": "请审查以下代码，重点关注 {{focus}}：\n\n{{code}}",
    "contentHint": "使用 {{变量名}} 定义变量占位符",
    "enabled": "启用"
  },
  "variables": {
    "title": "模板变量",
    "add": "添加变量",
    "key": "变量名",
    "keyPlaceholder": "focus",
    "label": "显示标签",
    "labelPlaceholder": "关注点",
    "type": "类型",
    "typeText": "单行文本",
    "typeTextarea": "多行文本",
    "required": "必填",
    "defaultValue": "默认值",
    "placeholder": "占位提示",
    "remove": "移除",
    "autoVars": "自动变量（无需定义，可直接在模板中使用）",
    "autoVarDate": "{{date}} — 当前日期",
    "autoVarTime": "{{time}} — 当前时间",
    "autoVarWorkspace": "{{workspaceName}} — 工作区名称",
    "autoVarPath": "{{workspacePath}} — 工作区路径"
  },
  "chat": {
    "triggerHint": "输入片段名称继续筛选",
    "fillParams": "填写变量",
    "expand": "展开"
  },
  "toast": {
    "created": "片段「{{name}}」创建成功",
    "updated": "片段「{{name}}」更新成功",
    "deleted": "片段已删除",
    "nameDuplicate": "片段名称已存在"
  }
}
```

- [ ] **Step 2: 创建英文 locale**

```json
{
  "title": "Prompt Snippets",
  "description": "Custom prompt templates, quickly invoked with / in chat",
  "empty": "No snippets yet. Click the button above to create one.",
  "create": "New Snippet",
  "edit": "Edit",
  "delete": "Delete",
  "deleteConfirm": "Delete snippet \"{{name}}\"?",
  "save": "Save",
  "cancel": "Cancel",
  "form": {
    "name": "Name",
    "namePlaceholder": "e.g. code-review",
    "nameHint": "Used as /name for quick invocation, must be unique",
    "description": "Description",
    "descriptionPlaceholder": "Brief description of this snippet",
    "content": "Template Content",
    "contentPlaceholder": "Review the following code, focusing on {{focus}}:\n\n{{code}}",
    "contentHint": "Use {{variableName}} to define variable placeholders",
    "enabled": "Enabled"
  },
  "variables": {
    "title": "Template Variables",
    "add": "Add Variable",
    "key": "Variable Key",
    "keyPlaceholder": "focus",
    "label": "Display Label",
    "labelPlaceholder": "Focus area",
    "type": "Type",
    "typeText": "Text",
    "typeTextarea": "Textarea",
    "required": "Required",
    "defaultValue": "Default Value",
    "placeholder": "Placeholder Hint",
    "remove": "Remove",
    "autoVars": "Auto Variables (available without definition)",
    "autoVarDate": "{{date}} — Current date",
    "autoVarTime": "{{time}} — Current time",
    "autoVarWorkspace": "{{workspaceName}} — Workspace name",
    "autoVarPath": "{{workspacePath}} — Workspace path"
  },
  "chat": {
    "triggerHint": "Type snippet name to filter",
    "fillParams": "Fill Variables",
    "expand": "Expand"
  },
  "toast": {
    "created": "Snippet \"{{name}}\" created",
    "updated": "Snippet \"{{name}}\" updated",
    "deleted": "Snippet deleted",
    "nameDuplicate": "Snippet name already exists"
  }
}
```

- [ ] **Step 3: 在 settings.json 中添加导航项**

在 `src/locales/zh-CN/settings.json` 的 `nav` 区域添加：

```json
"promptSnippet": "快捷片段"
```

在 `src/locales/en-US/settings.json` 的 `nav` 区域添加：

```json
"promptSnippet": "Prompt Snippets"
```

- [ ] **Step 4: 在 i18n/index.ts 中注册 namespace**

1. 添加 import：
```typescript
import zhCNPromptSnippet from '../locales/zh-CN/promptSnippet.json';
import enUSPromptSnippet from '../locales/en-US/promptSnippet.json';
```

2. 在 `resources` 的 `zh-CN` 和 `en-US` 对象中添加：
```typescript
promptSnippet: zhCNPromptSnippet,
// ...
promptSnippet: enUSPromptSnippet,
```

---

## Task 7: 前端 — 设置页 Tab

**Files:**
- Create: `src/components/Settings/tabs/PromptSnippetTab.tsx`
- Modify: `src/components/Settings/SettingsSidebar.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx`
- Modify: `src/components/Common/Icons.tsx` — 添加图标（可选，可复用现有图标）

- [ ] **Step 1: 在 SettingsSidebar.tsx 中注册 tab**

1. `SettingsTabId` 类型添加 `'prompt-snippet'`
2. `NAV_ITEMS` 数组添加导航项（放在 `system-prompt` 之后）：

```tsx
{ id: 'prompt-snippet', icon: <IconMessageSquareText size={16} />, labelKey: 'nav.promptSnippet' },
```

> 可复用 `IconMessageSquareText` 图标，与 system-prompt 相同。如果需要独立图标后续替换。

- [ ] **Step 2: 在 SettingsModal.tsx 中注册 tab**

1. 顶部 import 添加：
```typescript
import { PromptSnippetTab } from './tabs/PromptSnippetTab';
```

2. `TAB_TITLE_KEYS` 添加：
```typescript
'prompt-snippet': 'nav.promptSnippet',
```

3. 渲染区域添加（在 `system-prompt` block 之后）：
```tsx
{activeTab === 'prompt-snippet' && <PromptSnippetTab />}
```

- [ ] **Step 3: 创建 PromptSnippetTab.tsx**

此组件是片段管理面板，包含：
- 片段列表（名称、描述、启用状态、编辑/删除按钮）
- 新建/编辑表单（名称、描述、模板内容、变量定义）
- 变量定义区域（动态添加/删除变量行）

组件不接收 `config`/`onConfigChange` props（片段独立于主配置），使用 `useSnippetStore` 直接管理状态。

```tsx
/**
 * 设置页 — 快捷片段管理
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSnippetStore } from '../../../stores/snippetStore';
import { useToastStore } from '../../../stores';
import type { PromptSnippet, SnippetVariable, CreateSnippetParams, UpdateSnippetParams } from '../../../types/promptSnippet';
import { extractVariables, AUTO_VARIABLES } from '../../../types/promptSnippet';

interface SnippetFormData {
  name: string;
  description: string;
  content: string;
  variables: SnippetVariable[];
  enabled: boolean;
}

const EMPTY_FORM: SnippetFormData = {
  name: '',
  description: '',
  content: '',
  variables: [],
  enabled: true,
};

export function PromptSnippetTab() {
  const { t } = useTranslation('promptSnippet');
  const { snippets, loadSnippets, createSnippet, updateSnippet, deleteSnippet } = useSnippetStore();
  const { addToast } = useToastStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SnippetFormData>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadSnippets(); }, [loadSnippets]);

  // 开始新建
  const handleCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  // 开始编辑
  const handleEdit = (snippet: PromptSnippet) => {
    setEditingId(snippet.id);
    setForm({
      name: snippet.name,
      description: snippet.description ?? '',
      content: snippet.content,
      variables: [...snippet.variables],
      enabled: snippet.enabled,
    });
    setShowForm(true);
  };

  // 保存
  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    try {
      if (editingId) {
        const params: UpdateSnippetParams = {
          name: form.name,
          description: form.description || undefined,
          content: form.content,
          variables: form.variables,
          enabled: form.enabled,
        };
        await updateSnippet(editingId, params);
        addToast(t('toast.updated', { name: form.name }), 'success');
      } else {
        const params: CreateSnippetParams = {
          name: form.name,
          description: form.description || undefined,
          content: form.content,
          variables: form.variables,
          enabled: form.enabled,
        };
        await createSnippet(params);
        addToast(t('toast.created', { name: form.name }), 'success');
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message.message : String(err);
      addToast(msg, 'error');
    }
  };

  // 删除
  const handleDelete = async (snippet: PromptSnippet) => {
    if (!confirm(t('deleteConfirm', { name: snippet.name }))) return;
    await deleteSnippet(snippet.id);
    addToast(t('toast.deleted'), 'success');
  };

  // 添加变量
  const addVariable = () => {
    setForm(prev => ({
      ...prev,
      variables: [
        ...prev.variables,
        { key: '', label: '', type: 'text', required: false },
      ],
    }));
  };

  // 更新变量
  const updateVariable = (index: number, field: keyof SnippetVariable, value: string | boolean) => {
    setForm(prev => {
      const vars = [...prev.variables];
      vars[index] = { ...vars[index], [field]: value };
      return { ...prev, variables: vars };
    });
  };

  // 删除变量
  const removeVariable = (index: number) => {
    setForm(prev => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  };

  // 从内容自动提取变量
  const extractFromContent = useCallback(() => {
    const keys = extractVariables(form.content);
    const existing = new Set(form.variables.map(v => v.key));
    const newVars = keys
      .filter(k => !existing.has(k))
      .map(key => ({
        key,
        label: key,
        type: 'text' as const,
        required: false,
        placeholder: undefined,
        defaultValue: undefined,
      }));
    if (newVars.length > 0) {
      setForm(prev => ({ ...prev, variables: [...prev.variables, ...newVars] }));
    }
  }, [form.content, form.variables]);

  // --- 渲染 ---
  // 此处包含列表视图和编辑表单两个区域
  // 具体布局参考现有 tab 风格：左侧列表 + 右侧编辑

  // （完整 JSX 渲染逻辑，包含列表、表单、变量定义区域）
  // 布局结构：
  // 1. 顶部：标题 + 新建按钮
  // 2. 列表区：每个片段一行（名称、描述、启用开关、编辑/删除按钮）
  // 3. 编辑区（showForm 时显示）：表单字段 + 变量定义 + 保存/取消
  // 4. 底部：自动变量说明
}
```

> **渲染细节说明**：完整的 JSX 需要根据项目现有的 tab 设计风格（如 `SystemPromptTab.tsx`）来对齐，包括：
> - 表单输入框样式：`bg-surface border border-border rounded-lg px-3 py-2 text-sm`
> - 按钮样式：`bg-primary text-white rounded-lg px-4 py-2`
> - 列表项样式：`border-b border-border-subtle p-3 hover:bg-surface`
> - 变量定义区域：动态列表，每行一个变量（key、label、type 下拉、required 复选框、删除按钮）
> - "从模板内容提取变量"按钮：点击后自动将模板中的 `{{xxx}}` 解析为变量定义

- [ ] **Step 4: 提交设置页部分**

```bash
git add src/components/Settings/ src/locales/ src/i18n/index.ts src/types/promptSnippet.ts src/services/tauri.ts src/stores/snippetStore.ts
git commit -m "feat(prompt-snippet): 前端类型、store、国际化和管理设置页"
```

---

## Task 8: 前端 — ChatInput 集成（核心交互）

**Files:**
- Modify: `src/components/Chat/FileSuggestion.tsx` — 扩展 SuggestionItem
- Create: `src/components/Chat/SnippetParamPanel.tsx` — 变量填写浮窗
- Modify: `src/components/Chat/ChatInput.tsx` — `/` 触发 + 片段选中

这是最关键的交互任务。分三个子步骤。

### 8a: 扩展 SuggestionItem 支持 snippet 类型

- [ ] **Step 8a-1: 修改 FileSuggestion.tsx 中的 SuggestionItem**

```typescript
// 之前
export interface SuggestionItem {
  type: 'workspace' | 'file';
  data: Workspace | FileMatch;
}

// 之后
export interface SuggestionItem {
  type: 'workspace' | 'file' | 'snippet';
  data: Workspace | FileMatch | PromptSnippet;
}
```

添加 import：
```typescript
import type { PromptSnippet } from '../../types/promptSnippet';
```

- [ ] **Step 8a-2: 在 UnifiedSuggestion 中添加 snippet 渲染**

在 `UnifiedSuggestion` 组件中，添加第三组渲染逻辑（workspace → file → snippet），snippet 项显示：名称 + 描述。

```tsx
// 在文件项过滤之后，添加 snippet 过滤和渲染
const snippetItems = items.filter(i => i.type === 'snippet');

// 渲染 snippet 组（在文件组之后）
{snippetItems.length > 0 && (
  <>
    <div className="sticky top-0 bg-background-elevated z-10 px-3 py-1.5 text-xs font-medium text-text-tertiary border-b border-border-subtle">
      {t('chat.snippetGroupLabel')}
    </div>
    {snippetItems.map((item) => {
      const snippet = item.data as PromptSnippet;
      const globalIdx = items.findIndex(i => i === item);
      return (
        <div
          key={snippet.id}
          data-index={globalIdx}
          className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${
            globalIdx === selectedIndex
              ? 'bg-primary/20 text-text-primary'
              : 'text-text-secondary hover:bg-background-hover'
          }`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => onHover(globalIdx)}
        >
          <span className="font-mono text-sm">/{snippet.name}</span>
          {snippet.description && (
            <span className="text-xs text-text-tertiary truncate">{snippet.description}</span>
          )}
        </div>
      );
    })}
  </>
)}
```

### 8b: 创建 SnippetParamPanel 变量填写浮窗

- [ ] **Step 8b-1: 创建 SnippetParamPanel.tsx**

当用户选中一个包含用户变量的片段时，弹出此面板让用户填写变量值。

```tsx
/**
 * 片段变量填写浮窗
 *
 * 选中片段后，如果有用户变量需要填写，弹出此面板。
 * 填写完成后将模板展开到输入框。
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PromptSnippet, SnippetVariable } from '../../types/promptSnippet';

interface SnippetParamPanelProps {
  snippet: PromptSnippet;
  onExpand: (expandedContent: string) => void;
  onCancel: () => void;
}

export function SnippetParamPanel({ snippet, onExpand, onCancel }: SnippetParamPanelProps) {
  const { t } = useTranslation('promptSnippet');

  // 初始化变量值（使用默认值）
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of snippet.variables) {
      init[v.key] = v.defaultValue ?? '';
    }
    return init;
  });

  const handleExpand = () => {
    let content = snippet.content;
    // 替换用户变量
    for (const [key, value] of Object.entries(values)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    // 替换自动变量（此处仅做简单替换，完整替换在展开时统一处理）
    onExpand(content);
  };

  // 如果片段没有用户变量，直接展开
  if (snippet.variables.length === 0) {
    handleExpand();
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 px-3 z-10">
      <div className="bg-background-elevated border border-border rounded-xl shadow-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">
            /{snippet.name} — {t('chat.fillParams')}
          </span>
          <button
            onClick={onCancel}
            className="text-text-tertiary hover:text-text-primary text-sm"
          >
            ✕
          </button>
        </div>

        {snippet.variables.map(v => (
          <div key={v.key} className="space-y-1">
            <label className="text-xs text-text-secondary">
              {v.label}
              {v.required && <span className="text-danger ml-1">*</span>}
            </label>
            {v.type === 'textarea' ? (
              <textarea
                value={values[v.key] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={v.placeholder}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary resize-none"
                rows={3}
              />
            ) : (
              <input
                type="text"
                value={values[v.key] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={v.placeholder}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            )}
          </div>
        ))}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleExpand}
            className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover"
          >
            {t('chat.expand')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 8c: ChatInput 中添加 `/` 触发逻辑

- [ ] **Step 8c-1: 在 ChatInput.tsx 中添加 `/` 触发检测**

在 `handleInputChange` 的**最前面**（所有 `@` 检测之前），插入 `/` 行首检测：

```typescript
// === 片段触发检测（必须在所有 @ 检测之前） ===
// 仅在输入内容开头为 / 时触发（排除 @ 后的路径中的 /）
if (newValue.startsWith('/') && !newValue.includes('@')) {
  const query = newValue.slice(1).toLowerCase();
  const { snippets } = useSnippetStore.getState();
  const matched = snippets
    .filter(s => s.enabled && s.name.toLowerCase().startsWith(query))
    .map(s => ({ type: 'snippet' as const, data: s }));

  if (matched.length > 0) {
    setSuggestionItems(matched);
    setSelectedIndex(0);
    setShowSuggestions(true);
    setSuggestionMode('snippet');
    const position = calculateSuggestionPosition();
    setSuggestionPosition({ top: position.top, left: position.left });
    return; // 不继续走 @ 检测
  }
}
```

- [ ] **Step 8c-2: 处理片段选中后的变量填写/展开**

在 `selectSuggestion` 中添加 snippet 分支：

```typescript
if (item.type === 'snippet') {
  const snippet = item.data as PromptSnippet;
  // 如果有用户变量，显示填写面板
  if (snippet.variables.length > 0) {
    setActiveSnippet(snippet);
  } else {
    // 无变量，直接展开（替换自动变量后填入输入框）
    const expanded = resolveAutoVariables(snippet.content);
    setLocalText(expanded);
    setShowSuggestions(false);
    setSuggestionItems([]);
  }
  return;
}
```

- [ ] **Step 8c-3: 添加 activeSnippet 状态和 SnippetParamPanel 渲染**

在 ChatInput 中添加状态：

```typescript
const [activeSnippet, setActiveSnippet] = useState<PromptSnippet | null>(null);
```

在 JSX 中渲染（与 QuestionFloatingPanel 类似的位置）：

```tsx
{activeSnippet && (
  <SnippetParamPanel
    snippet={activeSnippet}
    onExpand={(content) => {
      const expanded = resolveAutoVariables(content);
      setLocalText(expanded);
      setActiveSnippet(null);
      debouncedPersistDraft(expanded, attachments);
      textareaRef.current?.focus();
    }}
    onCancel={() => setActiveSnippet(null)}
  />
)}
```

- [ ] **Step 8c-4: 添加 resolveAutoVariables 辅助函数**

在 ChatInput.tsx 中或在单独的 util 中添加：

```typescript
function resolveAutoVariables(content: string): string {
  const now = new Date();
  return content
    .replace(/\{\{date\}\}/g, now.toLocaleDateString())
    .replace(/\{\{time\}\}/g, now.toLocaleTimeString())
    .replace(/\{\{workspaceName\}\}/g, currentWorkspace?.name ?? '')
    .replace(/\{\{workspacePath\}\}/g, currentWorkspace?.path ?? '');
}
```

> **注意**: 此函数与 `workspaceReference.ts` 中的 `resolveTemplateVariables` 功能重叠，可直接复用或提取为共享函数。建议直接调用 `resolveTemplateVariables(content, { workspaceName, workspacePath, contextWorkspaces })`。

- [ ] **Step 8c-5: 更新 handleKeyDown 和 handleSend**

在 `handleKeyDown` 中，当建议框处于 snippet 模式且按 Enter 时，应选择片段而非发送消息（现有逻辑已覆盖，因为 `showSuggestions` 为 true 时 Enter 会调用 `selectSuggestion`）。

在 `handleSend` 中无需特殊处理——展开后的文本就是普通消息。

- [ ] **Step 8c-6: 确保建议框显示 snippet 时仍支持键盘导航**

现有的 ArrowUp/ArrowDown/Tab/Escape 处理已覆盖所有 SuggestionItem 类型，无需额外修改。

- [ ] **Step 8c-7: 提交 ChatInput 集成**

```bash
git add src/components/Chat/FileSuggestion.tsx src/components/Chat/SnippetParamPanel.tsx src/components/Chat/ChatInput.tsx
git commit -m "feat(prompt-snippet): ChatInput 行首 / 触发片段建议和变量填写"
```

---

## Task 9: 集成验证

- [ ] **Step 1: 后端编译检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过

- [ ] **Step 2: 前端 TypeScript 检查**

Run: `cd /d/space/base/Polaris && npx tsc --noEmit 2>&1 | head -20`
Expected: 零错误

- [ ] **Step 3: 启动应用手动测试**

1. 打开设置 → 确认"快捷片段"tab 可见
2. 创建一个片段：name=`review`, content=`请审查以下代码，重点关注 {{focus}}：\n\n{{code}}`
3. 添加变量：focus (text, placeholder="安全性/性能/可读性"), code (textarea)
4. 保存，确认列表显示
5. 在聊天输入框中输入 `/re` → 确认出现 `review` 建议
6. 选中 → 确认弹出变量填写面板
7. 填写 focus 和 code → 点击"展开"
8. 确认输入框中出现完整展开的文本
9. 输入 `@` → 确认文件建议正常工作（不与 `/` 冲突）
10. 输入 `@/src/main.ts` → 确认路径中的 `/` 不会触发片段建议

- [ ] **Step 4: 提交最终状态**

如果有任何修复：
```bash
git add -A
git commit -m "fix(prompt-snippet): 集成验证修复"
```
