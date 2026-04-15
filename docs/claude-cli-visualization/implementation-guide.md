# Claude CLI 可视化实施指南

本文档提供从分析到实现的具体实施步骤。

---

## 一、Phase 0: 紧急修复 (0.5天)

### 1.1 修正 PRESET_AGENTS

**问题**: `sessionConfig.ts` 中硬编码的 Agent 列表有问题

**当前代码** (位置: `src/stores/sessionConfig.ts`):
```typescript
const PRESET_AGENTS = [
  { id: 'general-purpose', name: '通用', model: 'inherit' },
  { id: 'Explore', name: '探索', model: 'haiku' },
  { id: 'Plan', name: '规划', model: 'inherit' },
  // 问题: 缺少 statusline-setup
  // 问题: code-reviewer ID 不存在
]
```

**修复方案**:
```typescript
const PRESET_AGENTS = [
  // 内置 Agent
  { id: 'general-purpose', name: '通用', model: 'inherit', source: 'builtin' },
  { id: 'Explore', name: '探索', model: 'haiku', source: 'builtin' },
  { id: 'Plan', name: '规划', model: 'inherit', source: 'builtin' },
  { id: 'statusline-setup', name: '状态栏设置', model: 'sonnet', source: 'builtin' },
  // 插件 Agent
  { id: 'pua:cto-p10', name: 'PUA:CTO', model: 'opus', source: 'plugin' },
  { id: 'pua:tech-lead-p9', name: 'PUA:Tech Lead', model: 'inherit', source: 'plugin' },
  { id: 'pua:senior-engineer-p7', name: 'PUA:Senior', model: 'inherit', source: 'plugin' },
  { id: 'superpowers:code-reviewer', name: '代码审查', model: 'inherit', source: 'plugin' },
]
```

### 1.2 增加 max effort 级别

**当前代码**:
```typescript
const EFFORT_LEVELS = ['low', 'medium', 'high']
```

**修复方案**:
```typescript
const EFFORT_LEVELS = [
  { id: 'low', name: '低', description: '最小努力，快速响应' },
  { id: 'medium', name: '中', description: '默认，平衡质量和速度' },
  { id: 'high', name: '高', description: '高努力，更深入的分析' },
  { id: 'max', name: '最高', description: '最大努力，穷尽所有可能' },
]
```

---

## 二、Phase 1: 核心动态化 (2-3天)

### 2.1 新增后端接口

**文件**: `src-tauri/src/commands/cli_info.rs`

```rust
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct CLIAgent {
    pub id: String,
    pub name: String,
    pub model: String,
    pub source: String, // "builtin" | "plugin"
}

#[derive(Serialize, Deserialize)]
pub struct AuthStatus {
    pub logged_in: bool,
    pub auth_method: String,
    pub api_provider: String,
}

#[tauri::command]
pub async fn get_cli_version(cli_path: String) -> Result<String, String> {
    let output = Command::new(&cli_path)
        .arg("--version")
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn get_cli_agents(cli_path: String) -> Result<Vec<CLIAgent>, String> {
    let output = Command::new(&cli_path)
        .arg("agents")
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_agents_output(&stdout)
}

#[tauri::command]
pub async fn get_cli_auth_status(cli_path: String) -> Result<AuthStatus, String> {
    let output = Command::new(&cli_path)
        .args(["auth", "status"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| e.to_string())
}

fn parse_agents_output(output: &str) -> Result<Vec<CLIAgent>, String> {
    let mut agents = Vec::new();
    let mut current_section = "";

    for line in output.lines() {
        if line.contains("Plugin agents:") {
            current_section = "plugin";
        } else if line.contains("Built-in agents:") {
            current_section = "builtin";
        } else if line.contains("·") {
            let parts: Vec<&str> = line.split("·").collect();
            if parts.len() >= 2 {
                let id = parts[0].trim();
                let model = parts[1].trim();
                agents.push(CLIAgent {
                    id: id.to_string(),
                    name: id.split(':').last().unwrap_or(id).to_string(),
                    model: model.to_string(),
                    source: current_section.to_string(),
                });
            }
        }
    }

    Ok(agents)
}
```

### 2.2 新增前端 Store

**文件**: `src/stores/cliInfoStore.ts`

