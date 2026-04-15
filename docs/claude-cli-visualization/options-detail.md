# Claude CLI Options 详细分析

本文档详细记录每个 CLI 选项的测试结果和使用建议。

---

## 一、核心会话控制

### 1.1 -p, --print

**功能**: 非交互式输出，适合管道使用

**测试命令**:
```bash
claude -p "hello"
```

**输出**:
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 17202,
  "result": "hello ~ 有什么可以帮你的吗？",
  "session_id": "2fc6179f-ef08-432a-9e4a-c18c5e9bea35",
  "total_cost_usd": 0.348055
}
```

**可视化建议**: 状态栏显示 "非交互模式" 标签

---

### 1.2 --output-format

**功能**: 控制输出格式

**可选值**: text | json | stream-json

**测试命令**:
```bash
claude -p "test" --output-format json
```

**注意**: `stream-json` 需要配合 `--verbose` 使用

```bash
claude -p "test" --output-format stream-json --verbose
```

**可视化建议**: 输出格式选择器

---

### 1.3 -r, --resume

**功能**: 恢复会话

**用法**:
- `claude -r` - 打开会话选择器
- `claude -r <session-id>` - 恢复指定会话
- `claude -r "search-term"` - 搜索并恢复

**可视化建议**: 会话历史面板

---

## 二、模型与代理

### 2.1 --model

**功能**: 指定模型

**测试命令**:
```bash
claude -p "what is 1+1?" --model haiku
```

**可用模型**:
- `sonnet` (默认)
- `opus`
- `haiku`
- 完整模型名如 `claude-sonnet-4-6`

**可视化建议**: 模型选择下拉框

---

### 2.2 --agent

**功能**: 指定代理

**测试命令**:
```bash
claude -p "what model are you?" --agent Plan
```

**可用代理** (通过 `claude agents` 获取):
- 内置: `general-purpose`, `Explore`, `Plan`, `statusline-setup`
- 插件: `pua:cto-p10`, `pua:tech-lead-p9`, `pua:senior-engineer-p7`, `superpowers:code-reviewer`

**可视化建议**: Agent 选择下拉框，分组显示

---

### 2.3 --effort

**功能**: 努力级别

**测试命令**:
```bash
claude -p "hello" --effort high
```

**可选值**: low | medium | high | max

**可视化建议**: Effort 级别选择器 (4级)

---

### 2.4 --json-schema

**功能**: 结构化输出验证

**测试命令**:
```bash
claude -p "test" --json-schema '{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}'
```

**输出**: 包含 `structured_output` 字段

**可视化建议**: JSON Schema 编辑器

---

## 三、权限与安全

### 3.1 --permission-mode

**功能**: 权限模式

**测试命令**:
```bash
claude -p "test" --permission-mode bypassPermissions
```

**可选值**:
- `default` - 默认，每次询问
- `auto` - 自动决定
- `bypassPermissions` - 跳过权限检查
- `acceptEdits` - 自动接受编辑
- `dontAsk` - 不询问
- `plan` - 规划模式

**可视化建议**: 权限模式选择器

---

### 3.2 --allowed-tools

**功能**: 限制可用工具

**测试命令**:
```bash
claude -p "list files" --allowed-tools "Bash(ls)"
```

**格式**: 逗号或空格分隔的工具名

**可视化建议**: 工具复选框列表

---

### 3.3 --max-budget-usd

**功能**: 最大预算限制

**测试命令**:
```bash
claude -p "test" --max-budget-usd 0.01
```

**输出**: 当超过预算时返回 `error_max_budget_usd`

```json
{
  "type": "result",
  "subtype": "error_max_budget_usd",
  "is_error": true,
  "errors": ["Reached maximum budget ($0.01)"]
}
```

**可视化建议**: 预算输入框 + 预算消耗进度条

---

## 四、输入输出控制

### 4.1 --output-format stream-json

**功能**: 流式 JSON 输出

**前置条件**: 必须同时使用 `--verbose`

**测试命令**:
```bash
claude -p "test" --output-format stream-json --verbose
```

**输出事件类型**:
| type | subtype | 说明 |
|------|---------|------|
| system | hook_started | Hook 开始 |
| system | hook_response | Hook 完成 |
| system | init | 会话初始化 (核心数据源) |
| assistant | - | AI 回复 |
| result | success/error | 最终结果 |

**init 事件包含**:
- `agents[]` - Agent 列表
- `tools[]` - 工具列表
- `mcp_servers[]` - MCP 服务器状态
- `skills[]` - 技能列表
- `plugins[]` - 插件列表
- `model` - 当前模型
- `claude_code_version` - 版本号

**可视化建议**: 调试面板展示事件流

---

## 五、子命令

### 5.1 claude agents

**功能**: 列出配置的代理

**输出示例**:
```
8 active agents

