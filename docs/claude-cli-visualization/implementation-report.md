# CLI Init 事件实现报告

**实现日期**: 2026-04-15
**状态**: ✅ 已完成

---

## 一、实现内容

### 1.1 后端修改

#### 1.1.1 新增 CliInitEvent 类型

**文件**: `src-tauri/src/models/ai_event.rs`

```rust
/// CLI Init 事件 - 包含会话初始化的动态数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInitEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_id: String,
    pub tools: Vec<String>,
    pub mcp_servers: Vec<McpServerStatus>,
    pub agents: Vec<String>,
    pub skills: Vec<String>,
    pub model: Option<String>,
    pub claude_code_version: Option<String>,
}

/// MCP 服务器状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub name: String,
    pub status: String,
}
```

#### 1.1.2 新增 AIEvent::CliInit 变体

```rust
pub enum AIEvent {
    // ... 其他变体
    CliInit(CliInitEvent),
}
```

#### 1.1.3 修改 EventParser 解析 init 事件

**文件**: `src-tauri/src/ai/event_parser.rs`

```rust
fn parse_system_event(&self, subtype: Option<String>, extra: HashMap<String, serde_json::Value>) -> Vec<AIEvent> {
    // 特殊处理 init 事件
    if subtype == "init" {
        return self.parse_init_event(extra);
    }
    // ... 其他处理
}

fn parse_init_event(&self, extra: HashMap<String, serde_json::Value>) -> Vec<AIEvent> {
    // 提取 tools, mcp_servers, agents, skills, model, version
    // 构建 CliInitEvent 并返回
}
```

### 1.2 前端修改

#### 1.2.1 扩展 cliInfoStore

**文件**: `src/stores/cliInfoStore.ts`

新增字段:
- `tools: string[]` - 可用工具列表
- `mcpServers: McpServerStatus[]` - MCP 服务器状态
- `skills: string[]` - 可用技能列表
- `currentModel: string | null` - 当前模型

新增方法:
- `updateFromInit(data: CliInitEventData)` - 从 init 事件更新数据
- `initEventListeners()` - 初始化事件监听

#### 1.2.2 在 App.tsx 中初始化监听

```typescript
import { useCliInfoStore } from './stores/cliInfoStore';

// 在 useEffect 中
const cleanupCliListeners = useCliInfoStore.getState().initEventListeners();

return () => {
  cleanupCliListeners();
};
```

---

## 二、数据流

```
CLI 启动 (stream-json)
    ↓
StreamEvent::System { subtype: "init", extra: {...} }
    ↓
EventParser::parse_init_event()
    ↓
AIEvent::CliInit(CliInitEvent)
    ↓
Tauri emit "cli_init" 事件
    ↓
前端 listen<CliInitEventData>('cli_init')
    ↓
cliInfoStore.updateFromInit()
    ↓
UI 自动更新 (响应式)
```

---

## 三、构建验证

### 3.1 TypeScript 编译

```bash
$ npx tsc --noEmit
# 无错误
```

### 3.2 Rust 编译

```bash
$ cargo build
   Finished `dev` profile [unoptimized + debuginfo] target(s) in 18.77s
```

### 3.3 完整构建

```bash
$ pnpm tauri build
    Finished 2 bundles at:
        D:\space\base\Polaris\src-tauri\target\release\bundle\msi\polaris_0.1.0_x64_en-US.msi
        D:\space\base\Polaris\src-tauri\target\release\bundle\nsis\polaris_0.1.0_x64-setup.exe
```

---

## 四、已实现功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 认证状态 UI | ✅ 已存在 | AIEngineTab 已展示认证状态 |
| Agent 动态列表 | ✅ 已存在 | cliInfoStore + SessionConfigSelector |
| init 事件后端解析 | ✅ 新增 | EventParser::parse_init_event |
| init 事件数据暴露 | ✅ 新增 | AIEvent::CliInit |
| 前端监听 init 事件 | ✅ 新增 | cliInfoStore.initEventListeners |
| tools 列表 | ✅ 新增 | cliInfoStore.tools |
| mcpServers 状态 | ✅ 新增 | cliInfoStore.mcpServers |
| skills 列表 | ✅ 新增 | cliInfoStore.skills |
| 当前模型 | ✅ 新增 | cliInfoStore.currentModel |

---

## 五、待实现功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| MCP 独立管理 Tab | P1 | 需新增 mcp.rs 后端 |
| 工具权限面板 UI | P2 | 利用 cliInfoStore.tools |
| 预算控制 UI | P2 | 前端组件 |

---

*报告生成时间: 2026-04-15*
