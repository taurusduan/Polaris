# 工具渲染处理规范

## 目录结构

```
docs/claudecode/tools/
├── index.md              # 索引：状态总览
├── README.md             # 本文件：执行规范
├── edit.md               # 各工具的分析文档
├── read.md
└── ...
```

## 状态标记

| 标记 | 含义 |
|---|---|
| ✅ 已处理 | 无已知问题 |
| ⚠️ 有问题 | 已分析，有确认的 bug，待创建需求 |
| 🔧 需优化 | 功能正常，有优化空间 |
| 📋 待分析 | 尚未排查 |

## 执行流程

### Step 1: 分析

对工具逐一排查，产出 `<tool>.md` 文档，包含：

- 工具信息（名称、分类、badge、图标）
- 输入格式
- 渲染方式（折叠态 / 展开态）
- 数据流
- **已知问题**（确认的 bug 标记为 Bug，优化建议标记为缺失功能）
- 相关文件清单

排查重点：
- `toolSummary.ts` — `generateToolSummary` switch-case 是否包含该工具名
- `toolSummary.ts` — `generateCollapsedSummary` 分支是否正确
- `EnhancedChatMessages.tsx` — 是否有专用渲染器
- `eventHandler.ts` — 是否有特殊事件处理
- `diffExtractor.ts` — 是否需要 diff 提取
- 更新 `index.md` 状态

### Step 2: 创建需求

对确认的 bug：
1. 在需求库创建需求（`mcp__polaris-requirements__create_requirement`）
2. 附带 PRD 原型 HTML（`save_requirement_prototype`）
3. 原型内容：问题说明 + 修复前后对比 + 涉及文件 + 修复代码

### Step 3: 用户审核

等待用户审核需求和原型，确认方案。

### Step 4: 实现

按审核通过的方案修改代码，完成后：
- TypeScript 编译验证
- 更新 `<tool>.md` 的状态标记
- 更新 `index.md`

## 分析顺序

按 `toolConfig.ts` 中的 `TOOL_SHORT_NAMES` 注册顺序：

1. Read — ⚠️ 有问题
2. Glob — 📋 待分析
3. Grep — 📋 待分析
4. Edit — ✅ 已处理
5. Write — 📋 待分析
6. Bash — 📋 待分析
7. WebSearch — 📋 待分析
8. WebFetch — 📋 待分析
9. TodoWrite — 📋 待分析
10. Task / Agent — 📋 待分析
11. Skill — 📋 待分析
12. GitCommand — 📋 待分析
13. DeleteFile — 📋 待分析
14. Analyze — 📋 待分析
15. AskUserQuestion — 📋 待分析

## 排查检查清单

每个工具排查时逐项确认：

```
[ ] generateToolSummary switch-case 是否包含所有别名
[ ] generateCollapsedSummary 分支是否正确
[ ] generateOutputSummary 是否正确匹配
[ ] 折叠态 keyInfo 提取是否合理
[ ] 展开态是否有专用渲染器（对比通用 ToolCallBlockRenderer）
[ ] eventHandler 是否需要特殊处理（如 Edit 的 diff 提取）
[ ] 历史消息恢复是否完整
```
