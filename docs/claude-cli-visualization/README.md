# Claude CLI 可视化支持完整分析报告

**分析日期**: 2026-04-15
**CLI 版本**: 2.1.104 (Claude Code)
**项目**: Polaris (Tauri + React + TypeScript)

---

## 一、分析目的

将 `claude --help` 输出的所有工具和选项进行可视化设计，帮助用户更直观地理解和使用 Claude CLI。

---

## 二、命令结构全景图

### 2.1 基本用法

```
claude [options] [command] [prompt]
```

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Claude CLI 命令结构                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│    claude [options] [command] [prompt]                              │
│    ─────   ───────   ───────   ──────                               │
│      │         │          │        │                                │
│      ▼         ▼          ▼        ▼                                │
│   命令名    可选参数    可选子命令  可选提示词                         │
│                                                                     │
│    默认: 启动交互式会话                                             │
│    非交互: 使用 -p/--print                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Options 完整分类

#### 核心会话控制 (7项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `-p, --print` | 无 | 非交互式输出，适合管道 | ✅ 已验证 |
| `-c, --continue` | 无 | 继续最近对话 | ✅ |
| `-r, --resume [value]` | 会话ID或搜索词 | 恢复会话 | ✅ |
| `--session-id <uuid>` | UUID | 指定会话ID | ✅ |
| `--fork-session` | 无 | 创建新会话ID | ✅ |
| `-n, --name <name>` | 字符串 | 设置会话名称 | ✅ |
| `--from-pr [value]` | PR号或URL | 从PR恢复会话 | ✅ |

#### 模型与代理 (5项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--model <model>` | sonnet/opus/haiku | 指定模型 | ✅ 已验证 |
| `--agent <agent>` | Agent ID | 指定代理 | ✅ 已验证 |
| `--agents <json>` | JSON对象 | 自定义代理 | ✅ |
| `--effort <level>` | low/medium/high/max | 努力级别 | ✅ 已验证 |
| `--fallback-model <model>` | 模型名 | 备用模型 | ✅ |

#### 权限与安全 (5项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--permission-mode <mode>` | default/auto/bypassPermissions等 | 权限模式 | ✅ 已验证 |
| `--allow-dangerously-skip-permissions` | 无 | 允许跳过权限选项 | ✅ |
| `--dangerously-skip-permissions` | 无 | 跳过所有权限检查 | ✅ |
| `--allowedTools, --allowed-tools` | 工具列表 | 允许的工具 | ✅ 已验证 |
| `--disallowedTools, --disallowed-tools` | 工具列表 | 禁用的工具 | ✅ |

#### 配置与设置 (8项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--settings <file-or-json>` | 文件路径或JSON | 加载设置 | ✅ |
| `--setting-sources <sources>` | user,project,local | 设置来源 | ✅ |
| `--system-prompt <prompt>` | 提示词 | 系统提示词 | ✅ |
| `--append-system-prompt <prompt>` | 提示词 | 追加系统提示词 | ✅ |
| `--mcp-config <configs...>` | JSON文件或字符串 | MCP服务器配置 | ✅ |
| `--strict-mcp-config` | 无 | 严格MCP配置 | ✅ |
| `--plugin-dir <path>` | 目录路径 | 插件目录 | ✅ |
| `--disable-slash-commands` | 无 | 禁用所有技能 | ✅ |

#### 输入输出控制 (9项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--input-format <format>` | text/stream-json | 输入格式 | ✅ |
| `--output-format <format>` | text/json/stream-json | 输出格式 | ✅ 已验证 |
| `--json-schema <schema>` | JSON Schema | 结构化输出验证 | ✅ 已验证 |
| `--verbose` | 无 | 详细模式 | ✅ 已验证 |
| `--brief` | 无 | 简洁模式 | ✅ |
| `--include-hook-events` | 无 | 包含Hook事件 | ✅ |
| `--include-partial-messages` | 无 | 包含部分消息 | ✅ |
| `--replay-user-messages` | 无 | 重发用户消息 | ✅ |
| `--exclude-dynamic-system-prompt-sections` | 无 | 排除动态系统提示 | ✅ |

