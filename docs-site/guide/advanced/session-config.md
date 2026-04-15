# 会话配置

每次 AI 对话都可以独立配置运行参数。在聊天面板底部的状态栏中，有四个关键配置项：

## Agent（智能体类型）

| 类型 | 适用场景 |
|------|----------|
| General | 通用对话，日常使用（默认） |
| Explore | 快速搜索代码，适合查找文件和关键词 |
| Plan | 架构设计，适合规划和方案讨论 |
| Code Reviewer | 代码审查，专注于代码质量分析 |

## Model（模型选择）

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| Sonnet | 均衡的速度和质量 | 日常开发（默认） |
| Opus | 最强的推理能力 | 复杂架构设计、疑难 Bug 排查 |
| Haiku | 最快的响应速度 | 简单问答、快速搜索 |

## Effort（投入级别）

控制模型在每次回复上的投入程度：

| 级别 | 说明 |
|------|------|
| Low | 快速简短回复 |
| Medium | 标准回复（默认） |
| High | 深入详细回复，多次推理 |

## Permission（权限模式）

控制 AI 执行操作时是否需要用户审批：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| Default | 敏感操作需确认 | 日常使用（推荐） |
| Auto | 自动批准安全操作 | 高效开发，减少打断 |
| AcceptEdits | 自动接受文件编辑 | 信任 AI 修改文件的场景 |
| Plan | 仅生成计划不执行 | 先看方案再决定 |
| DontAsk | 拒绝危险操作 | 安全优先 |
| BypassPermissions | 跳过所有权限检查 | 完全自动化场景（谨慎使用） |

<div class="info-card tip">
  <div class="card-title">提示</div>
  <p>权限配置影响安全性。建议日常使用 Default 或 Auto 模式，仅在完全理解风险的情况下使用 BypassPermissions。</p>
</div>

## 配置独立性

每个会话的配置独立维护：

- 创建新会话时使用默认配置
- 修改配置仅影响当前会话
- 切换会话后自动恢复该会话的配置
- 不会影响其他会话的运行

## 典型配置组合

| 场景 | Agent | Model | Effort | Permission |
|------|-------|-------|--------|------------|
| 日常开发 | General | Sonnet | Medium | Default |
| 深度 Bug 排查 | General | Opus | High | AcceptEdits |
| 快速文件搜索 | Explore | Haiku | Low | Default |
| 架构方案设计 | Plan | Opus | High | Plan |
| 代码审查 | Code Reviewer | Sonnet | Medium | Default |
| 自动化任务 | General | Sonnet | Medium | Auto |
