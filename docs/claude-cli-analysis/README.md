# Claude CLI 可视化分析报告

**分析日期**: 2026-04-14
**CLI 版本**: 2.1.104
**实现状态**: ✅ 已完成

---

## 一、核心发现：项目未使用 CLI Agent/Model 功能

### 1.1 现状检查（实现前）

经过代码审查，发现以下功能**完全未实现**：

| CLI 功能 | 选项 | 后端实现 | 前端 UI | 配置存储 |
|----------|------|----------|---------|----------|
| Agent 选择 | `--agent` | ❌ 无 | ❌ 无 | ❌ 无 |
| Model 选择 | `--model` | ❌ 无 | ❌ 无 | ❌ 无 |
| Effort 级别 | `--effort` | ❌ 无 | ❌ 无 | ❌ 无 |
| 权限模式 | `--permission-mode` | ❌ 无 | ❌ 无 | ❌ 无 |

**当前 AIEngineTab 只显示**：
```
┌─────────────────────────────────────┐
│ 引擎选择: ○ Claude Code             │
│                                      │
│ Claude Code 配置                     │
│   CLI 路径: [claude]                 │
│   版本: v2.1.104                     │
└─────────────────────────────────────┘
```

### 1.2 已实现的功能

| 功能 | 实现位置 | 说明 |
|------|----------|------|
| 自动模式配置 | `AutoModeTab.tsx` | 查看 allow/deny 规则 |
| 插件管理 | `PluginTab.tsx` | 安装/启用/禁用插件 |
| MCP 状态展示 | 在插件详情中 | 仅展示，无法操作 |

---

## 二、实现方案（已完成）

### 2.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/types/sessionConfig.ts` | 会话配置类型定义（Agent、Model、Effort、PermissionMode） |
| `src/stores/sessionConfigStore.ts` | 会话配置 Zustand Store（持久化到 localStorage） |
| `src/components/Chat/SessionConfigSelector.tsx` | Agent/Model 选择器组件（完整版 + 精简版） |

### 2.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/ai/traits.rs` | SessionOptions 添加 agent/model/effort/permission_mode 字段 |
| `src-tauri/src/ai/engine/claude.rs` | build_command 传递 --agent/--model/--effort/--permission-mode 参数 |
| `src-tauri/src/commands/chat.rs` | ChatRequestOptions 添加会话配置字段 |
| `src/components/Chat/ChatStatusBar.tsx` | 集成 CompactSessionSelector 组件 |
| `src/stores/conversationStore/createConversationStore.ts` | sendMessage/continueChat 传递会话配置 |

### 2.3 UI 集成位置

**ChatStatusBar 现在显示**：
```
┌─────────────────────────────────────────────────────────────────────┐
│ [v2.1.104] [Agent: 通用 ▼] [Model: Sonnet ▼] [🎤] [🔊] ...        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、现有交互机制分析

### 3.1 ChatStatusBar 现状

当前状态栏位于聊天输入框下方，显示：
- CLI 版本号
- 语音识别按钮
- TTS 播放控制
- 输入状态提示
- 流式响应状态
- 字数统计

```
┌─────────────────────────────────────────────────────────────────────┐
│ [v2.1.104]  [🎤] [🔊] [等待输入...]  [● 响应中]  128            │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 权限交互已实现

项目已经有完整的权限确认机制：

**PermissionRequestBlock 类型** (`src/types/chat.ts`):
```typescript
interface PermissionRequestBlock {
  type: 'permission_request';
  id: string;
  denials: PermissionDenialBlock[];
  status: 'pending' | 'approved' | 'denied';
  decision?: { approved: boolean; timestamp: string };
}
```

**PermissionRequestRenderer 组件** (`src/components/Chat/PermissionRequestRenderer.tsx`):
- 显示被拒绝的工具列表
- 展示拒绝原因
- 提供「批准」/「拒绝」按钮
- 支持键盘操作

### 3.3 计划模式已实现

**PlanModeBlock 类型** (`src/types/chat.ts`):
```typescript
interface PlanModeBlock {
  type: 'plan_mode';
  id: string;
  title: string;
  status: 'drafting' | 'pending_approval' | 'approved' | 'rejected' | ...;
  stages: PlanStageBlock[];
}
```

**PlanModeBlockRenderer 组件**:
- 显示计划阶段和任务
- 进度条展示
- 批准/拒绝按钮
- 支持反馈输入

---

## 四、权限模式行为测试

### 4.1 CLI 权限模式对比

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `default` | 需要确认敏感操作 | 正常开发 |
| `auto` | 自动批准安全操作 | 快速迭代 |
| `plan` | 仅规划不执行 | 架构设计 |
| `acceptEdits` | 自动接受编辑 | 大量重构 |
| `dontAsk` | 拒绝危险操作 | 安全优先 |
| `bypassPermissions` | 跳过所有检查 | 沙箱环境 |

### 4.2 不同模式下的交互流程

**default 模式**（当前项目默认）:
```
用户请求 → AI 分析 → 需要权限 → 发送 PermissionRequestBlock
                                        ↓
                                   用户点击批准/拒绝
                                        ↓
                                   继续执行/停止
```

**plan 模式**:
```
用户请求 → AI 分析规划 → 发送 PlanModeBlock（不执行）
                              ↓
                         用户批准/拒绝
                              ↓
                         执行/取消
```

**auto 模式**:
```
用户请求 → AI 分析 → 自动判断安全 → 执行（安全操作无需确认）
                                    ↓
                              仅危险操作需确认
```

---

## 五、实现效果

### 5.1 用户可以

1. **选择 Agent 类型**：通用、探索、规划、代码审查
2. **选择模型**：Sonnet 4、Opus 4、Haiku 3.5
3. **设置努力级别**：低、中、高
4. **设置权限模式**：默认、自动、规划等

### 5.2 配置持久化

- 配置保存在 `localStorage`（key: `polaris-session-config`）
- 页面刷新后自动恢复
- 不影响当前正在进行的对话

### 5.3 后端参数传递

```rust
// SessionOptions 新增字段
pub agent: Option<String>,
pub model: Option<String>,
pub effort: Option<String>,
pub permission_mode: Option<String>,
```

CLI 命令构建：
```bash
claude --agent "Explore" --model "haiku" --effort "low" --permission-mode "auto"
```

---

## 六、后续优化建议

### 6.1 动态获取 Agent 列表

当前使用硬编码的 Agent 列表，可通过 CLI 命令动态获取：
```bash
claude --list-agents
```

### 6.2 认证状态展示

显示当前 CLI 的认证状态（是否已登录 Anthropic）

### 6.3 独立 MCP 管理

将 MCP 服务器管理从插件系统独立出来

---

## 七、文件修改清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/types/sessionConfig.ts` | Agent 类型定义 |
| `src/stores/sessionConfigStore.ts` | 会话配置 Store |
| `src/components/Chat/SessionConfigSelector.tsx` | 选择器组件 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/ai/traits.rs` | 添加会话配置字段 |
| `src-tauri/src/ai/engine/claude.rs` | 传递 CLI 参数 |
| `src-tauri/src/commands/chat.rs` | ChatRequestOptions 扩展 |
| `src/components/Chat/ChatStatusBar.tsx` | 集成选择器 |
| `src/stores/conversationStore/createConversationStore.ts` | 传递配置到后端 |

---

## 八、编译验证

- ✅ Rust 后端编译通过（cargo check）
- ✅ TypeScript 前端编译通过（tsc --noEmit）