#### 集成与调试 (8项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--chrome` | 无 | 启用Chrome集成 | ✅ |
| `--no-chrome` | 无 | 禁用Chrome集成 | ✅ |
| `--ide` | 无 | 自动连接IDE | ✅ |
| `--tmux` | 无 | 创建tmux会话 | ✅ |
| `-d, --debug [filter]` | 类别过滤 | 调试模式 | ✅ |
| `--debug-file <path>` | 文件路径 | 调试日志文件 | ✅ |
| `--mcp-debug` | 无 | MCP调试模式(已废弃) | ⚠️ 废弃 |

#### 文件与目录 (3项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--add-dir <directories...>` | 目录列表 | 添加目录访问 | ✅ |
| `--file <specs...>` | file_id:相对路径 | 下载文件资源 | ✅ |
| `-w, --worktree [name]` | 名称 | 创建Git工作树 | ✅ |

#### 高级功能 (6项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `--bare` | 无 | 最小模式 | ✅ |
| `--betas <betas...>` | Beta功能 | Beta功能 | ✅ |
| `--max-budget-usd <amount>` | 金额 | 最大预算 | ✅ 已验证 |
| `--remote-control-session-name-prefix` | 前缀 | 远程控制会话前缀 | ✅ |

#### 信息查询 (2项)

| 选项 | 参数 | 说明 | 测试验证 |
|------|------|------|----------|
| `-h, --help` | 无 | 显示帮助 | ✅ 已验证 |
| `-v, --version` | 无 | 显示版本号 | ✅ 已验证 |

### 2.3 Commands 子命令

| 命令 | 功能 | 测试结果 |
|------|------|----------|
| `agents` | 列出配置的代理 (8个活跃) | ✅ 已验证 |
| `auth` | 管理认证 (login/logout/status) | ✅ 已验证 |
| `auto-mode` | 检查自动模式配置 | ✅ 已验证 |
| `doctor` | 健康检查 | ⚠️ Windows终端不支持 |
| `install` | 安装原生版本 | ✅ |
| `mcp` | MCP服务器管理 | ✅ 已验证 |
| `plugin|plugins` | 插件管理 | ✅ 已验证 |
| `setup-token` | 设置长效认证令牌 | ✅ |
| `update|upgrade` | 检查更新 | ✅ |

---

## 三、实测数据汇总

### 3.1 claude agents 输出

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

### 3.2 claude auth status 输出

```json
{
  "loggedIn": true,
  "authMethod": "oauth_token",
  "apiProvider": "firstParty"
}
```

### 3.3 claude mcp list 输出

```
plugin:figma:figma: https://mcp.figma.com/mcp (HTTP) - ! Needs authentication
plugin:playwright:playwright: npx @playwright/mcp@latest - ✓ Connected
plugin:supabase:supabase: https://mcp.supabase.com/mcp (HTTP) - ! Needs authentication
chrome-devtools: cmd /c npx chrome-devtools-mcp@latest - ✓ Connected
```

### 3.4 claude plugin list 输出

```
Installed plugins:

  figma@claude-plugins-official (user) ✔ enabled
  frontend-design@claude-plugins-official (user) ✔ enabled
  playwright@claude-plugins-official (user) ✔ enabled
  pua@pua-skills (user) ✔ enabled
  rust-analyzer-lsp@claude-plugins-official (user) ✔ enabled
  supabase@claude-plugins-official (user) ✔ enabled
  superpowers@claude-plugins-official (user) ✔ enabled
  typescript-lsp@claude-plugins-official (user) ✔ enabled
  ... (部分禁用)
```