```typescript
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

interface CLIAgent {
  id: string
  name: string
  model: string
  source: 'builtin' | 'plugin'
}

interface AuthStatus {
  loggedIn: boolean
  authMethod: string
  apiProvider: string
}

interface CLIInfoState {
  version: string | null
  agents: CLIAgent[]
  authStatus: AuthStatus | null
  loading: boolean
  error: string | null

  // Actions
  fetchAll: (cliPath: string) => Promise<void>
  fetchVersion: (cliPath: string) => Promise<void>
  fetchAgents: (cliPath: string) => Promise<void>
  fetchAuthStatus: (cliPath: string) => Promise<void>
}

export const useCliInfoStore = create<CLIInfoState>((set, get) => ({
  version: null,
  agents: [],
  authStatus: null,
  loading: false,
  error: null,

  fetchAll: async (cliPath: string) => {
    set({ loading: true, error: null })
    try {
      await Promise.all([
        get().fetchVersion(cliPath),
        get().fetchAgents(cliPath),
        get().fetchAuthStatus(cliPath),
      ])
    } catch (e) {
      set({ error: String(e) })
    } finally {
      set({ loading: false })
    }
  },

  fetchVersion: async (cliPath: string) => {
    try {
      const version = await invoke<string>('get_cli_version', { cliPath })
      set({ version })
    } catch (e) {
      console.error('Failed to fetch CLI version:', e)
    }
  },

  fetchAgents: async (cliPath: string) => {
    try {
      const agents = await invoke<CLIAgent[]>('get_cli_agents', { cliPath })
      set({ agents })
    } catch (e) {
      console.error('Failed to fetch CLI agents:', e)
    }
  },

  fetchAuthStatus: async (cliPath: string) => {
    try {
      const authStatus = await invoke<AuthStatus>('get_cli_auth_status', { cliPath })
      set({ authStatus })
    } catch (e) {
      console.error('Failed to fetch auth status:', e)
    }
  },
}))
```

### 2.3 改造 SessionConfigSelector

**修改**: 使用动态 Agent 列表替代硬编码

```typescript
// 之前
const agents = PRESET_AGENTS

// 之后
import { useCliInfoStore } from '@/stores/cliInfoStore'

const agents = useCliInfoStore(state => state.agents)
```

---

## 三、Phase 2: MCP 管理 (3-4天)

### 3.1 新增类型定义

**文件**: `src/types/mcp.ts`

```typescript
export interface MCPServer {
  name: string
  type: 'stdio' | 'http' | 'sse'
  status: 'connected' | 'needs-auth' | 'pending' | 'error'
  source: 'user' | 'plugin'
  command?: string
  url?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  pluginSource?: string
  scope?: 'user' | 'project' | 'local'
}

export interface MCPServerDetail extends MCPServer {
  // 详细信息
}
```

### 3.2 新增后端接口

**文件**: `src-tauri/src/commands/mcp.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct MCPServer {
    pub name: String,
    #[serde(rename = "type")]
    pub server_type: String,
    pub status: String,
    pub source: String,
    pub command: Option<String>,
    pub url: Option<String>,
}

#[tauri::command]
pub async fn list_mcp_servers(cli_path: String) -> Result<Vec<MCPServer>, String> {
    let output = Command::new(&cli_path)
        .args(["mcp", "list"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_mcp_list(&stdout)
}

#[tauri::command]
pub async fn add_mcp_server(
    cli_path: String,
    name: String,
    server_type: String,
    command_or_url: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
    scope: String,
) -> Result<(), String> {
    let mut cmd = Command::new(&cli_path);
    cmd.args(["mcp", "add"]);

    if server_type != "stdio" {
        cmd.args(["--transport", &server_type]);
    }

    cmd.arg("--scope").arg(&scope);

    for (key, value) in env {
        cmd.args(["-e", &format!("{}={}", key, value)]);
    }

    cmd.arg(&name).arg(&command_or_url);

    if !args.is_empty() {
        cmd.arg("--");
        cmd.args(&args);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn remove_mcp_server(
    cli_path: String,
    name: String,
    scope: String,
) -> Result<(), String> {
    let output = Command::new(&cli_path)
        .args(["mcp", "remove", &name, "-s", &scope])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn parse_mcp_list(output: &str) -> Result<Vec<MCPServer>, String> {
    let mut servers = Vec::new();

    for line in output.lines() {
        // 格式: name: command/url (type) - status
        if line.contains(':') && line.contains('-') {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() == 2 {
                let name = parts[0].trim();
                let rest = parts[1];

                let server_type = if rest.contains("(HTTP)") {
                    "http"
                } else if rest.contains("(SSE)") {
                    "sse"
                } else {
                    "stdio"
                };

                let status = if rest.contains("✓ Connected") {
                    "connected"
                } else if rest.contains("Needs authentication") {
                    "needs-auth"
                } else if rest.contains("Error") {
                    "error"
                } else {
                    "pending"
                };

                let source = if name.starts_with("plugin:") {
                    "plugin"
                } else {
                    "user"
                };

                servers.push(MCPServer {
                    name: name.to_string(),
                    server_type: server_type.to_string(),
                    status: status.to_string(),
                    source: source.to_string(),
                    command: if server_type == "stdio" {
                        Some(rest.split("(stdio)").next().unwrap_or("").trim().to_string())
                    } else {
                        None
                    },
                    url: if server_type != "stdio" {
                        Some(rest.split('(').next().unwrap_or("").trim().to_string())
                    } else {
                        None
                    },
                });
            }
        }
    }

    Ok(servers)
}
```

