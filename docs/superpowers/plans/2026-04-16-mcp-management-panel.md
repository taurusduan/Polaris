# MCP 管理面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Polaris 添加 MCP 服务器可视化管理面板，包含左侧面板卡片视图 + Settings 配置面板

**Architecture:** Rust 后端新建 McpManagerService，通过读取配置文件 + 调用 CLI 健康检查获取聚合数据，前端通过 Tauri commands 获取数据，Zustand store 管理状态

**Tech Stack:** Rust (Tauri commands + service) / TypeScript / React / Zustand / Tailwind CSS / Mermaid / react-i18next

**Phase:** Phase 1 (只读查看 + 连接管理 + 健康检查轮询)

---

## File Structure

### Rust 后端（新建）

| 文件 | 职责 |
|------|------|
| `src-tauri/src/services/mcp_manager_service.rs` | MCP 管理核心 service：配置读取、CLI 健康检查、聚合 |
| `src-tauri/src/commands/mcp_manager.rs` | Tauri commands 暴露给前端 |

### Rust 后端（修改）

| 文件 | 变更 |
|------|------|
| `src-tauri/src/lib.rs` | 注册新 commands + 管理 McpManagerService state |

### 前端（新建）

| 文件 | 职责 |
|------|------|
| `src/types/mcp.ts` | MCP 相关类型定义 |
| `src/services/mcpService.ts` | Tauri invoke 封装 |
| `src/stores/mcpStore.ts` | Zustand store |
| `src/components/Mcp/index.ts` | 模块导出 |
| `src/components/Mcp/McpPanel.tsx` | 左侧面板主容器 |
| `src/components/Mcp/McpServerCard.tsx` | 服务器卡片 |
| `src/components/Mcp/McpServerDetail.tsx` | 详情展开区 |
| `src/components/Mcp/McpSettingsTab.tsx` | Settings 面板 |
| `src/components/Mcp/McpTopologyDiagram.tsx` | Mermaid 拓扑图 |
| `src/components/Mcp/hooks/useMcpHealthPolling.ts` | 健康检查轮询 |
| `src/locales/zh/mcp.json` | 中文翻译 |
| `src/locales/en/mcp.json` | 英文翻译 |

### 前端（修改）

| 文件 | 变更 |
|------|------|
| `src/stores/viewStore.ts` | LeftPanelType 添加 `'mcp'` |
| `src/stores/index.ts` | 导出 useMcpStore |
| `src/components/Layout/ActivityBar.tsx` | panelButtons 添加 MCP 条目 |
| `src/components/Layout/LeftPanel.tsx` | LeftPanelContent 添加 mcp case |
| `src/App.tsx` | lazy import McpPanel + 传递 content prop |
| `src/components/Settings/SettingsSidebar.tsx` | SettingsTabId + NAV_ITEMS |
| `src/components/Settings/SettingsModal.tsx` | TAB_TITLE_KEYS + 条件渲染 |

---

## Task 1: Rust 类型定义

**Files:**
- Create: `src-tauri/src/services/mcp_manager_service.rs`

- [ ] **Step 1: 创建 mcp_manager_service.rs 文件，写入类型定义和 struct 骨架**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::AppHandle;

use crate::error::{AppError, Result};

/// MCP 传输类型
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    Stdio,
    Sse,
    Http,
}

/// MCP 配置范围
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpScope {
    Local,
    User,
    Project,
    Plugin,
}

/// 单个 MCP 服务器的配置信息
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub name: String,
    pub command_or_url: String,
    pub args: Vec<String>,
    pub transport: McpTransport,
    pub scope: McpScope,
    pub env: HashMap<String, String>,
}

/// 健康检查结果
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct McpHealthStatus {
    pub name: String,
    pub connected: bool,
    pub needs_auth: bool,
    pub error: Option<String>,
    pub checked_at: String,
}

/// 前端消费的聚合视图
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct McpServerAggregate {
    pub info: McpServerInfo,
    pub health: Option<McpHealthStatus>,
    pub tools: Vec<String>,
}

/// MCP 管理核心 service
pub struct McpManagerService {
    claude_path: String,
}

impl McpManagerService {
    pub fn new(claude_path: String) -> Self {
        Self { claude_path }
    }

