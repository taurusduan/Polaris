# Polaris MCP 实践指南

本文档记录了将 Polaris 项目的待办、需求库、定时任务从提示词驱动迁移到 MCP 工具的完整实践过程。

## 目录

- [背景与目标](#背景与目标)
- [架构设计](#架构设计)
- [实现细节](#实现细节)
- [迁移步骤](#迁移步骤)
- [测试验证](#测试验证)
- [最佳实践](#最佳实践)
- [问题与解决](#问题与解决)

---

## 背景与目标

### 原有问题

1. **提示词膨胀**：系统提示词包含大量文件操作指令，占用上下文
2. **行为不一致**：AI 可能忽略或误解文件操作指令
3. **缺乏类型安全**：提示词描述的操作缺乏结构化验证
4. **难以扩展**：新增功能需要修改提示词模板

### 迁移目标

1. **提示词精简**：将具体操作指令替换为通用 MCP 工具引导
2. **工作区隔离**：每个工作区有独立的数据存储
3. **类型安全**：通过 MCP JSON Schema 验证输入输出
4. **渐进式迁移**：保持前端 Tauri 命令兼容，MCP 作为 AI 接口层

---

## 架构设计

### 存储架构

```
工作区目录/
├── .polaris/
│   ├── todos.json              # 待办数据
│   ├── requirements/
│   │   ├── requirements.json   # 需求数据
│   │   └── prototypes/         # 需求原型 (HTML)
│   ├── scheduler/
│   │   ├── tasks.json          # 定时任务数据
│   │   └── logs.json           # 执行日志数据
│   └── claude/
│       └── mcp.json            # MCP 配置文件
```

### MCP 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code CLI                           │
│  (通过 --mcp-config 加载 .polaris/claude/mcp.json)          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ polaris-todo│   │ polaris-    │   │ polaris-    │
    │ -mcp.exe    │   │ requirements│   │ scheduler   │
    │             │   │ -mcp.exe    │   │ -mcp.exe    │
    └─────────────┘   └─────────────┘   └─────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │todos.json   │   │requirements/│   │scheduler/   │
    │ Repository  │   │ Repository  │   │ Repository  │
    └─────────────┘   └─────────────┘   └─────────────┘
```

### 三层架构

每类功能采用三层架构：

```
┌─────────────────────────────────────────┐
│           MCP Server Layer              │  JSON-RPC 协议处理
│  (todo_mcp_server, requirements_mcp...) │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          Repository Layer               │  数据持久化、业务逻辑
│  (todo_repository, requirement_repo...) │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│            File Layer                   │  .polaris/*.json
└─────────────────────────────────────────┘
```

---

## 实现细节

### 1. 领域模型设计

以需求为例，定义 Rust 结构体：

```rust
// src-tauri/src/models/requirement.rs

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RequirementStatus {
    Draft,
    Pending,
    Approved,
    Rejected,
    Executing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RequirementPriority {
    #[default]
    Normal,
    Low,
    High,
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: RequirementStatus,
    pub priority: RequirementPriority,
    pub tags: Vec<String>,
    pub prototype_path: Option<String>,
    pub has_prototype: bool,
    pub generated_by: RequirementSource,
    pub generated_at: i64,
    pub generator_task_id: Option<String>,
    pub reviewed_at: Option<i64>,
    pub review_note: Option<String>,
    pub execute_config: Option<RequirementExecuteConfig>,
    pub execute_log: Option<String>,
    pub executed_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub session_id: Option<String>,
    pub execute_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}
```

### 2. Repository 层实现

```rust
// src-tauri/src/services/requirement_repository.rs

const REQUIREMENTS_FILE_RELATIVE_PATH: &str = ".polaris/requirements/requirements.json";
const PROTOTYPE_DIR_RELATIVE_PATH: &str = ".polaris/requirements/prototypes";

pub struct RequirementRepository {
    file_path: PathBuf,
    prototype_dir: PathBuf,
}

impl RequirementRepository {
    pub fn new(workspace_path: impl AsRef<Path>) -> Self {
        let workspace = workspace_path.as_ref();
        Self {
            file_path: workspace.join(REQUIREMENTS_FILE_RELATIVE_PATH),
            prototype_dir: workspace.join(PROTOTYPE_DIR_RELATIVE_PATH),
        }
    }

    pub fn list_requirements(&self) -> Result<Vec<RequirementItem>> {
        Ok(self.read_file_data()?.requirements)
    }

    pub fn create_requirement(&self, params: RequirementCreateParams) -> Result<RequirementItem> {
        // 检查重复标题
        // 生成 UUID
        // 写入文件
    }

    pub fn update_requirement(&self, id: &str, updates: RequirementUpdateParams) -> Result<RequirementItem> {
        // 查找并更新
        // 状态副作用处理
    }

    pub fn save_prototype(&self, id: &str, html: &str) -> Result<String> {
        // 保存 HTML 原型文件
    }
}
```

### 3. MCP Server 层实现

```rust
// src-tauri/src/services/requirements_mcp_server.rs

pub fn run_requirements_mcp_server(workspace_path: &str) -> Result<()> {
    let repository = RequirementRepository::new(workspace_path);

    let stdin = io::stdin();
    let stdout = io::stdout();

    for line in stdin.lock().lines() {
        let request: Value = serde_json::from_str(&line?)?;
        let response = handle_request(&repository, &request);
        writeln!(stdout.lock(), "{}", serde_json::to_string(&response)?)?;
    }

    Ok(())
}

fn handle_request(repository: &RequirementRepository, request: &Value) -> Option<Value> {
    let method = request.get("method")?.as_str()?;

    match method {
        "initialize" => Some(handle_initialize(request.get("id").cloned())),
        "tools/list" => Some(handle_tools_list(request.get("id").cloned())),
        "tools/call" => Some(handle_tools_call(repository, request)),
        _ => Some(error_response(request.get("id").cloned(), -32601, "Method not found")),
    }
}
```

### 4. 工具定义示例

```rust
fn handle_tools_list(id: Option<Value>) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "result": {
            "tools": [
                {
                    "name": "list_requirements",
                    "description": "列出当前工作区需求库中的所有需求。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "create_requirement",
                    "description": "在当前工作区需求库中创建一条新需求。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string", "description": "需求标题" },
                            "description": { "type": "string", "description": "需求详细描述" },
                            "priority": { "type": "string", "enum": ["low", "normal", "high", "urgent"] },
                            "tags": { "type": "array", "items": { "type": "string" } }
                        },
                        "required": ["title", "description"]
                    }
                }
                // ... 更多工具
            ]
        },
        "id": id
    })
}
```

### 5. MCP 配置服务

```rust
// src-tauri/src/services/mcp_config_service.rs

pub struct WorkspaceMcpConfigService {
    binaries: Vec<ResolvedMcpBinary>,
}

impl WorkspaceMcpConfigService {
    pub fn from_app_paths(resource_dir: Option<PathBuf>, app_root: PathBuf) -> Result<Self> {
        // 解析 todo MCP 路径
        let todo_path = resolve_mcp_executable_path(...)?;

        // 解析 requirements MCP 路径（可选）
        let requirements_path = resolve_optional_mcp_executable_path(...);

        // 解析 scheduler MCP 路径（可选）
        let scheduler_path = resolve_optional_mcp_executable_path(...);

        Ok(Self::new(todo_path, requirements_path, scheduler_path))
    }

    pub fn prepare_workspace_config(&self, workspace_path: &str) -> Result<PathBuf> {
        let config_path = workspace_path.join(".polaris/claude/mcp.json");

        let mut servers = BTreeMap::new();
        for binary in &self.binaries {
            servers.insert(
                binary.server_name.to_string(),
                json!({
                    "command": binary.executable_path.to_string_lossy(),
                    "args": [workspace_path]
                }),
            );
        }

        write_json_atomically(&config_path, &json!({ "mcpServers": servers }))?;
        Ok(config_path)
    }
}
```

### 6. 二进制入口

```rust
// src-tauri/src/bin/polaris_requirements_mcp.rs

fn main() {
    if let Err(error) = run() {
        eprintln!("{}", error.to_message());
        std::process::exit(1);
    }
}

fn run() -> polaris_lib::error::Result<()> {
    let workspace_path = std::env::args()
        .nth(1)
        .ok_or_else(|| AppError::ValidationError("缺少 workspacePath 参数".to_string()))?;

    polaris_lib::services::requirements_mcp_server::run_requirements_mcp_server(&workspace_path)
}
```

### 7. Cargo.toml 配置

```toml
[[bin]]
name = "polaris-todo-mcp"
path = "src/bin/polaris_todo_mcp.rs"

[[bin]]
name = "polaris-requirements-mcp"
path = "src/bin/polaris_requirements_mcp.rs"

[[bin]]
name = "polaris-scheduler-mcp"
path = "src/bin/polaris_scheduler_mcp.rs"
```

---

## 迁移步骤

### 第一阶段：精简系统提示词

#### 修改前

```typescript
// src/services/workspaceReference.ts
lines.push(t('systemPrompt:todoManagement'));
lines.push(t('systemPrompt:todoStorage', { path: currentWorkspace.path }));
lines.push(t('systemPrompt:todoTrigger'));
lines.push(t('systemPrompt:todoRead'));
```

```json
// src/locales/zh-CN/systemPrompt.json
{
  "todoManagement": "待办管理:",
  "todoStorage": "待办能力绑定工作区: {{path}}",
  "todoTrigger": "当用户要求添加、更新、开始、完成或删除待办时，优先调用 MCP 待办工具",
  "todoRead": "查看待办时优先调用 list_todos，不要直接读写 .polaris/todos.json"
}
```

#### 修改后

```typescript
// src/services/workspaceReference.ts
lines.push(``);
lines.push(t('systemPrompt:workspaceToolGuidance'));
```

```json
// src/locales/zh-CN/systemPrompt.json
{
  "workspaceToolGuidance": "当需要处理待办、定时任务或需求库时，优先使用当前工作区提供的 MCP 工具，不要依赖直接读写 .polaris/*.json 的提示流程。"
}
```

### 第二阶段：实现 MCP 服务

1. **创建领域模型** (`src-tauri/src/models/*.rs`)
2. **实现 Repository 层** (`src-tauri/src/services/*_repository.rs`)
3. **实现 MCP Server 层** (`src-tauri/src/services/*_mcp_server.rs`)
4. **创建二进制入口** (`src-tauri/src/bin/polaris_*_mcp.rs`)
5. **更新模块导出** (`src-tauri/src/services/mod.rs`, `src-tauri/src/models/mod.rs`)
6. **添加 Cargo 配置** (`src-tauri/Cargo.toml`)

### 第三阶段：更新 MCP 配置服务

```rust
// 新增常量
const REQUIREMENTS_MCP_SERVER_NAME: &str = "polaris-requirements";
const SCHEDULER_MCP_SERVER_NAME: &str = "polaris-scheduler";

// 扩展构造函数
pub fn new(
    todo_executable_path: PathBuf,
    requirements_executable_path: Option<PathBuf>,
    scheduler_executable_path: Option<PathBuf>,
) -> Self { ... }
```

### 第四阶段：更新协议模板

将直接文件操作指令替换为 MCP 工具引导：

```typescript
// 修改前
### 4. 写入需求库
读取 `.polaris/requirements/requirements.json`，解析 JSON，追加需求，写回文件。

// 修改后
### 4. 写入需求库
优先使用当前工作区提供的 Requirements MCP 工具完成需求入库：
1. 使用 'list_requirements' 检查现有需求，避免重复
2. 使用 'create_requirement' 创建新需求
3. 仅在需要 UI 原型时，使用 'save_requirement_prototype' 保存原型 HTML
```

---

## 测试验证

### Rust 测试

```bash
# 运行 MCP 配置服务测试
cargo test -p polaris --lib mcp_config_service

# 运行 Todo MCP 测试
cargo test -p polaris --lib todo_mcp_server

# 运行 Scheduler MCP 测试
cargo test -p polaris --lib scheduler_mcp_server
```

### 测试结果

| 测试类别 | 通过 | 失败 |
|---------|------|------|
| MCP 配置服务 | 5 | 0 |
| Todo MCP 服务 | 3 | 0 |
| Requirements MCP 编译 | ✅ | - |
| Scheduler MCP 服务 | 1 | 0 |
| 前端 workspaceReference | 165 | 0 |

### 构建验证

```bash
# 构建所有二进制文件
cargo build -p polaris

# 验证二进制文件
./target/debug/polaris-todo-mcp <workspace_path>
./target/debug/polaris-requirements-mcp <workspace_path>
./target/debug/polaris-scheduler-mcp <workspace_path>
```

---

## 最佳实践

### 1. 工作区隔离

每个 MCP 服务接收工作区路径作为第一个参数：

```rust
fn main() {
    let workspace_path = std::env::args().nth(1)
        .expect("缺少 workspacePath 参数");
    run_mcp_server(&workspace_path);
}
```

### 2. 可选服务发现

MCP 配置服务应该优雅处理缺失的可选服务：

```rust
fn resolve_optional_mcp_executable_path(...) -> Option<PathBuf> {
    match resolve_mcp_executable_path(...) {
        Ok(path) => Some(path),
        Err(error) => {
            tracing::warn!("跳过可选 MCP server: {}", error.to_message());
            None
        }
    }
}
```

### 3. 文件初始化

Repository 应在文件不存在时自动创建：

```rust
fn read_file_data(&self) -> Result<FileData> {
    if !self.file_path.exists() {
        let empty = create_empty_file_data();
        self.write_file_data(&empty)?;
        return Ok(empty);
    }
    // 读取并解析现有文件
}
```

### 4. 数据规范化

读取时规范化历史数据：

```rust
fn normalize_file_data(raw_json: Value) -> FileData {
    // 处理缺失字段
    // 转换旧格式
    // 设置默认值
}
```

### 5. 错误处理

MCP 服务使用标准 JSON-RPC 错误响应：

```rust
fn error_response(id: Option<Value>, code: i32, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "error": { "code": code, "message": message },
        "id": id
    })
}
```

### 6. 测试覆盖

每个 MCP 服务至少包含工具数量测试：

```rust
#[test]
fn test_tools_list_count() {
    let response = handle_tools_list(Some(json!(1)));
    let tools = response["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), EXPECTED_TOOL_COUNT);
}
```

---

## 问题与解决

### 问题 1：类型不匹配

**症状**：
```rust
error[E0271]: expected `now_iso` to return `&str`, but it returns `String`
```

**原因**：`unwrap_or_else` 期望闭包返回与 `Option` 内部类型相同的值。

**解决**：
```rust
// 修改前
let updated_at = raw_json.get("updatedAt")
    .and_then(|v| v.as_str())
    .filter(|v| !v.is_empty())
    .unwrap_or_else(now_iso)
    .to_string();

// 修改后
let updated_at = raw_json.get("updatedAt")
    .and_then(|v| v.as_str())
    .filter(|v| !v.is_empty())
    .map(str::to_string)
    .unwrap_or_else(now_iso);
```

### 问题 2：测试断言过期

**症状**：前端测试期望旧提示词内容。

**解决**：更新测试断言以匹配新的通用提示词：

```typescript
// 修改前
expect(result).toContain('待办管理');
expect(result).toContain('MCP 待办工具');
expect(result).toContain('list_todos');

// 修改后
expect(result).toContain('MCP 工具');
```

### 问题 3：文件锁定

**症状**：
```
error: failed to remove file `polaris-requirements-mcp.exe`
Caused by: 拒绝访问。 (os error 5)
```

**解决**：确保没有进程持有文件句柄，或使用 `--lib` 仅构建库。

### 问题 4：JSON 安全

**问题**：description 字段包含双引号或换行符导致 JSON 损坏。

**解决**：使用 `serde_json` 自动处理转义：

```rust
// serde_json 自动转义特殊字符
let content = serde_json::to_string_pretty(&data)?;
```

---

## MCP 工具清单

### polaris-todo (7 工具)

| 工具名 | 描述 | 必填参数 |
|--------|------|----------|
| list_todos | 列出待办 | 无 |
| get_todo | 获取单个待办 | id |
| create_todo | 创建待办 | content |
| update_todo | 更新待办 | id |
| start_todo | 开始待办 | id |
| complete_todo | 完成待办 | id |
| delete_todo | 删除待办 | id |

### polaris-requirements (6 工具)

| 工具名 | 描述 | 必填参数 |
|--------|------|----------|
| list_requirements | 列出需求 | 无 |
| get_requirement | 获取单个需求 | id |
| create_requirement | 创建需求 | title, description |
| update_requirement | 更新需求 | id |
| delete_requirement | 删除需求 | id |
| save_requirement_prototype | 保存原型 | id, html |

### polaris-scheduler (12 工具)

| 工具名 | 描述 | 必填参数 |
|--------|------|----------|
| list_tasks | 列出任务 | 无 |
| get_task | 获取单个任务 | id |
| create_task | 创建任务 | name, triggerType, triggerValue, engineId, prompt |
| update_task | 更新任务 | id |
| delete_task | 删除任务 | id |
| list_logs | 分页列出日志 | 无 (可选 page, pageSize) |
| get_task_logs | 获取任务日志 | taskId |
| create_log | 创建日志 | taskId, taskName, engineId, prompt |
| update_log | 更新日志 | logId |
| delete_task_logs | 删除任务日志 | taskId |
| get_retention_config | 获取保留配置 | 无 |
| update_retention_config | 更新保留配置 | 无 |

---

## 参考资料

- [MCP Tutorial](./mcp-tutorial.md) - MCP 平台架构指南
- [Todo MCP Practice](./todo-mcp-practice.md) - Todo MCP 实践记录
- [Model Context Protocol Spec](https://modelcontextprotocol.io/) - MCP 规范文档

---

## 变更历史

| 日期 | 版本 | 描述 |
|------|------|------|
| 2026-03-29 | 1.0.0 | 初始版本，记录 Todo/Requirements/Scheduler MCP 迁移实践 |