Plugin agents:
  pua:cto-p10 · opus
  pua:senior-engineer-p7 · inherit
  pua:tech-lead-p9 · inherit
  superpowers:code-reviewer · inherit

Built-in agents:
  Explore · haiku
  general-purpose · inherit
  Plan · inherit
  statusline-setup · sonnet
```

**解析要点**:
- 分为 "Plugin agents" 和 "Built-in agents" 两组
- 格式: `<name> · <model>`
- `inherit` 表示继承默认模型

---

### 5.2 claude auth status

**功能**: 显示认证状态

**输出示例**:
```json
{
  "loggedIn": true,
  "authMethod": "oauth_token",
  "apiProvider": "firstParty"
}
```

**可视化建议**: 认证状态徽章

---

### 5.3 claude mcp list

**功能**: 列出 MCP 服务器

**输出示例**:
```
plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ! Needs authentication
plugin:playwright:playwright: npx @playwright/mcp@latest - ✓ Connected
plugin:supabase:supabase: https://mcp.supabase.com/mcp (HTTP) - ! Needs authentication
chrome-devtools: cmd /c npx chrome-devtools-mcp@latest - ✓ Connected
```

**解析要点**:
- 格式: `<name>: <command-or-url> (<type>) - <status>`
- 状态: `✓ Connected` 或 `! Needs authentication`
- 插件 MCP 以 `plugin:` 前缀标识

---

### 5.4 claude plugin list

**功能**: 列出已安装插件

**输出示例**:
```
Installed plugins:

  ❯ figma@claude-plugins-official
    Version: 2.0.7
    Scope: user
    Status: ✔ enabled
```

**解析要点**:
- 当前选中项用 `❯` 标记
- Status: `✔ enabled` 或 `✘ disabled`
- Scope: `user` | `local`

---

## 六、完整选项列表

| 选项 | 分类 | 测试状态 |
|------|------|----------|
| `-p, --print` | 核心 | ✅ 已验证 |
| `-c, --continue` | 核心 | ✅ |
| `-r, --resume` | 核心 | ✅ |
| `--session-id` | 核心 | ✅ |
| `--fork-session` | 核心 | ✅ |
| `-n, --name` | 核心 | ✅ |
| `--from-pr` | 核心 | ✅ |
| `--model` | 模型代理 | ✅ 已验证 |
| `--agent` | 模型代理 | ✅ 已验证 |
| `--agents` | 模型代理 | ✅ |
| `--effort` | 模型代理 | ✅ 已验证 |
| `--fallback-model` | 模型代理 | ✅ |
| `--permission-mode` | 权限安全 | ✅ 已验证 |
| `--allowed-tools` | 权限安全 | ✅ 已验证 |
| `--disallowed-tools` | 权限安全 | ✅ |
| `--dangerously-skip-permissions` | 权限安全 | ✅ |
| `--max-budget-usd` | 权限安全 | ✅ 已验证 |
| `--output-format` | 输入输出 | ✅ 已验证 |
| `--json-schema` | 输入输出 | ✅ 已验证 |
| `--verbose` | 输入输出 | ✅ 已验证 |
| `--input-format` | 输入输出 | ✅ |
| `--mcp-config` | 配置 | ✅ |
| `--settings` | 配置 | ✅ |
| `--system-prompt` | 配置 | ✅ |
| `agents` | 子命令 | ✅ 已验证 |
| `auth status` | 子命令 | ✅ 已验证 |
| `mcp list` | 子命令 | ✅ 已验证 |
| `plugin list` | 子命令 | ✅ 已验证 |
| `auto-mode defaults` | 子命令 | ✅ 已验证 |
| `--version` | 信息 | ✅ 已验证 |
| `--help` | 信息 | ✅ 已验证 |

---

*文档更新时间: 2026-04-15*
