# 设置

通过 ActivityBar 底部的 **Settings** 图标或顶栏打开设置弹窗。设置弹窗采用左右分栏布局：左侧导航 + 右侧内容区。

<div class="mock-settings">
  <div class="mock-settings-sidebar">
    <div class="ms-item active">通用</div>
    <div class="ms-item">系统提示词</div>
    <div class="ms-item">快捷片段</div>
    <div class="ms-item">窗口</div>
    <div class="ms-item">AI 引擎</div>
    <div class="ms-item">自动模式</div>
    <div class="ms-item">插件</div>
    <div class="ms-item">翻译</div>
    <div class="ms-item">QQ Bot</div>
    <div class="ms-item">飞书</div>
    <div class="ms-item">语音输入</div>
    <div class="ms-item">助手</div>
    <div class="ms-item">高级</div>
  </div>
  <div class="mock-settings-content">
    <div style="font-weight:600;color:var(--p-text-primary);margin-bottom:12px;">通用设置</div>
    <div style="margin-bottom:8px;">语言设置</div>
    <div style="opacity:0.5;font-size:12px;">切换界面显示语言</div>
  </div>
</div>

<p style="text-align:center;font-size:12px;color:var(--p-text-muted);font-style:italic;margin-top:-12px;">（模拟界面 · 非实际截图）</p>

## 设置标签页

| 标签 | 说明 |
|------|------|
| 通用 | 语言设置（中文/英文切换） |
| 系统提示词 | 自定义 AI 的 System Prompt，支持默认/追加/替换模式 |
| 快捷片段 | 管理提示词模板，详见 [快捷片段](./prompt-snippet) |
| 窗口 | 大窗模式和小屏模式的透明度调节 |
| AI 引擎 | Claude CLI 路径配置和自动检测 |
| 自动模式 | AI 操作的自动审批规则配置 |
| 插件 | 插件市场、安装和管理 |
| 翻译 | 百度翻译 API 配置（App ID + Secret Key） |
| QQ Bot | QQ 机器人实例管理，详见 [平台集成](./integration) |
| 飞书 | 飞书机器人集成配置，详见 [平台集成](./integration) |
| 语音输入 | 语音识别和 TTS 配置，详见 [语音](./speech) |
| 助手 | 独立 LLM 助手面板配置，详见 [独立助手](../advanced/assistant) |
| 高级 | Git 路径、会话目录、调试信息等系统配置 |

## AI 引擎配置

这是首次使用的关键配置步骤：

| 操作 | 说明 |
|------|------|
| 自动检测 | 自动搜索系统中的 Claude CLI |
| 手动输入 | 直接填写 CLI 完整路径 |
| 重新检测 | 重新扫描可用路径 |

Windows 常见路径：`C:\Users\<用户名>\AppData\Roaming\npm\claude.cmd`
macOS/Linux 常见路径：`/usr/local/bin/claude`

## 系统提示词

| 模式 | 说明 |
|------|------|
| 默认 | 使用内置提示词 |
| 追加 | 在默认提示词后追加自定义内容 |
| 替换 | 完全替换为自定义内容 |

支持变量：<code v-pre>`{{workspaceName}}`</code>、<code v-pre>`{{workspacePath}}`</code>、<code v-pre>`{{contextWorkspaces}}`</code>、<code v-pre>`{{date}}`</code>、<code v-pre>`{{time}}`</code>、<code v-pre>`{{defaultPrompt}}`</code>

提供字符计数、预览功能、重置/填入默认按钮。

## 自动模式

配置 AI 操作的自动审批规则，减少手动确认的打断：

- **允许规则**：匹配的操作自动批准
- **拒绝规则**：匹配的操作自动拒绝
- 支持 **列表模式**（可视化）和 **JSON 高级模式**（直接编辑配置）

详细的规则配置说明参见 [自动模式](../advanced/auto-mode)。

## 插件

管理插件的安装、启用和配置：

- **浏览**：从插件市场发现和安装插件
- **管理**：启用/禁用/卸载已安装的插件
- **市场**：添加和管理多个插件市场源
- **MCP 配置**：配置插件关联的 MCP 服务器

详细的插件系统说明参见 [插件系统](../advanced/plugins)。

## 助手

配置独立的 LLM 助手面板（不依赖 Claude CLI）：

| 配置 | 说明 |
|------|------|
| 启用助手 | 开关独立助手面板 |
| Base URL | API 服务地址（OpenAI 兼容格式） |
| API Key | 认证密钥 |
| 模型 | 选择具体的 LLM 模型 |
| 系统提示词 | 助手专用的系统提示词 |

详细的助手配置说明参见 [独立助手](../advanced/assistant)。

## 飞书

配置飞书机器人集成：

| 配置 | 说明 |
|------|------|
| 实例名称 | 例如「团队飞书机器人」 |
| App ID | 飞书开放平台应用的 App ID |
| App Secret | 飞书开放平台应用的 App Secret |
| Verification Token | 事件订阅验证令牌 |
| Encrypt Key | 事件加密密钥 |
| 显示模式 | 聊天模式 / 分离模式 / 两者都有 |
| 自动连接 | 启动时自动建立连接 |
| 工作目录 | 机器人关联的工作区路径 |

支持多实例管理，可添加多个飞书机器人。

## 高级

面向高级用户的系统级配置：

| 配置 | 说明 |
|------|------|
| Git 二进制路径 | 自定义 Git 可执行文件路径 |
| 会话保存目录 | 会话历史数据的存储位置 |
| 配置文件位置 | 显示应用配置文件路径 |
| 日志目录 | 显示应用日志文件路径 |
| 当前引擎 | 显示当前使用的 AI 引擎信息 |

## 搜索设置

设置弹窗左侧导航顶部提供搜索框，输入关键词可快速过滤和定位设置项。