### 3.5 -p 非交互式输出测试

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 17202,
  "duration_api_ms": 9726,
  "num_turns": 2,
  "result": "hello ~ 有什么可以帮你的吗？",
  "stop_reason": "end_turn",
  "session_id": "2fc6179f-ef08-432a-9e4a-c18c5e9bea35",
  "total_cost_usd": 0.348055,
  "usage": {
    "input_tokens": 69451,
    "output_tokens": 32
  }
}
```

### 3.6 --output-format stream-json 测试

**关键发现**: stream-json 需要 `--verbose` 才能工作

init 事件包含全量动态数据:
- `agents[]`: 8个Agent ID
- `tools[]`: 28个工具名
- `mcp_servers[]`: 4个MCP服务器+状态
- `skills[]`: 39个技能名
- `plugins[]`: 8个活跃插件
- `model`: 当前模型
- `claude_code_version`: 版本号

---

## 四、可视化原型设计

### 4.1 设置页结构

```
当前:
  [通用] [AI 引擎] [插件] [自动模式] [系统提示] [助手] ...

改造后:
  [通用] [AI 引擎★] [插件] [MCP✦] [自动模式] [系统提示] [助手] ...
                ↑大幅增强  ↑新增独立Tab
```

### 4.2 AI 引擎 Tab 原型

```
╔══════════════════════════════════════════════════════════════╗
║ AI 引擎配置                                   [🔄 全部刷新]  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║ ┌─ 认证状态 ───────────────────────────────────────────────┐ ║
║ │  ✅ 已登录 · OAuth 认证 · Anthropic 第一方服务            │ ║
║ │                                           [登出]          │ ║
║ └───────────────────────────────────────────────────────────┘ ║
║                                                              ║
║ ┌─ 引擎 ──────────────────────────────────────────────────┐ ║
║ │  ○ Claude Code                         v2.1.104 ✅      │ ║
║ │  CLI 路径: [claude              ] [检测]                 │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║                                                              ║
║ ┌─ 可用 Agent (8) ──────────────── [🔄 刷新] ─────────────┐ ║
║ │                                                          │ ║
║ │  内置 Agent (4):                                         │ ║
║ │  ┌───────────────────────────────────────────────────┐   │ ║
║ │  │ 🔵 通用 (general-purpose)          默认模型: 继承  │   │ ║
║ │  │ 🔵 探索 (Explore)                  默认模型: haiku │   │ ║
║ │  │ 🔵 规划 (Plan)                     默认模型: 继承  │   │ ║
║ │  │ 🔵 状态栏设置 (statusline-setup)   默认模型: sonnet│   │ ║
║ │  └───────────────────────────────────────────────────┘   │ ║
║ │                                                          │ ║
║ │  插件 Agent (4):                                         │ ║
║ │  ┌───────────────────────────────────────────────────┐   │ ║
║ │  │ 🟣 PUA:CTO (pua:cto-p10)          默认模型: opus  │   │ ║
║ │  │ 🟣 PUA:Tech Lead (pua:tech-lead-p9) 默认模型: 继承│   │ ║
║ │  │ 🟣 PUA:Senior (pua:senior-engineer-p7) 默认: 继承 │   │ ║
║ │  │ 🟣 代码审查 (superpowers:code-reviewer)  继承     │   │ ║
║ │  └───────────────────────────────────────────────────┘   │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║                                                              ║
║ ┌─ 可用模型 ──────────────────────────────────────────────┐ ║
║ │  ○ Sonnet (默认)  ○ Opus  ○ Haiku                      │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║                                                              ║
║ ▸ 高级设置                                                  │ ║
║   ┌─ 预算控制 ─────────────────────────────────────────┐   │ ║
║   │  单次会话上限: [     ] USD                          │   │ ║
║   │  备用模型:     [不使用 ▼]                           │   │ ║
║   └────────────────────────────────────────────────────┘   │ ║
║                                                              ║
║   ┌─ 工具权限 ─────────────────────────────────────────┐   │ ║
║   │  模式: ○ 全部允许  ○ 自定义                          │   │ ║
║   │                                                    │   │ ║
║   │  已启用工具 (24/24):                                │   │ ║
║   │  ☑ Bash    ☑ Read    ☑ Edit    ☑ Write   ☑ Grep   │   │ ║
║   │  ☑ Glob    ☑ Agent   ☑ LSP     ☑ WebSearch        │   │ ║
║   │  ☑ TodoWrite ☑ AskUserQuestion                    │   │ ║
║   └────────────────────────────────────────────────────┘   │ ║
╚══════════════════════════════════════════════════════════════╝
```

### 4.3 MCP Tab 原型

```
╔══════════════════════════════════════════════════════════════════════╗
║ MCP 服务器管理                                       [🔄 刷新]    ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║ ┌─ 状态概览 ───────────────────────────────────────────────────────┐║
║ │  ● 已连接: 2    ⚠ 需认证: 2    ✗ 错误: 0                       │║
║ │  共 4 个 MCP 服务器                                              │║
║ └───────────────────────────────────────────────────────────────────┘║
║                                                                      ║
║ ┌─ 用户添加的服务器 ───────────────────────────────────────────────┐║
║ │                                                                  │║
║ │  ● chrome-devtools                                [stdio] [用户] │║
║ │    命令: cmd /c npx chrome-devtools-mcp@latest                  │║
║ │    状态: ✓ Connected                                             │║
║ │    [详情 ▼]                              [删除]                  │║
║ │                                                                  │║
║ │  [+ 添加 MCP 服务器]  [📥 从 Claude Desktop 导入]                │║
║ └──────────────────────────────────────────────────────────────────┘║
║                                                                      ║
║ ┌─ 插件管理的服务器 ───────────────────────────────────────────────┐║
║ │                                                                  │║
║ │  ● playwright                                     [stdio] [插件] │║
║ │    命令: npx @playwright/mcp@latest                              │║
║ │    来源: playwright@claude-plugins-official                      │║
║ │    状态: ✓ Connected                                             │║
║ │    [详情 ▼]  [→ 插件管理]                                        │║
║ │                                                                  │║
║ │  ⚠ figma                                          [http] [插件]  │║
║ │    地址: https://mcp.figma.com/mcp                               │║
║ │    来源: figma@claude-plugins-official                           │║
║ │    状态: ⚠ 需要认证!                                            │║
║ │    [认证] [→ 插件管理]                                           │║
║ │                                                                  │║
║ │  ⚠ supabase                                       [http] [插件]  │║
║ │    地址: https://mcp.supabase.com/mcp                            │║
║ │    来源: supabase@claude-plugins-official                        │║
║ │    状态: ⚠ 需要认证!                                            │║
║ │    [认证] [→ 插件管理]                                           │║
║ │                                                                  │║
║ │  * 插件管理的 MCP 通过启用/禁用插件控制，不支持直接增删            │║
║ └──────────────────────────────────────────────────────────────────┘║
╚══════════════════════════════════════════════════════════════════════╝
```

### 4.4 ChatStatusBar 改造

```
[v2.1.104 ✅] [🤖 通用 ▼] [⚡ Sonnet ▼] [💪 中 ▼] [🛡 默认 ▼] [🎤] [🔊]
```

Agent 下拉:
```
┌──────────────────────────────────────────────┐
│ ⚡ 刷新 Agent 列表                            │
│──────────────────────────────────────────────│
│ 🔵 内置                                       │
│  ○ 通用 (general-purpose)                     │
│  ○ 探索 · haiku                               │
│  ○ 规划                                       │
│  ○ 状态栏设置 · sonnet                        │
│──────────────────────────────────────────────│
│ 🟣 插件                                       │
│  ○ PUA:CTO · opus                             │
│  ○ PUA:Tech Lead                              │
│  ○ PUA:Senior                                 │
│  ○ 代码审查 (superpowers)                     │
│──────────────────────────────────────────────│
│ ✦ 动态获取 · 上次更新: 3分钟前                │
└──────────────────────────────────────────────┘
```

Effort 下拉:
```
┌──────────────────────────┐
│ ○ 低 (low)               │
│ ● 中 (medium) — 默认     │
│ ○ 高 (high)              │
│ ○ 最高 (max) ← 新增      │
└──────────────────────────┘
```

---

## 五、数据获取策略

### 5.1 混合模式 (推荐)

```
┌─────────────────────────────────────────────────────┐
│ 启动阶段 (快速、低成本)                              │
│                                                       │
│ get_cli_version()        → 版本号                     │
│ get_cli_auth_status()    → 认证状态                   │
│ get_cli_agents()         → Agent 列表                 │
│                                                       │
│ 耗时: ~3-5 秒                                        │
│ 成本: $0 (无 API 调用)                               │
├─────────────────────────────────────────────────────┤
│ 首次会话 (自动补充，无额外成本)                       │
│                                                       │
│ stream-json init 事件:                                │
│   tools[]       → 可用工具列表                        │
│   mcp_servers[] → MCP 服务器状态                      │
│   skills[]      → 技能列表                           │
│   agents[]      → Agent 列表 (补充验证)               │
│   plugins[]     → 活跃插件 (补充验证)                 │
│                                                       │
│ 耗时: 随首次消息一起                                 │
│ 成本: $0 (init 是 stream 的副产品)                   │
├─────────────────────────────────────────────────────┤
│ 手动刷新                                             │
│                                                       │
│ 重新执行启动阶段命令                                 │
│                                                       │
│ 耗时: ~3-5 秒                                        │
│ 成本: $0                                             │
└─────────────────────────────────────────────────────┘
```

---

## 六、实施路线图

| Phase | 工时 | 核心交付物 |
|-------|------|-----------|
| **Phase 0: 紧急修复** | 0.5天 | 修正 PRESET_AGENTS、增加 max effort |
| **Phase 1: 核心动态化** | 2-3天 | cli_info 后端 + cliInfoStore + 动态 Agent/Model + 认证状态 |
| **Phase 2: MCP 管理** | 3-4天 | MCP 独立管理 Tab + 两种来源区分 |
| **Phase 3: 高级功能** | 2-3天 | 工具权限面板 + 预算控制 + AI 规则审查 |

**总计**: 8-11 个工作日

---

## 七、注意事项

1. **CLI 文本输出格式不稳定**: `claude agents` 和 `claude mcp list` 是文本输出，需容错解析
2. **Agent ID 命名空间**: 内置用简名 (`Explore`)，插件用 `plugin:agent` 格式
3. **插件 MCP 不可通过 mcp 命令管理**: `claude mcp get plugin:figma:figma` 返回 "not found"
4. **MCP 健康检查耗时**: `claude mcp list` 会触发健康检查，可能需要 3-5 秒
5. **MCP 认证需浏览器**: HTTP 类型 MCP 的 OAuth 认证需要打开系统浏览器
6. **stream-json 需 --verbose**: `--output-format stream-json` 不加 `--verbose` 会报错
7. **init 事件无需额外成本**: 是 stream-json 的副产品，不增加 API 调用
8. **Windows 终端兼容性**: `claude doctor` 在某些 Windows 终端下不支持 raw mode

---

## 八、相关文档

| 文档 | 说明 |
|------|------|
| [01-命令全景/CLI命令全景.md](./01-命令全景/CLI命令全景.md) | CLI 所有命令完整分析 |
| [02-现状分析/已实现vs未实现.md](./02-现状分析/已实现vs未实现.md) | Polaris 源码对照分析 |
| [03-功能规划/实施路线图.md](./03-功能规划/实施路线图.md) | 分阶段实施计划 |
| [04-交互原型/界面设计.md](./04-交互原型/界面设计.md) | UI 线框图设计 |
| [05-数据结构/stream-json分析.md](./05-数据结构/stream-json分析.md) | stream-json 事件完整数据结构 |

---

*报告生成时间: 2026-04-15*
*分析工具: Claude Code v2.1.104*