---

## 四、Phase 3: 高级功能 (2-3天)

### 4.1 工具权限面板

**文件**: `src/components/Settings/ToolPermissionPanel.tsx`

```typescript
import { useCliInfoStore } from '@/stores/cliInfoStore'
import { Checkbox } from '@/components/ui/checkbox'

export function ToolPermissionPanel() {
  const tools = useCliInfoStore(state => state.tools)

  // 分类工具
  const builtinTools = tools.filter(t => !t.startsWith('mcp__'))
  const mcpTools = tools.filter(t => t.startsWith('mcp__'))

  return (
    <div className="space-y-4">
      <div>
        <h4>内置工具 ({builtinTools.length})</h4>
        <div className="grid grid-cols-4 gap-2">
          {builtinTools.map(tool => (
            <label key={tool} className="flex items-center gap-2">
              <Checkbox />
              <span>{tool}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4>MCP 工具 ({mcpTools.length})</h4>
        {/* ... */}
      </div>
    </div>
  )
}
```

### 4.2 预算控制组件

**文件**: `src/components/Settings/BudgetControl.tsx`

```typescript
import { useState } from 'react'
import { Input } from '@/components/ui/input'

interface BudgetControlProps {
  value: number | null
  onChange: (value: number | null) => void
}

export function BudgetControl({ value, onChange }: BudgetControlProps) {
  const [enabled, setEnabled] = useState(value !== null)

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(!!checked)
            onChange(checked ? 1 : null)
          }}
        />
        <span>启用预算限制</span>
      </label>

      {enabled && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={value ?? 1}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
          <span>USD</span>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        对应 CLI 参数: --max-budget-usd
      </p>
    </div>
  )
}
```

---

## 五、集成 stream-json init 事件

### 5.1 后端处理

**修改**: `src-tauri/src/ai/engine/claude.rs`

```rust
// 在 stream 解析逻辑中添加
if let Some(subtype) = obj.get("subtype").and_then(|s| s.as_str()) {
    if subtype == "init" {
        // 发送 init 事件到前端
        app_handle.emit("cli:init", &obj)?;
    }
}
```

### 5.2 前端监听

**修改**: `src/stores/cliInfoStore.ts`

```typescript
import { listen } from '@tauri-apps/api/event'

// 在应用初始化时
const unlisten = await listen('cli:init', (event) => {
  const init = event.payload as {
    agents?: string[]
    tools?: string[]
    mcp_servers?: Array<{ name: string; status: string }>
    skills?: string[]
    model?: string
  }

  // 更新 store
  useCliInfoStore.getState().updateFromInit(init)
})
```

---

## 六、测试清单

### Phase 0 测试

- [ ] Agent 选择器显示 8 个 Agent
- [ ] Effort 选择器显示 4 个级别
- [ ] 选中 PUA:CTO 后 CLI 参数正确

### Phase 1 测试

- [ ] 启动时自动获取 CLI 版本
- [ ] 启动时自动获取认证状态
- [ ] Agent 列表动态刷新
- [ ] 认证状态显示正确

### Phase 2 测试

- [ ] MCP 列表正确显示
- [ ] 插件 MCP 和用户 MCP 区分
- [ ] 添加 MCP 服务器成功
- [ ] 删除 MCP 服务器成功
- [ ] MCP 认证流程正常

### Phase 3 测试

- [ ] 工具权限修改生效
- [ ] 预算限制生效
- [ ] Effort 级别修改生效

---

*实施指南完成时间: 2026-04-15*
