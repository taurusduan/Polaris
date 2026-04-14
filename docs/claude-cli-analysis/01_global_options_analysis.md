# 01 全局选项分析 (Global Options Analysis)

## 概述

Claude CLI 提供了丰富的全局选项，可分为以下几个功能类别：

---

## 1. 会话管理选项

### 1.1 会话恢复与持久化

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `-c, --continue` | 继续最近对话 | ⭐⭐⭐ 高 - 需要展示历史会话列表 |
| `-r, --resume [value]` | 恢复指定会话 | ⭐⭐⭐ 高 - 需要会话选择器 |
| `--session-id <uuid>` | 指定会话ID | ⭐ 低 - 技术参数 |
| `--fork-session` | 创建分支会话 | ⭐⭐ 中 - 需要可视化分支关系 |
| `--no-session-persistence` | 禁用会话持久化 | ⭐ 低 |
| `-n, --name <name>` | 设置会话名称 | ⭐⭐ 中 - 会话标识 |

### 1.2 会话列表功能需求

```
用户场景：
1. 查看历史会话列表
2. 搜索特定会话
3. 恢复选中的会话
4. 创建分支会话

可视化原型：
┌─────────────────────────────────────────────────────┐
│ 📋 会话历史                                          │
├─────────────────────────────────────────────────────┤
│ 🔍 搜索...                                           │
├─────────────────────────────────────────────────────┤
│ ○ 2024-04-14 - React组件开发 (main)                 │
│   └─ 分支: feature-auth                             │
│ ○ 2024-04-13 - 数据库优化                           │
│ ○ 2024-04-12 - API接口调试                          │
└─────────────────────────────────────────────────────┘
```

---

## 2. 模型与代理配置

### 2.1 模型选择

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `--model <model>` | 指定模型 (sonnet/opus) | ⭐⭐⭐ 高 - 模型选择器 |
| `--agent <agent>` | 指定代理 | ⭐⭐⭐ 高 - 代理选择器 |
| `--agents <json>` | 自定义代理配置 | ⭐⭐ 中 |
| `--effort <level>` | 努力级别 (low/medium/high/max) | ⭐⭐ 中 |
| `--fallback-model` | 备用模型 | ⭐ 低 |

### 2.2 代理列表可视化

当前 `claude agents` 输出示例：
```
5 active agents

Plugin agents:
  superpowers:code-reviewer · inherit

Built-in agents:
  Explore · haiku
  general-purpose · inherit
  Plan · inherit
  statusline-setup · sonnet
```

可视化原型：
```
┌─────────────────────────────────────────────────────┐
│ 🤖 代理管理 (5 active)                               │
├─────────────────────────────────────────────────────┤
│ 📦 内置代理                                          │
│   ├─ 🧭 Explore (haiku) - 快速探索                   │
│   ├─ 🔧 general-purpose - 通用任务                   │
│   ├─ 📋 Plan - 规划任务                              │
│   └─ ⚙️ statusline-setup (sonnet)                   │
│                                                      │
│ 🔌 插件代理                                          │
│   └─ 👀 code-reviewer - 代码审查                     │
└─────────────────────────────────────────────────────┘
```

---

## 3. 权限与安全选项

### 3.1 权限控制

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `--permission-mode <mode>` | 权限模式 | ⭐⭐⭐ 高 |
| `--allowedTools` | 允许的工具 | ⭐⭐ 中 |
| `--disallowedTools` | 禁用的工具 | ⭐⭐ 中 |
| `--dangerously-skip-permissions` | 跳过权限检查 | ⚠️ 危险 - 需警告提示 |
| `--allow-dangerously-skip-permissions` | 允许跳过权限 | ⚠️ 危险 |

### 3.2 权限模式说明

```
权限模式选项：
- default: 默认模式，按需询问
- acceptEdits: 自动接受编辑
- auto: 自动模式
- bypassPermissions: 绕过权限
- dontAsk: 不询问
- plan: 规划模式

可视化原型：
┌─────────────────────────────────────────────────────┐
│ 🔐 权限配置                                          │
├─────────────────────────────────────────────────────┤
│ 模式: [default ▼]                                   │
│                                                      │
│ 允许的工具:                                          │
│   ☑ Bash(git:*)  ☑ Edit  ☑ Read  ☐ Write           │
│                                                      │
│ 禁用的工具:                                          │
│   ☐ Bash(rm:*)  ☐ Bash(npm:*)                       │
└─────────────────────────────────────────────────────┘
```

---

## 4. 输入输出格式选项

