# Edit 工具渲染

> 状态: ✅ 已修复

## 工具信息

| 属性 | 值 |
|---|---|
| 工具名 | `Edit`, `str_replace_editor` |
| 分类 | `edit` |
| Badge | `E` (橙色) |
| 图标 | `Edit2` |
| 配置 | `src/utils/toolConfig.ts` |

## 输入格式

```ts
{
  file_path: string,   // 目标文件路径
  old_string: string,  // 待替换的原始文本
  new_string: string,  // 替换后的新文本
}
```

## 渲染方式

### 折叠态（默认）

单行条显示:
- `E` 橙色 badge → "编辑文件" → 文件路径 → `+N -M` diff 统计 badge → 耗时 → 状态图标

diff 统计来源（优先级）:
1. `toolSummary.ts` 从 output 文本解析 `+\d+` / `-\d+`
2. fallback: 从 `input.old_string` / `input.new_string` 计算行数差

### 展开态

1. 简化输出提示: "文件已更新" (绿) / "文件更新失败" (红)
2. `DiffViewer` 行级 diff（绿增/红删/折叠大段）
3. "工具详情" 折叠区: 原始 `old_string` / `new_string` / `output`

## 数据流

```
AI engine → tool_call_start → appendToolCallBlock(callId, "Edit", args)
AI engine → tool_call_end   → updateToolCallBlock(callId, status, output)
                              → extractEditDiff(block) → updateToolCallBlockDiff(callId, diff)
Render     → ToolCallBlockRenderer
           → showDiffButton = isEditTool(name) && completed && !!diffData
           → DiffViewer(oldContent, newContent)
```

## 已修复问题

### diffData 未填充（已修复）

**根因**: `eventHandler.ts` 的 `tool_call_end` 只调用 `updateToolCallBlock`，未提取 diffData。

**修复**:
- `eventHandler.ts`: tool_call_end 后补充 `extractEditDiff` → `updateToolCallBlockDiff`
- `createConversationStore.ts`: `setMessagesFromHistory` 对历史 Edit block 回填 diffData
- `toolSummary.ts`: Edit 折叠统计增加从 input 计算 fallback

## 相关文件

| 文件 | 职责 |
|---|---|
| `src/stores/conversationStore/eventHandler.ts` | 事件处理，触发 diff 提取 |
| `src/stores/conversationStore/createConversationStore.ts` | store action，含 diffData 回填 |
| `src/utils/diffExtractor.ts` | Edit 工具识别 + diff 数据提取 |
| `src/utils/toolSummary.ts` | 折叠态摘要 + diff 统计 |
| `src/utils/toolConfig.ts` | 视觉配置（颜色/图标/badge） |
| `src/components/Chat/EnhancedChatMessages.tsx` | ToolCallBlockRenderer |
| `src/components/Diff/DiffViewer.tsx` | 行级 diff 组件 |
