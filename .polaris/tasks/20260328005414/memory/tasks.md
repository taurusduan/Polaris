# 任务队列

## 待办
1. ~~分析项目结构~~ (已完成)
2. ~~生成需求 req-chat-empty-state-starters-022 + 原型~~ (已完成)
3. ~~生成需求 req-openai-provider-test-024 + 原型~~ (已完成)
4. 继续分析项目，识别下一个改进点（下次触发执行）
5. 生成更多不重复的需求（逐步推进）

## 已完成
- [x] 分析项目现有需求（21 条），确认无重复
- [x] 识别改进点：EmptyState 组件缺少对话启动建议
- [x] 生成需求 req-chat-empty-state-starters-022
- [x] 生成 HTML 原型 chat-empty-state-starters.html
- [x] 写入 requirements.json
- [x] 分析项目 OpenAI 提供商配置流程
- [x] 识别改进点：缺少连接测试能力
- [x] 生成需求 req-openai-provider-test-024
- [x] 生成 HTML 原型 openai-provider-test-connection.html
- [x] 写入 requirements.json

## 候选需求方向（已调研未生成）
- Tab 会话持久化与恢复（tabStore 不持久化 tabs/activeTabId）
- 聊天输入草稿自动保存（ChatInput 使用 useState，不持久化）
- TranslateTab 硬编码中文未走 i18n（已有 locale keys 但未使用）
