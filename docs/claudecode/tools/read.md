# Read 工具渲染

> 状态: ⚠️ 有已知问题

## 工具信息

| 属性 | 值 |
|---|---|
| 工具名 | `Read`, `read_file`, `ReadFile` |
| 分类 | `read` |
| Badge | `R` (蓝色) |
| 图标 | `FileText` |
| 配置 | `src/utils/toolConfig.ts` |

## 输入格式

```ts
{
  file_path: string,    // 目标文件路径
  offset?: number,      // 起始行号（可选）
  limit?: number,       // 读取行数（可选）
}
```

## 渲染方式

### 折叠态

单行条显示:
- `R` 蓝色 badge → "读取文件" → 文件路径 → `N 行` badge → 耗时 → 状态图标

折叠摘要由 `generateCollapsedSummary` 生成，通过 `output.split('\n').length` 计算行数。

### 展开态

无专用渲染器，使用通用 ToolCallBlockRenderer：
1. Input 参数: 以 `<pre>` 格式展示原始 JSON
2. Output: 以 `<pre>` 纯文本展示，>1000 字符截断，可展开但上限 `max-h-96`

**无语法高亮、无行号、无代码查看器。**

## 已知问题

### Bug: `Read` 缺失于 `generateToolSummary` switch-case

**位置**: `src/utils/toolSummary.ts:91`

`generateToolSummary` 的 switch 只匹配 `ReadFile` / `read_file`，未包含 `Read`。
当 Claude API 发送 `name: "Read"` 的工具调用时，落入 `default` 分支，生成泛化文案如
"Executing Read File: filename" 而非 "Reading filename"。

**修复**: 在 line 91 添加 `case 'Read':`

### 缺失功能（非 bug，后续优化）

| 缺失 | 说明 |
|---|---|
| 语法高亮 | 可从 file_path 推断语言，复用 CodeBlock 组件 |
| 行号 | output 含 cat -n 格式行号但无解析渲染 |
| 文件路径提示 | 展开态无明确路径标识 |
| 大文件截断 | >1000 字符截断，无虚拟滚动/分页 |

## 相关文件

| 文件 | 职责 |
|---|---|
| `src/utils/toolSummary.ts:91` | `generateToolSummary` 缺 `Read` case |
| `src/utils/toolSummary.ts:269` | `generateCollapsedSummary` 已正确处理 |
| `src/utils/toolConfig.ts` | 视觉配置 |
| `src/components/Chat/EnhancedChatMessages.tsx` | 通用 ToolCallBlockRenderer |
