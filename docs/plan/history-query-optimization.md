# 历史会话查询优化

## 问题

打开历史面板耗时 3-5 秒。后端 `list_claude_code_sessions` 每次扫描全部 2131 个 JSONL 文件，逐文件全量逐行 JSON parse 提取元数据。

## 方案：stat-sort-paginate

核心思路：**不维护索引，用文件 mtime 免费排序，只解析当前页的少量文件。**

1. **stat 阶段**：`fs::metadata()` 获取 mtime + file_size，不读文件内容（微秒级）
2. **排序分页**：按 mtime 倒序排序，skip/take 切出当前页
3. **解析阶段**：只对当前页 ~20 个文件读取内容提取元数据

### 按项目过滤

`work_dir` 参数映射为 Claude 目录名（`D:\space\base\Polaris` → `D--space-base-Polaris`），只扫描对应目录。

## 改动

| 层 | 文件 | 改动 |
|----|------|------|
| Rust | `src-tauri/src/ai/history.rs` | `SessionMeta` 新增 `file_size`、`claude_project_name`、`file_path` |
| Rust | `src-tauri/src/ai/history_claude.rs` | 重写 `list_sessions`（三阶段）+ 新增路径映射和轻量解析 |
| TS | `src/services/claudeCodeHistoryService.ts` | 新增 `listSessionsPaged` 调用统一命令 |
| TS | `src/services/historyService.ts` | `getUnifiedHistory` 支持 scope + 分页 |
| TS | `src/components/Chat/SessionHistoryPanel.tsx` | 新增"当前项目/全部"切换 + 服务端分页 |

## 性能

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 当前项目（默认） | 3-5s | ~100ms |
| 全局第 1 页 | 3-5s | ~300ms |
| 翻页 | 无分页 | ~150ms |

## 经验

- `fs::metadata()` 获取 mtime 是文件系统元数据操作，不触发磁盘内容读取，比读文件内容快 3 个数量级
- Claude Code 的项目目录名是路径中 `:`、`\`、`/` 替换为 `-` 的结果
- 旧命令 `list_claude_code_sessions` 仍保留，前端已切换到 `list_sessions` 统一命令
- localStorage 最多 50 条，与后端分页结果客户端合并去重即可