### 4.1 输出控制

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `-p, --print` | 打印并退出 | ⭐⭐ 中 |
| `--output-format <format>` | 输出格式 (text/json/stream-json) | ⭐⭐⭐ 高 |
| `--input-format <format>` | 输入格式 | ⭐⭐ 中 |
| `--json-schema <schema>` | JSON Schema 验证 | ⭐⭐ 中 |
| `--verbose` | 详细模式 | ⭐⭐ 中 |
| `--brief` | 简洁模式 | ⭐ 低 |

### 4.2 流式输出可视化

```
stream-json 模式输出格式：
{
  "type": "message_start",
  "message": {...}
}
{
  "type": "content_block_delta",
  "delta": {...}
}

适用于：实时响应显示、进度追踪
```

---

## 5. 工作环境选项

### 5.1 目录与上下文

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `--add-dir <directories...>` | 添加允许访问的目录 | ⭐⭐⭐ 高 |
| `-w, --worktree [name]` | 创建 git worktree | ⭐⭐⭐ 高 |
| `--tmux` | 创建 tmux 会话 | ⭐⭐ 中 |
| `--ide` | 自动连接 IDE | ⭐⭐ 中 |
| `--bare` | 最小模式 | ⭐ 低 |

### 5.2 Worktree 管理可视化

```
┌─────────────────────────────────────────────────────┐
│ 🌳 Git Worktree 管理                                 │
├─────────────────────────────────────────────────────┤
│ 主仓库: D:/space-base/Polaris                       │
│                                                      │
│ 活动工作树:                                          │
│   ├─ main (主分支)                                   │
│   ├─ feature-auth → .claude/worktrees/auth          │
│   └─ bugfix-api → .claude/worktrees/api-fix         │
│                                                      │
│ [+ 创建新工作树]                                     │
└─────────────────────────────────────────────────────┘
```

---

## 6. MCP 配置选项

### 6.1 MCP 服务器管理

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `--mcp-config <configs...>` | 加载 MCP 配置 | ⭐⭐⭐ 高 |
| `--strict-mcp-config` | 仅使用指定配置 | ⭐⭐ 中 |

---

## 7. 调试选项

### 7.1 调试模式

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `-d, --debug [filter]` | 调试模式 | ⭐⭐ 中 |
| `--debug-file <path>` | 调试日志文件 | ⭐ 低 |
| `--mcp-debug` | MCP 调试 (已废弃) | ⭐ 低 |

---

## 8. 系统提示选项

### 8.1 提示控制

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `--system-prompt <prompt>` | 系统提示 | ⭐⭐ 中 |
| `--append-system-prompt <prompt>` | 追加系统提示 | ⭐⭐ 中 |
| `--exclude-dynamic-system-prompt-sections` | 排除动态部分 | ⭐ 低 |

---

## 9. 其他选项

| 选项 | 说明 | 可视化价值 |
|------|------|------------|
| `--chrome` | 启用 Chrome 集成 | ⭐⭐ 中 |
| `--no-chrome` | 禁用 Chrome 集成 | ⭐⭐ 中 |
| `--betas <betas...>` | Beta 功能 | ⭐ 低 |
| `--max-budget-usd` | 最大预算 | ⭐⭐ 中 |
| `--file <specs...>` | 下载文件资源 | ⭐ 低 |
| `--from-pr [value]` | 从 PR 恢复会话 | ⭐⭐⭐ 高 |
| `--setting-sources <sources>` | 设置来源 | ⭐ 低 |
| `--settings <file-or-json>` | 设置文件 | ⭐⭐ 中 |
| `--remote-control-session-name-prefix` | 远程控制前缀 | ⭐ 低 |
| `--disable-slash-commands` | 禁用技能 | ⭐ 低 |
| `--replay-user-messages` | 重放用户消息 | ⭐ 低 |
| `--include-hook-events` | 包含钩子事件 | ⭐ 低 |
| `--include-partial-messages` | 包含部分消息 | ⭐ 低 |
| `-h, --help` | 帮助 | ⭐ 低 |
| `-v, --version` | 版本 | ⭐ 低 |

---

## 可视化优先级排序

### 高优先级 (⭐⭐⭐)

1. **会话管理** - 历史会话列表、搜索、恢复、分支
2. **代理选择** - 代理列表展示与选择
3. **模型选择** - 模型切换界面
4. **权限配置** - 权限模式与工具控制
5. **Worktree 管理** - 工作树可视化
6. **MCP 配置** - 服务器状态展示
7. **输出格式** - 格式选择器
8. **PR 关联** - PR 会话链接

### 中优先级 (⭐⭐)

- 目录访问配置
- 系统提示管理
- 调试模式切换
- IDE 集成状态
- Chrome 集成状态
- 预算控制
- 设置文件管理

### 低优先级 (⭐)

- 会话 ID 指定
- 版本信息
- 帮助信息
- 底层技术参数

---

## 下一步

继续分析子命令 (Commands)，详见 [02_子命令分析](./02_commands_analysis.md)
