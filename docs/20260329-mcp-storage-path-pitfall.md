# MCP 存储路径避坑指南

## 问题现象

MCP 创建的数据与前端查询路径不一致：

| 组件 | 存储路径 | 状态 |
|------|----------|------|
| MCP 创建 | `config_dir/.polaris/requirements/` | 旧路径 |
| 前端查询 | `config_dir/requirements/` | 新路径 |

## 根因

**MCP 二进制未同步更新**：代码重构后 MCP 可执行文件未重新编译，仍在使用旧版代码。

```
时间线：
10:46  MCP 二进制编译（旧代码，路径含 .polaris）
12:36  重构提交（路径改为 config_dir/requirements）
--     MCP 未重编译，继续使用旧二进制
```

旧版代码（已删除）：
```rust
const REQUIREMENTS_FILE_RELATIVE_PATH: &str = ".polaris/requirements/requirements.json";
```

新版代码：
```rust
let storage_dir = config_dir.join("requirements");  // 无 .polaris 前缀
```

## 解决方案

重构后务必重新编译 MCP 二进制：

```bash
cargo build --bin polaris-requirements-mcp
cargo build --bin polaris-todo-mcp
```

## 统一存储路径

| 数据类型 | 存储路径 |
|----------|----------|
| 待办 | `config_dir/todo/todos.json` |
| 需求 | `config_dir/requirements/requirements.json` |
| 原型 | `config_dir/requirements/prototypes/` |

**config_dir** = `{app_config_dir}/com.polaris.app`（Tauri `app_config_dir()`）

## 检查清单

- [ ] 代码重构后重新编译所有 MCP 二进制
- [ ] 确认 `mcp.json` 中的参数格式正确（双参数：`config_dir` + `workspace_path`）
- [ ] 验证 MCP 服务已重启加载新二进制