    /// 构建命令（Windows 抑制控制台窗口）
    #[cfg(windows)]
    fn build_command(&self) -> std::process::Command {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = std::process::Command::new(&self.claude_path);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    #[cfg(not(windows))]
    fn build_command(&self) -> std::process::Command {
        std::process::Command::new(&self.claude_path)
    }

    /// 执行 claude 命令并返回 stdout
    fn execute_claude(&self, args: &[&str]) -> Result<String> {
        let mut cmd = self.build_command();
        cmd.args(args);
        let output = cmd.output().map_err(|e| {
            AppError::ProcessError(format!("Failed to execute claude: {}", e))
        })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::ProcessError(format!(
                "claude command failed: {}",
                stderr
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}
```

- [ ] **Step 2: 确认编译通过**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -5`
Expected: 无 error（可能有 unused warnings，正常）

---

## Task 2: 配置文件读取 + 健康检查实现

**Files:**
- Modify: `src-tauri/src/services/mcp_manager_service.rs`

- [ ] **Step 1: 在 McpManagerService impl 中添加配置读取和健康检查方法**

在 `execute_claude` 方法之后，`impl McpManagerService` 块内追加：

```rust
    /// 读取所有 scope 的 MCP 配置文件，合并去重
    pub fn list_configs(&self, workspace_path: &Path) -> Result<Vec<McpServerInfo>> {
        let mut servers: Vec<McpServerInfo> = Vec::new();
        let mut seen_names = std::collections::HashSet::new();

        // 读取优先级从低到高
        let sources: Vec<(McpScope, Vec<std::path::PathBuf>)> = vec![
            (McpScope::User, vec![
                dirs::home_dir()
                    .map(|h| h.join(".claude").join("settings.json"))
                    .unwrap_or_default(),
            ]),
            (McpScope::Project, vec![
                workspace_path.join(".mcp.json"),
                workspace_path.join(".claude").join("settings.json"),
            ]),
            (McpScope::Local, vec![
                workspace_path.join(".claude").join("settings.local.json"),
            ]),
        ];

        for (scope, paths) in sources {
            for path in paths {
                if !path.exists() {
                    continue;
                }
                match self.read_mcp_config(&path, &scope) {
                    Ok(mut configs) => {
                        for config in configs.drain(..) {
                            if seen_names.insert(config.name.clone()) {
                                servers.push(config);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to read MCP config {:?}: {}", path, e);
                    }
                }
            }
        }

        Ok(servers)
    }

    /// 从单个配置文件读取 MCP 服务器列表
    fn read_mcp_config(
        &self,
        path: &Path,
        scope: &McpScope,
    ) -> Result<Vec<McpServerInfo>> {
        let content = std::fs::read_to_string(path).map_err(|e| {
            AppError::IoError(format!("Failed to read {:?}: {}", path, e))
        })?;

        let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
            AppError::ParseError(format!("Invalid JSON in {:?}: {}", path, e))
        })?;

        let mcp_servers = value
            .get("mcpServers")
            .or_else(|| value.get("mcp_servers"))
            .and_then(|v| v.as_object());

        let mut servers = Vec::new();
        if let Some(obj) = mcp_servers {
            for (name, config) in obj {
                if let Some(info) = self.parse_server_config(name, config, scope) {
                    servers.push(info);
                }
            }
        }

        Ok(servers)
    }

    /// 解析单个服务器配置
    fn parse_server_config(
        &self,
        name: &str,
        config: &serde_json::Value,
        scope: &McpScope,
    ) -> Option<McpServerInfo> {
        let transport_str = config
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("stdio");
        let transport = match transport_str {
            "http" => McpTransport::Http,
            "sse" => McpTransport::Sse,
            _ => McpTransport::Stdio,
        };

        let command_or_url = config
            .get("url")
            .and_then(|v| v.as_str())
            .or_else(|| config.get("command").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string();

        let args = config
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let env = config
            .get("env")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        Some(McpServerInfo {
            name: name.to_string(),
            command_or_url,
            args,
            transport,
            scope: scope.clone(),
            env,
        })
    }

    /// 调用 `claude mcp list` 解析健康状态
    pub fn health_check(&self) -> Result<Vec<McpHealthStatus>> {
        let output = self.execute_claude(&["mcp", "list"])?;
        self.parse_mcp_list_output(&output)
    }

    /// 调用 `claude mcp get <name>` 获取单个服务器健康状态
    pub fn health_check_one(&self, name: &str) -> Result<McpHealthStatus> {
        let output = self.execute_claude(&["mcp", "get", name])?;
        self.parse_mcp_get_output(name, &output)
    }

    /// 解析 `claude mcp list` 输出
    fn parse_mcp_list_output(&self, output: &str) -> Result<Vec<McpHealthStatus>> {
        let now = chrono::Utc::now().to_rfc3339();
        let mut statuses = Vec::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() || line.contains("Checking MCP") {
                continue;
            }

            // 格式: <name>: <command_or_url> [(<transport>)] - <status>
            // 分割状态部分
            let parts: Vec<&str> = line.splitn(2, " - ").collect();
            if parts.len() != 2 {
                continue;
            }

            let left = parts[0].trim();
            let status_str = parts[1].trim();

            // 提取 name（第一个 ": " 之前）
            let name = if let Some(idx) = left.find(": ") {
                left[..idx].to_string()
            } else {
                continue;
            };

            let (connected, needs_auth, error) = if status_str.contains("✓ Connected") {
                (true, false, None)
            } else if status_str.contains("Needs authentication") {
                (false, true, None)
            } else if status_str.starts_with("✗") || status_str.contains("Error") {
                (false, false, Some(status_str.to_string()))
            } else {
                (false, false, None)
            };

            statuses.push(McpHealthStatus {
                name,
                connected,
                needs_auth,
                error,
                checked_at: now.clone(),
            });
        }

        Ok(statuses)
    }

    /// 解析 `claude mcp get <name>` 输出
    fn parse_mcp_get_output(&self, name: &str, output: &str) -> Result<McpHealthStatus> {
        let now = chrono::Utc::now().to_rfc3339();

        let connected = output.contains("✓ Connected");
        let needs_auth = output.contains("Needs authentication");
        let error = if !connected && !needs_auth {
            if output.contains("✗") {
                output.lines()
                    .find(|l| l.contains("✗") || l.contains("Error"))
                    .map(|l| l.trim().to_string())
            } else {
                None
            }
        } else {
            None
        };

        Ok(McpHealthStatus {
            name: name.to_string(),
            connected,
            needs_auth,
            error,
            checked_at: now,
        })
    }

    /// 聚合：配置 + 健康检查
    pub fn list_servers(&self, workspace_path: &Path) -> Result<Vec<McpServerAggregate>> {
        let configs = self.list_configs(workspace_path)?;
        let health_results = self.health_check().unwrap_or_default();

        let health_map: std::collections::HashMap<String, McpHealthStatus> = health_results
            .into_iter()
            .map(|h| (h.name.clone(), h))
            .collect();

        let servers = configs
            .into_iter()
            .map(|info| {
                let health = health_map.get(&info.name).cloned();
                McpServerAggregate {
                    info,
                    health,
                    tools: Vec::new(),
                }
            })
            .collect();

        Ok(servers)
    }

    /// 聚合：单个服务器
    pub fn get_server(
        &self,
        name: &str,
        workspace_path: &Path,
    ) -> Result<McpServerAggregate> {
        let configs = self.list_configs(workspace_path)?;
        let info = configs
            .into_iter()
            .find(|c| c.name == name)
            .ok_or_else(|| {
                AppError::NotFound(format!("MCP server '{}' not found", name))
            })?;

        let health = self.health_check_one(name).ok();

        Ok(McpServerAggregate {
            info,
            health,
            tools: Vec::new(),
        })
    }
```

- [ ] **Step 2: 在 Cargo.toml 中添加 chrono 和 dirs 依赖（如尚未存在）**

检查 `src-tauri/Cargo.toml` 是否已包含 `chrono` 和 `dirs` crate。若没有则添加。

- [ ] **Step 3: 确认编译通过**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -5`

---

## Task 3: Rust Tauri Commands + 注册

**Files:**
- Create: `src-tauri/src/commands/mcp_manager.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 mcp_manager.rs commands 文件**

```rust
use crate::error::Result;
use crate::services::mcp_manager_service::{
    McpHealthStatus, McpServerAggregate,
};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn mcp_list_servers(
    workspace_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<McpServerAggregate>> {
    let service = state.mcp_manager.lock().await;
    let path = PathBuf::from(&workspace_path);
    service.list_servers(&path)
}

#[tauri::command]
pub async fn mcp_get_server(
    name: String,
    workspace_path: String,
    state: State<'_, AppState>,
) -> Result<McpServerAggregate> {
    let service = state.mcp_manager.lock().await;
    let path = PathBuf::from(&workspace_path);
    service.get_server(&name, &path)
}

#[tauri::command]
pub async fn mcp_health_check(
    state: State<'_, AppState>,
) -> Result<Vec<McpHealthStatus>> {
    let service = state.mcp_manager.lock().await;
    service.health_check()
}

#[tauri::command]
pub async fn mcp_health_check_one(
    name: String,
    state: State<'_, AppState>,
) -> Result<McpHealthStatus> {
    let service = state.mcp_manager.lock().await;
    service.health_check_one(&name)
}
```

- [ ] **Step 2: 修改 AppState 添加 mcp_manager 字段**

在 `src-tauri/src/state.rs`（或 AppState 定义所在文件）中添加：

```rust
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::services::mcp_manager_service::McpManagerService;

// 在 AppState struct 中添加:
pub mcp_manager: Arc<Mutex<McpManagerService>>,
```

- [ ] **Step 3: 修改 lib.rs 注册 commands 和初始化 service**

在 `lib.rs` 中：
1. 添加 `mod commands::mcp_manager;`（或在 commands/mod.rs 中添加）
2. 在 setup 函数中初始化 `McpManagerService::new(claude_path.clone())`
3. 将其传入 `create_app_state`
4. 在 `generate_handler![]` 中添加：
```rust
mcp_manager::mcp_list_servers,
mcp_manager::mcp_get_server,
mcp_manager::mcp_health_check,
mcp_manager::mcp_health_check_one,
```

- [ ] **Step 4: 确认编译通过**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/mcp_manager_service.rs src-tauri/src/commands/mcp_manager.rs src-tauri/src/state.rs src-tauri/src/lib.rs
git commit -m "feat: add MCP manager service with config reading and health check"
```

---

## Task 4: 前端类型定义

**Files:**
- Create: `src/types/mcp.ts`

- [ ] **Step 1: 创建 MCP 类型文件**

```typescript
/**
 * MCP 管理相关类型定义
 */

/** MCP 传输类型 */
export type McpTransport = 'stdio' | 'sse' | 'http'

/** MCP 配置范围 */
export type McpScope = 'local' | 'user' | 'project' | 'plugin'

/** 单个 MCP 服务器配置信息 */
export interface McpServerInfo {
  name: string
  commandOrUrl: string
  args: string[]
  transport: McpTransport
  scope: McpScope
  env: Record<string, string>
}

/** 健康检查结果 */
export interface McpHealthStatus {
  name: string
  connected: boolean
  needsAuth: boolean
  error: string | null
  checkedAt: string
}

/** 前端消费的聚合视图 */
export interface McpServerAggregate {
  info: McpServerInfo
  health: McpHealthStatus | null
  tools: string[]
}

/** 状态筛选类型 */
export type McpStatusFilter = 'all' | 'connected' | 'needsAuth' | 'disconnected'
```

- [ ] **Step 2: Commit**

```bash
git add src/types/mcp.ts
git commit -m "feat: add MCP frontend type definitions"
```

---

## Task 5: 前端 Service 层

**Files:**
- Create: `src/services/mcpService.ts`

- [ ] **Step 1: 创建 MCP service 文件**

```typescript
/**
 * MCP 服务 - 封装 Tauri 命令调用
 */

import { invoke } from '@tauri-apps/api/core';
import type { McpServerAggregate, McpHealthStatus } from '../types/mcp';

/**
 * 获取所有 MCP 服务器（配置 + 健康状态）
 */
export async function mcpListServers(workspacePath: string): Promise<McpServerAggregate[]> {
  return invoke<McpServerAggregate[]>('mcp_list_servers', { workspacePath });
}

/**
 * 获取单个 MCP 服务器详情
 */
export async function mcpGetServer(name: string, workspacePath: string): Promise<McpServerAggregate> {
  return invoke<McpServerAggregate>('mcp_get_server', { name, workspacePath });
}

/**
 * 执行健康检查（所有服务器）
 */
export async function mcpHealthCheck(): Promise<McpHealthStatus[]> {
  return invoke<McpHealthStatus[]>('mcp_health_check');
}

/**
 * 执行单个服务器健康检查
 */
export async function mcpHealthCheckOne(name: string): Promise<McpHealthStatus> {
  return invoke<McpHealthStatus>('mcp_health_check_one', { name });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/mcpService.ts
git commit -m "feat: add MCP frontend service layer"
```

---

## Task 6: 前端 Store

**Files:**
- Create: `src/stores/mcpStore.ts`
- Modify: `src/stores/index.ts`

- [ ] **Step 1: 创建 mcpStore**

```typescript
/**
 * MCP 状态管理
 */

import { create } from 'zustand';
import type {
  McpServerAggregate,
  McpStatusFilter,
} from '../types/mcp';
import * as mcpService from '../services/mcpService';
import { createLogger } from '../utils/logger';

const log = createLogger('McpStore');

interface McpState {
  /** 服务器列表 */
  servers: McpServerAggregate[];
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 是否已初始化 */
  initialized: boolean;
  /** 上次健康检查时间 */
  lastHealthCheck: string | null;
  /** 状态筛选 */
  statusFilter: McpStatusFilter;
  /** 展开的卡片 name */
  expandedServer: string | null;

  // Actions
  init: (workspacePath: string) => Promise<void>;
  refreshAll: (workspacePath: string) => Promise<void>;
  healthCheck: () => Promise<void>;
  getServerDetail: (name: string, workspacePath: string) => Promise<void>;
  setStatusFilter: (filter: McpStatusFilter) => void;
  toggleExpand: (name: string) => void;
  clearError: () => void;
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  initialized: false,
  lastHealthCheck: null,
  statusFilter: 'all',
  expandedServer: null,

  init: async (workspacePath: string) => {
    if (get().initialized) return;
    try {
      set({ loading: true, error: null });
      const servers = await mcpService.mcpListServers(workspacePath);
      set({
        servers,
        loading: false,
        initialized: true,
        lastHealthCheck: new Date().toISOString(),
      });
    } catch (err) {
      log.error('MCP 初始化失败', err instanceof Error ? err : new Error(String(err)));
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  refreshAll: async (workspacePath: string) => {
    try {
      set({ loading: true, error: null });
      const servers = await mcpService.mcpListServers(workspacePath);
      set({
        servers,
        loading: false,
        lastHealthCheck: new Date().toISOString(),
      });
    } catch (err) {
      log.error('MCP 刷新失败', err instanceof Error ? err : new Error(String(err)));
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  healthCheck: async () => {
    try {
      const healthResults = await mcpService.mcpHealthCheck();
      const servers = get().servers.map((server) => {
        const health = healthResults.find((h) => h.name === server.info.name);
        return { ...server, health: health || server.health };
      });
      set({ servers, lastHealthCheck: new Date().toISOString() });
    } catch (err) {
      log.error('健康检查失败', err instanceof Error ? err : new Error(String(err)));
    }
  },

  getServerDetail: async (name: string, workspacePath: string) => {
    try {
      const detail = await mcpService.mcpGetServer(name, workspacePath);
      const servers = get().servers.map((s) =>
        s.info.name === name ? detail : s
      );
      set({ servers });
    } catch (err) {
      log.error('获取服务器详情失败', err instanceof Error ? err : new Error(String(err)));
    }
  },

  setStatusFilter: (filter: McpStatusFilter) => {
    set({ statusFilter: filter });
  },

  toggleExpand: (name: string) => {
    const current = get().expandedServer;
    set({ expandedServer: current === name ? null : name });
  },

  clearError: () => {
    set({ error: null });
  },
}));
```

- [ ] **Step 2: 在 stores/index.ts 中导出**

在 `src/stores/index.ts` 末尾添加：

```typescript
export { useMcpStore } from './mcpStore';
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/mcpStore.ts src/stores/index.ts
git commit -m "feat: add MCP Zustand store"
```

---

## Task 7: i18n 翻译文件

**Files:**
- Create: `src/locales/zh/mcp.json`
- Create: `src/locales/en/mcp.json`

- [ ] **Step 1: 创建中文翻译**

参见设计规格 Section 11 中的 `zh/mcp.json` 完整内容，直接复制。

- [ ] **Step 2: 创建英文翻译**

参见设计规格 Section 11 中的 `en/mcp.json` 完整内容，直接复制。

- [ ] **Step 3: 在 i18n 配置中注册 mcp namespace**

检查 `src/i18n/` 或 `src/locales/` 下的 i18n 初始化文件，确保新 namespace 被加载。项目使用 `react-i18next`，通常在 resources 配置中添加：

```typescript
import mcpZh from './zh/mcp.json';
import mcpEn from './en/mcp.json';

// 在 resources 的 zh/en 对象中添加:
mcp: mcpZh,
// 和
mcp: mcpEn,
```

- [ ] **Step 4: Commit**

```bash
git add src/locales/zh/mcp.json src/locales/en/mcp.json
git commit -m "feat: add MCP i18n translations"
```

---

## Task 8: McpServerCard 组件

**Files:**
- Create: `src/components/Mcp/McpServerCard.tsx`

- [ ] **Step 1: 创建 McpServerCard 组件**

```tsx
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, Lock, AlertCircle, Loader2 } from 'lucide-react';
import type { McpServerAggregate } from '../../types/mcp';

interface McpServerCardProps {
  server: McpServerAggregate;
  expanded: boolean;
  onClick: () => void;
}

export function McpServerCard({ server, expanded, onClick }: McpServerCardProps) {
  const { t } = useTranslation('mcp');
  const { info, health } = server;

  const statusIcon = () => {
    if (!health) return <Loader2 size={14} className="animate-spin text-text-muted" />;
    if (health.connected) return <Wifi size={14} className="text-green-500" />;
    if (health.needsAuth) return <Lock size={14} className="text-yellow-500" />;
    if (health.error) return <AlertCircle size={14} className="text-red-500" />;
    return <WifiOff size={14} className="text-text-muted" />;
  };

  const statusText = () => {
    if (!health) return t('card.checking');
    if (health.connected) return t('card.connected');
    if (health.needsAuth) return t('card.needsAuth');
    if (health.error) return t('card.error');
    return t('card.disconnected');
  };

  const transportColor: Record<string, string> = {
    stdio: 'bg-blue-500/10 text-blue-400',
    http: 'bg-purple-500/10 text-purple-400',
    sse: 'bg-orange-500/10 text-orange-400',
  };

  const scopeColor: Record<string, string> = {
    user: 'bg-green-500/10 text-green-400',
    project: 'bg-blue-500/10 text-blue-400',
    local: 'bg-yellow-500/10 text-yellow-400',
    plugin: 'bg-pink-500/10 text-pink-400',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-surface p-3 rounded-lg border cursor-pointer transition-colors ${
        expanded
          ? 'border-primary/50 bg-primary/5'
          : 'border-border-subtle hover:border-border'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {statusIcon()}
          <span className="text-sm font-medium text-text-primary truncate">
            {info.name}
          </span>
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">
          {statusText()}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${transportColor[info.transport] || 'bg-surface text-text-muted'}`}>
          {info.transport}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${scopeColor[info.scope] || 'bg-surface text-text-muted'}`}>
          {t(`scope.${info.scope}`)}
        </span>
      </div>
      <div className="mt-1.5 text-xs text-text-muted truncate">
        {info.commandOrUrl}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Mcp/McpServerCard.tsx
git commit -m "feat: add McpServerCard component"
```

---

## Task 9: McpServerDetail 组件

**Files:**
- Create: `src/components/Mcp/McpServerDetail.tsx`

- [ ] **Step 1: 创建 McpServerDetail 组件**

```tsx
import { useTranslation } from 'react-i18next';
import type { McpServerAggregate } from '../../types/mcp';

interface McpServerDetailProps {
  server: McpServerAggregate;
}

export function McpServerDetail({ server }: McpServerDetailProps) {
  const { t } = useTranslation('mcp');
  const { info, health } = server;

  const rows: Array<{ label: string; value: string }> = [
    { label: t('detail.command'), value: info.commandOrUrl },
    { label: t('detail.args'), value: info.args.join(' ') || '—' },
    { label: t('detail.transport'), value: info.transport },
    { label: t('detail.scope'), value: t(`scope.${info.scope}`) },
  ];

  if (health) {
    rows.push({
      label: t('detail.lastCheck'),
      value: health.checkedAt
        ? new Date(health.checkedAt).toLocaleTimeString()
        : '—',
    });
    if (health.error) {
      rows.push({ label: t('card.error'), value: health.error });
    }
  }

  const envKeys = Object.keys(info.env);

  return (
    <div className="px-3 pb-3 pt-1 space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-2 text-xs">
          <span className="text-text-muted w-16 flex-shrink-0">{row.label}</span>
          <span className="text-text-primary break-all">{row.value}</span>
        </div>
      ))}
      {envKeys.length > 0 && (
        <div className="flex items-start gap-2 text-xs">
          <span className="text-text-muted w-16 flex-shrink-0">{t('detail.env')}</span>
          <div className="flex flex-wrap gap-1">
            {envKeys.map((key) => (
              <span key={key} className="text-text-secondary bg-surface px-1.5 py-0.5 rounded text-[10px]">
                {key}=•••
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Mcp/McpServerDetail.tsx
git commit -m "feat: add McpServerDetail component"
```

---

## Task 10: McpPanel 主容器 + 轮询 Hook

**Files:**
- Create: `src/components/Mcp/hooks/useMcpHealthPolling.ts`
- Create: `src/components/Mcp/McpPanel.tsx`

- [ ] **Step 1: 创建健康检查轮询 Hook**

```typescript
import { useEffect } from 'react';
import { useMcpStore } from '../../../stores/mcpStore';

/**
 * MCP 健康检查轮询
 * 仅在面板可见且类型为 mcp 时激活，30 秒间隔
 */
export function useMcpHealthPolling(isVisible: boolean, panelType: string) {
  useEffect(() => {
    if (!isVisible || panelType !== 'mcp') return;

    const timer = setInterval(() => {
      useMcpStore.getState().healthCheck();
    }, 30_000);

    return () => clearInterval(timer);
  }, [isVisible, panelType]);
}
```

- [ ] **Step 2: 创建 McpPanel 主容器**

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Inbox } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useViewStore } from '../../stores/viewStore';
import { McpServerCard } from './McpServerCard';
import { McpServerDetail } from './McpServerDetail';
import { useMcpHealthPolling } from './hooks/useMcpHealthPolling';
import type { McpStatusFilter, McpServerAggregate } from '../../types/mcp';

export function McpPanel() {
  const { t } = useTranslation('mcp');
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace());
  const workspacePath = currentWorkspace?.path || '';
  const leftPanelType = useViewStore((s) => s.leftPanelType);

  const servers = useMcpStore((s) => s.servers);
  const loading = useMcpStore((s) => s.loading);
  const error = useMcpStore((s) => s.error);
  const initialized = useMcpStore((s) => s.initialized);
  const statusFilter = useMcpStore((s) => s.statusFilter);
  const expandedServer = useMcpStore((s) => s.expandedServer);
  const init = useMcpStore((s) => s.init);
  const refreshAll = useMcpStore((s) => s.refreshAll);
  const setStatusFilter = useMcpStore((s) => s.setStatusFilter);
  const toggleExpand = useMcpStore((s) => s.toggleExpand);

  // 初始化
  useEffect(() => {
    if (workspacePath && !initialized) {
      init(workspacePath);
    }
  }, [workspacePath, initialized, init]);

  // 健康检查轮询
  useMcpHealthPolling(leftPanelType !== 'none', leftPanelType);

  // 筛选
  const filteredServers = servers.filter((s) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'connected') return s.health?.connected === true;
    if (statusFilter === 'needsAuth') return s.health?.needsAuth === true;
    if (statusFilter === 'disconnected')
      return s.health && !s.health.connected && !s.health.needsAuth;
    return true;
  });

  // 统计
  const connected = servers.filter((s) => s.health?.connected).length;
  const pending = servers.length - connected;

  const filters: { key: McpStatusFilter; label: string }[] = [
    { key: 'all', label: t('panel.status.all') },
    { key: 'connected', label: t('panel.status.connected') },
    { key: 'needsAuth', label: t('panel.status.needsAuth') },
    { key: 'disconnected', label: t('panel.status.disconnected') },
  ];

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-border-subtle">
          <h2 className="text-sm font-medium text-text-primary">
            {t('panel.title')}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-sm text-danger mb-2">{error}</p>
            <button
              onClick={() => init(workspacePath)}
              className="text-xs text-primary hover:underline"
            >
              {t('panel.refresh')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle">
        <h2 className="text-sm font-medium text-text-primary">
          {t('panel.title')}
        </h2>
        <button
          onClick={() => refreshAll(workspacePath)}
          disabled={loading}
          className="p-1 rounded hover:bg-surface text-text-muted hover:text-text-primary disabled:opacity-50"
          title={t('panel.refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex gap-1 px-3 py-2 border-b border-border-subtle">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
              statusFilter === f.key
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-surface'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Inbox size={32} className="mb-2 opacity-50" />
            <p className="text-xs">{t('panel.empty')}</p>
            <p className="text-[10px] mt-1">{t('panel.emptyHint')}</p>
          </div>
        ) : (
          filteredServers.map((server) => (
            <div key={server.info.name}>
              <McpServerCard
                server={server}
                expanded={expandedServer === server.info.name}
                onClick={() => toggleExpand(server.info.name)}
              />
              {expandedServer === server.info.name && (
                <McpServerDetail server={server} />
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部状态栏 */}
      {servers.length > 0 && (
        <div className="px-3 py-2 border-t border-border-subtle text-[11px] text-text-muted">
          {t('panel.summary', { total: servers.length, connected, pending })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Mcp/McpPanel.tsx src/components/Mcp/hooks/useMcpHealthPolling.ts
git commit -m "feat: add McpPanel with health check polling"
```

---

## Task 11: McpSettingsTab + McpTopologyDiagram

**Files:**
- Create: `src/components/Mcp/McpTopologyDiagram.tsx`
- Create: `src/components/Mcp/McpSettingsTab.tsx`

- [ ] **Step 1: 创建 McpTopologyDiagram**

```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { McpServerAggregate } from '../../types/mcp';

interface McpTopologyDiagramProps {
  servers: McpServerAggregate[];
}

export function McpTopologyDiagram({ servers }: McpTopologyDiagramProps) {
  const { t } = useTranslation('mcp');

  const mermaidCode = useMemo(() => {
    const nodes = servers
      .map((s) => {
        const status = s.health?.connected
          ? '✅'
          : s.health?.needsAuth
            ? '⚠️'
            : '❓';
        return `    ${s.info.name.replace(/[^a-zA-Z0-9]/g, '_')}["${s.info.name}<br/>${status}<br/>${s.info.transport} · ${t(`scope.${s.info.scope}`)}"]`;
      })
      .join('\n');

    const edges = servers
      .map((s) => {
        const id = s.info.name.replace(/[^a-zA-Z0-9]/g, '_');
        return `    CC -->|${s.info.transport}| ${id}`;
      })
      .join('\n');

    return `graph TD\n    CC["Claude Code<br/>MCP Client"]\n${nodes}\n${edges}`;
  }, [servers, t]);

  return (
    <div className="bg-surface rounded-lg border border-border-subtle p-4">
      <pre className="mermaid text-xs">{mermaidCode}</pre>
    </div>
  );
}
```

- [ ] **Step 2: 创建 McpSettingsTab**

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMcpStore } from '../../stores/mcpStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { McpTopologyDiagram } from './McpTopologyDiagram';
import { RefreshCw, Wifi, WifiOff, Lock, Loader2 } from 'lucide-react';

export function McpSettingsTab() {
  const { t } = useTranslation('mcp');
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace());
  const workspacePath = currentWorkspace?.path || '';

  const servers = useMcpStore((s) => s.servers);
  const loading = useMcpStore((s) => s.loading);
  const initialized = useMcpStore((s) => s.initialized);
  const init = useMcpStore((s) => s.init);
  const refreshAll = useMcpStore((s) => s.refreshAll);

  useEffect(() => {
    if (workspacePath && !initialized) {
      init(workspacePath);
    }
  }, [workspacePath, initialized, init]);

  const statusIcon = (connected?: boolean, needsAuth?: boolean) => {
    if (connected) return <Wifi size={14} className="text-green-500" />;
    if (needsAuth) return <Lock size={14} className="text-yellow-500" />;
    return <WifiOff size={14} className="text-text-muted" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-text-primary">
          {t('settings.title')}
        </h3>
        <button
          onClick={() => refreshAll(workspacePath)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-surface hover:bg-surface/80 text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('panel.refresh')}
        </button>
      </div>

      {/* 配置层级图 */}
      <div>
        <h4 className="text-sm font-medium text-text-secondary mb-2">
          {t('settings.configLayers')}
        </h4>
        <McpTopologyDiagram servers={servers} />
      </div>

      {/* 服务器列表表格 */}
      <div>
        <h4 className="text-sm font-medium text-text-secondary mb-2">
          {t('settings.serverList')}
        </h4>
        <div className="bg-surface rounded-lg border border-border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left px-3 py-2 text-text-muted text-xs font-medium">
                  {t('settings.name')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs font-medium">
                  {t('settings.transport')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs font-medium">
                  {t('settings.scope')}
                </th>
                <th className="text-left px-3 py-2 text-text-muted text-xs font-medium">
                  状态
                </th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => (
                <tr
                  key={server.info.name}
                  className="border-b border-border-subtle last:border-b-0"
                >
                  <td className="px-3 py-2 text-text-primary">
                    {server.info.name}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {server.info.transport}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {t(`scope.${server.info.scope}`)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {statusIcon(
                        server.health?.connected,
                        server.health?.needsAuth
                      )}
                      <span className="text-xs text-text-muted">
                        {server.health?.connected
                          ? t('card.connected')
                          : server.health?.needsAuth
                            ? t('card.needsAuth')
                            : server.health
                              ? t('card.disconnected')
                              : t('card.checking')}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-text-muted text-xs"
                  >
                    {t('panel.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 index.ts 导出**

```typescript
export { McpPanel } from './McpPanel';
export { McpSettingsTab } from './McpSettingsTab';
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Mcp/McpTopologyDiagram.tsx src/components/Mcp/McpSettingsTab.tsx src/components/Mcp/index.ts
git commit -m "feat: add McpSettingsTab and McpTopologyDiagram"
```

---

## Task 12: 注册入口 - viewStore + ActivityBar + LeftPanel

**Files:**
- Modify: `src/stores/viewStore.ts`
- Modify: `src/components/Layout/ActivityBar.tsx`
- Modify: `src/components/Layout/LeftPanel.tsx`

- [ ] **Step 1: viewStore.ts — 添加 `'mcp'` 到 LeftPanelType**

在 `src/stores/viewStore.ts` 的 `LeftPanelType` 类型中，在 `'assistant'` 之后、`'none'` 之前添加 `'mcp'`：

```typescript
export type LeftPanelType = 'files' | 'git' | 'todo' | 'translate' | 'scheduler' | 'requirement' | 'terminal' | 'tools' | 'developer' | 'integration' | 'assistant' | 'mcp' | 'none';
```

- [ ] **Step 2: ActivityBar.tsx — 添加 MCP 按钮**

在 `src/components/Layout/ActivityBar.tsx` 中：

1. 在 lucide-react import 中添加 `Cpu`
2. 在 `panelButtons` 数组中，`assistant` 条目之后添加：

```typescript
{
  id: 'mcp' as const,
  icon: Cpu,
  label: t('labels.mcpPanel', { ns: 'mcp' }),
},
```

注意：如果 `t` 使用 `useTranslation('common')`，则需确认 `common` namespace 中有 `labels.mcpPanel` 键，或改为使用双 namespace。

- [ ] **Step 3: LeftPanel.tsx — 添加 mcp case**

在 `src/components/Layout/LeftPanel.tsx` 的 `LeftPanelContent` 中：

1. 在 props 中添加 `mcpContent?: ReactNode`
2. 在 `else if` 链中、`return null` 之前添加：

```typescript
else if (type === 'mcp') return <>{mcpContent}</>
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/viewStore.ts src/components/Layout/ActivityBar.tsx src/components/Layout/LeftPanel.tsx
git commit -m "feat: register MCP panel in viewStore, ActivityBar and LeftPanel"
```

---

## Task 13: 注册入口 - App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 App.tsx 中接入 McpPanel**

1. 在顶部 lazy imports 区域添加：

```typescript
const McpPanel = lazy(() => import('./components/Mcp/McpPanel').then(m => ({ default: m.McpPanel })));
```

2. 在 `<LeftPanelContent>` 组件调用中添加 `mcpContent` prop：

```tsx
mcpContent={
  <Suspense fallback={<div className="flex items-center justify-center h-full text-text-muted">{t('status.loading')}</div>}>
    <McpPanel />
  </Suspense>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire McpPanel into App.tsx LeftPanelContent"
```

---

## Task 14: 注册入口 - Settings

**Files:**
- Modify: `src/components/Settings/SettingsSidebar.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx`

- [ ] **Step 1: SettingsSidebar.tsx — 添加 MCP tab**

1. 在 `SettingsTabId` 类型中添加 `'mcp'`
2. 在 `NAV_ITEMS` 数组中添加：

```typescript
{ id: 'mcp' as const, icon: <Cpu size={16} />, labelKey: 'nav.mcp' },
```

3. 确保在文件顶部 import `Cpu` from `lucide-react`

- [ ] **Step 2: SettingsModal.tsx — 添加 MCP tab 渲染**

1. Import `McpSettingsTab`：

```typescript
import { McpSettingsTab } from './tabs/McpSettingsTab';
```

注意：实际路径可能是 `../Mcp/McpSettingsTab`，取决于目录结构。由于 Mcp 组件在 `src/components/Mcp/` 而非 `src/components/Settings/tabs/`，需要使用正确路径：

```typescript
import { McpSettingsTab } from '../Mcp/McpSettingsTab';
```

2. 在 `TAB_TITLE_KEYS` 中添加：

```typescript
'mcp': 'nav.mcp',
```

3. 在 tab 内容区域添加条件渲染：

```tsx
{activeTab === 'mcp' && <McpSettingsTab />}
```

- [ ] **Step 3: 添加 settings i18n 键**

在 `src/locales/zh/settings.json` 和 `src/locales/en/settings.json` 的 `nav` 部分分别添加：

```json
"mcp": "MCP 服务器"
```
```json
"mcp": "MCP Servers"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/SettingsSidebar.tsx src/components/Settings/SettingsModal.tsx src/locales/zh/settings.json src/locales/en/settings.json
git commit -m "feat: register MCP tab in Settings"
```

---

## Task 15: 编译验证 + 集成测试

- [ ] **Step 1: Rust 后端编译**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1`
Expected: 无 error

- [ ] **Step 2: 前端 TypeScript 编译**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | head -30`
Expected: 无 error

- [ ] **Step 3: 开发模式启动验证**

Run: `cd D:/space/base/Polaris && npm run tauri dev 2>&1 &`

验证要点：
1. ActivityBar 出现 MCP 图标
2. 点击后左侧面板显示 McpPanel
3. 能看到已配置的 MCP 服务器卡片
4. 卡片显示正确的连接状态
5. 点击卡片能展开详情
6. Settings 中出现 MCP tab
7. MCP tab 显示 Mermaid 拓扑图和服务器表格

- [ ] **Step 4: 修复所有编译和运行时错误**

根据步骤 1-3 的输出修复所有问题。

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete MCP management panel (Phase 1)"
```
