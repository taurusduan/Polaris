# Claude CLI 可视化分析 - 源码核对报告

**核对日期**: 2026-04-15
**核对目的**: 验证分析文档中的结论是否与实际源码一致

---

## 核对结论

> 之前分析文档存在大量错误结论。经源码核对，实际实现程度远好于文档描述。

---

## 一、PRESET_AGENTS 核对

### 文档错误描述

```
问题: code-reviewer Agent ID 不存在
问题: 缺少 4 个 Plugin Agent  
问题: 缺少 statusline-setup Agent
问题: 缺少 max effort 级别
```

### 实际源码 (`sessionConfig.ts` L101-160)

```typescript
export const PRESET_AGENTS: CLIAgent[] = [
  // 内置 Agent (4个)
  { id: 'general-purpose', name: '通用', ... },
  { id: 'Explore', name: '探索', defaultModel: 'haiku', ... },
  { id: 'Plan', name: '规划', ... },
  { id: 'statusline-setup', name: '状态栏设置', defaultModel: 'sonnet', ... },
  
  // 插件 Agent (4个)
  { id: 'pua:cto-p10', name: 'PUA:CTO', defaultModel: 'opus', ... },
  { id: 'pua:tech-lead-p9', name: 'PUA:Tech Lead', ... },
  { id: 'pua:senior-engineer-p7', name: 'PUA:Senior', ... },
  { id: 'superpowers:code-reviewer', name: '代码审查', ... },  // ✅ ID 正确
]
```

**结论**: ✅ 8个Agent全量，ID正确，无遗漏

---

## 二、EFFORT_OPTIONS 核对

### 文档错误描述

```
问题: 缺少 max effort 级别
当前: ['low', 'medium', 'high']
```

### 实际源码 (`sessionConfig.ts` L193-214)

```typescript
export const EFFORT_OPTIONS = [
  { value: 'low', label: '低', description: '快速响应，适合简单问题' },
  { value: 'medium', label: '中', description: '平衡速度和质量' },
  { value: 'high', label: '高', description: '深入思考，适合复杂问题' },
  { value: 'max', label: '最高', description: '全力以赴，最高质量输出' },  // ✅ 已有
]
```

**结论**: ✅ 4级完整，含 max

---

## 三、cliInfoStore 核对

### 文档错误描述

```
commands/cli_info.rs: ❌ 不存在
```

### 实际文件

**前端**: `src/stores/cliInfoStore.ts` (168行)
- `fetchAgents()` → `invoke('cli_get_agents')`
- `fetchAuthStatus()` → `invoke('cli_get_auth_status')`
- `fetchVersion()` → `invoke('cli_get_version')`

**后端**: `src-tauri/src/commands/cli_info.rs` (54行)
- `cli_get_agents` - 调用 `claude agents` 解析
- `cli_get_auth_status` - 调用 `claude auth status`
- `cli_get_version` - 调用 `claude --version`

**结论**: ✅ 完整实现

---

## 四、SessionConfigSelector 核对

### 文档错误描述

```
问题: 硬编码 PRESET_AGENTS，无法动态获取
```

### 实际源码 (`SessionConfigSelector.tsx` L62-73)

```typescript
// 动态 Agent 列表：优先 CLI 获取，降级 PRESET
const dynamicAgents = useCliInfoStore(s => s.agents)
const agentList = useMemo(() => {
  if (dynamicAgents.length > 0) {
    return dynamicAgents.map(a => ({
      id: a.id,
      name: a.name,
      description: `${a.source === 'plugin' ? '插件' : '内置'}${a.defaultModel ? ` · ${a.defaultModel}` : ''}`,
    }))
  }
  return PRESET_AGENTS  // 降级
}, [dynamicAgents])
```

**结论**: ✅ 已实现动态获取 + 降级

---

## 五、init 事件处理核对

### 文档错误描述

```
问题: init 事件未解析，数据丢失
```

### 实际源码

**后端** (`event_parser.rs` L174-193):
```rust
fn parse_system_event(&self, subtype: Option<String>, extra: HashMap<String, serde_json::Value>) -> Vec<AIEvent> {
    // 已知的有意义子类型映射
    let message_map = HashMap::from([
        ("init", "💬"),        // 初始化会话
        ("reading", "📖"),
        ...
    ]);
    
    // 未识别的子类型（如 hook_started, hook_response 等）
    // 不发出 Progress 事件，静默忽略
    return vec![];
}
```

**问题**: init 事件被解析为 Progress，但 **extra 字段中的 agents/tools/mcp_servers 等数据未被提取**，也未 emit 到前端

**结论**: ⚠️ 部分实现 - 后端识别了 init 事件类型，但未提取和暴露数据

---

## 六、实际待实现清单

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 认证状态 UI 展示 | 数据已有，UI 缺失 | P0 |
| init 事件数据暴露 | 后端需增加 emit | P1 |
| MCP 独立管理 Tab | 后端 `mcp.rs` 未实现 | P1 |
| 工具权限面板 | 无 | P2 |
| 预算控制 UI | 无 | P2 |

---

## 七、建议修正现有文档

`docs/claude-cli-analysis/02-现状分析/已实现vs未实现.md` 中的错误结论需要更新：

| 原描述 | 修正 |
|--------|------|
| `code-reviewer Agent ID 不存在` | ❌ 错误，实际是 `superpowers:code-reviewer`，正确 |
| `缺少 4 个 Plugin Agent` | ❌ 错误，实际已有全部 4 个 |
| `缺少 statusline-setup Agent` | ❌ 错误，实际已有 |
| `缺少 max effort 级别` | ❌ 错误，实际已有 |
| `cli_info.rs 不存在` | ❌ 错误，实际已实现 |
| `认证状态完全缺失` | ⚠️ 部分错误，数据已有但 UI 缺失 |

---

*核对报告生成时间: 2026-04-15*
