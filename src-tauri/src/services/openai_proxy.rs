/// OpenAI API 代理服务
///
/// 为 OpenAI 兼容 API 提供后端代理，支持流式响应和工具调用。
/// 解决前端直接调用 API 的安全问题。

use crate::error::{AppError, Result};
use crate::models::events::StreamEvent;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{Emitter, Window};
use tauri_plugin_notification::NotificationExt;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use std::process::Command as StdCommand;

#[cfg(not(windows))]
use std::process::Command as StdCommand;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// OpenAI Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIProviderConfig {
    pub provider_id: String,
    pub provider_name: String,
    pub api_key: String,
    pub api_base: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub supports_tools: bool,
}

/// OpenAI Chat 请求
#[derive(Debug, Clone, Serialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
}

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 工具定义（OpenAI 格式）
#[derive(Debug, Clone, Serialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

/// 函数定义
#[derive(Debug, Clone, Serialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

/// 函数调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

/// SSE 流事件
#[derive(Debug, Clone, Deserialize)]
struct SSEEvent {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    object: Option<String>,
    #[serde(default)]
    created: Option<i64>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    choices: Vec<SSEChoice>,
}

/// SSE 选择项
#[derive(Debug, Clone, Deserialize)]
struct SSEChoice {
    index: u32,
    #[serde(default)]
    delta: Option<SSEDelta>,
    #[serde(default)]
    finish_reason: Option<String>,
}

/// SSE Delta
#[derive(Debug, Clone, Deserialize)]
struct SSEDelta {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<SSEToolCall>>,
}

/// SSE 工具调用
#[derive(Debug, Clone, Deserialize)]
struct SSEToolCall {
    index: u32,
    id: Option<String>,
    #[serde(rename = "type")]
    call_type: Option<String>,
    function: Option<SSEFunctionCall>,
}

/// SSE 函数调用
#[derive(Debug, Clone, Deserialize)]
struct SSEFunctionCall {
    name: Option<String>,
    arguments: Option<String>,
}

/// OpenAI 代理服务
pub struct OpenAIProxyService {
    client: Client,
}

impl OpenAIProxyService {
    /// 创建新的代理服务实例
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// 获取可用工具定义
    pub fn get_tools() -> Vec<ToolDefinition> {
        vec![
            // 文件操作工具
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "read_file".to_string(),
                    description: "读取文件内容".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "文件的绝对路径"
                            }
                        },
                        "required": ["path"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "write_file".to_string(),
                    description: "写入文件内容".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "文件的绝对路径"
                            },
                            "content": {
                                "type": "string",
                                "description": "文件内容"
                            }
                        },
                        "required": ["path", "content"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "list_directory".to_string(),
                    description: "列出目录内容".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "目录的绝对路径"
                            }
                        },
                        "required": ["path"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "search_file_content".to_string(),
                    description: "在文件中搜索内容".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "pattern": {
                                "type": "string",
                                "description": "搜索模式（正则表达式）"
                            },
                            "path": {
                                "type": "string",
                                "description": "搜索路径"
                            }
                        },
                        "required": ["pattern"]
                    }),
                },
            },
            // Shell 执行工具
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "execute_bash".to_string(),
                    description: "执行 Shell 命令".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "要执行的命令"
                            }
                        },
                        "required": ["command"]
                    }),
                },
            },
        ]
    }

    /// 启动流式聊天会话
    pub async fn start_chat(
        config: OpenAIProviderConfig,
        messages: Vec<ChatMessage>,
        window: Window,
        context_id: Option<String>,
        openai_tasks: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, CancellationToken>>>,
    ) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let service = Self::new();
        let ctx_id = context_id.clone();
        let session_id_clone = session_id.clone();
        let session_id_for_task = session_id.clone();
        let cancel_token = CancellationToken::new();

        {
            let mut tasks = openai_tasks
                .lock()
                .map_err(|e| AppError::Unknown(e.to_string()))?;
            tasks.insert(session_id.clone(), cancel_token.clone());
        }

        // 在后台任务中执行
        let openai_tasks_clone = openai_tasks.clone();
        tokio::spawn(async move {
            if let Err(e) = service
                .run_chat_loop(config, messages, window, session_id_clone, ctx_id, cancel_token)
                .await
            {
                tracing::error!("[OpenAIProxy] Chat loop error: {}", e);
            }

            if let Ok(mut tasks) = openai_tasks_clone.lock() {
                tasks.remove(&session_id_for_task);
            }
        });

        Ok(session_id)
    }

    /// 运行聊天循环（处理工具调用）
    async fn run_chat_loop(
        &self,
        config: OpenAIProviderConfig,
        mut messages: Vec<ChatMessage>,
        window: Window,
        session_id: String,
        context_id: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<()> {
        tracing::info!(
            "[OpenAIProxy] 开始聊天循环, session={}, model={}, messages={:?}",
            session_id,
            config.model,
            messages
        );

        let mut tool_call_count = 0;
        const MAX_TOOL_CALLS: u32 = 50; // 防止无限循环

        loop {
            // 构建请求
            let tools = if config.supports_tools {
                Some(Self::get_tools())
            } else {
                None
            };

            let request = ChatRequest {
                model: config.model.clone(),
                messages: messages.clone(),
                temperature: Some(config.temperature),
                max_tokens: Some(config.max_tokens),
                stream: Some(true),
                tools,
            };

            tracing::info!("[OpenAIProxy] 发送 API 请求到 {}", config.api_base);

            // 发送请求
            let response = self
                .client
                .post(format!("{}/chat/completions", config.api_base.trim_end_matches('/')))
                .header("Authorization", format!("Bearer {}", config.api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| {
                    tracing::error!("[OpenAIProxy] API 请求失败: {}", e);
                    AppError::NetworkError(format!("API 请求失败: {}", e))
                })?;

            let status = response.status();
            tracing::info!("[OpenAIProxy] API 响应状态: {}", status);

            if !status.is_success() {
                let body: String = response.text().await.unwrap_or_default();
                tracing::error!("[OpenAIProxy] API 错误 ({}): {}", status, body);
                
                // 发送错误事件到前端
                self.emit_event(&window, &session_id, &context_id, StreamEvent::Error { 
                    error: format!("API 错误 ({}): {}", status, body) 
                });
                self.emit_event(&window, &session_id, &context_id, StreamEvent::SessionEnd);
                
                return Err(AppError::NetworkError(format!(
                    "API 错误 ({}): {}",
                    status, body
                )));
            }

            // 处理流式响应
            let (content, tool_calls) = self
                .process_stream(response, &window, &session_id, &context_id, &cancel_token)
                .await?;

            // 添加助手消息（无论是否有工具调用，确保对话上下文完整）
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: if content.is_empty() {
                    None
                } else {
                    Some(serde_json::Value::String(content.clone()))
                },
                tool_calls: if tool_calls.is_empty() {
                    None
                } else {
                    Some(tool_calls.clone())
                },
                tool_call_id: None,
            });

            // 如果没有工具调用，结束循环
            if tool_calls.is_empty() {
                // 发送会话结束事件
                self.emit_event(&window, &session_id, &context_id, StreamEvent::SessionEnd);
                if !cancel_token.is_cancelled() {
                    notify_ai_reply_complete(&window);
                }
                break;
            }

            // 执行工具调用
            for tool_call in &tool_calls {
                tool_call_count += 1;
                if tool_call_count > MAX_TOOL_CALLS {
                    return Err(AppError::Unknown("工具调用次数超过限制".to_string()));
                }

                // 发送工具开始事件
                self.emit_event(
                    &window,
                    &session_id,
                    &context_id,
                    StreamEvent::ToolStart {
                        tool_use_id: tool_call.id.clone(),
                        tool_name: tool_call.function.name.clone(),
                        input: serde_json::from_str(&tool_call.function.arguments)
                            .unwrap_or(serde_json::Value::Null),
                    },
                );

                // 执行工具
                let result = self.execute_tool(&tool_call.function).await;

                // 发送工具结束事件
                self.emit_event(
                    &window,
                    &session_id,
                    &context_id,
                    StreamEvent::ToolEnd {
                        tool_use_id: tool_call.id.clone(),
                        tool_name: Some(tool_call.function.name.clone()),
                        output: Some(result.clone()),
                    },
                );

                // 添加工具结果消息
                messages.push(ChatMessage {
                    role: "tool".to_string(),
                    content: Some(serde_json::Value::String(result)),
                    tool_calls: None,
                    tool_call_id: Some(tool_call.id.clone()),
                });
            }
        }

        Ok(())
    }

    /// 处理 SSE 流
    async fn process_stream(
        &self,
        response: reqwest::Response,
        window: &Window,
        session_id: &str,
        context_id: &Option<String>,
        cancel_token: &CancellationToken,
    ) -> Result<(String, Vec<ToolCall>)> {
        use futures_util::StreamExt;

        tracing::info!("[OpenAIProxy] 开始处理 SSE 流");

        let mut content = String::new();
        let mut tool_calls: HashMap<u32, ToolCall> = HashMap::new();

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut chunk_count = 0;

        loop {
            let chunk_opt = tokio::select! {
                _ = cancel_token.cancelled() => {
                    tracing::info!("[OpenAIProxy] SSE 流被取消: session={}", session_id);
                    self.emit_event(window, session_id, context_id, StreamEvent::SessionEnd);
                    break;
                }
                chunk = stream.next() => chunk,
            };

            let Some(chunk) = chunk_opt else {
                break;
            };
            let chunk = chunk.map_err(|e| {
                tracing::error!("[OpenAIProxy] 流读取错误: {}", e);
                AppError::NetworkError(e.to_string())
            })?;
            
            chunk_count += 1;
            let chunk_str = String::from_utf8_lossy(&chunk);
            
            if chunk_count <= 3 {
                tracing::info!("[OpenAIProxy] 收到 chunk #{}: {} bytes", chunk_count, chunk.len());
            }
            
            buffer.push_str(&chunk_str);

            // 处理完整的 SSE 事件（支持 \n\n 和 \r\n\r\n 分隔符）
            while let Some(pos) = buffer.find("\n\n").or_else(|| buffer.find("\r\n\r\n")) {
                let sep_len = if buffer[pos..].starts_with("\r\n\r\n") { 4 } else { 2 };
                let event_data = buffer[..pos].to_string();
                buffer = buffer[pos + sep_len..].to_string();

                // 打印原始事件数据
                tracing::info!(
                    "[OpenAIProxy] SSE 事件数据: {}",
                    truncate_for_log(&event_data, 300)
                );

                // 跳过空行
                if event_data.trim().is_empty() {
                    continue;
                }

                // 处理 SSE 事件
                for line in event_data.lines() {
                    if let Some(data) = line.strip_prefix("data:") {
                        let data = data.trim_start();
                        if data == "[DONE]" {
                            tracing::info!("[OpenAIProxy] SSE 流结束 [DONE]");
                            continue;
                        }

                        match serde_json::from_str::<SSEEvent>(data) {
                            Ok(event) => {
                                for choice in event.choices {
                                    if let Some(delta) = choice.delta {
                                        // 处理内容
                                        if let Some(text) = &delta.content {
                                            content.push_str(text);
                                            self.emit_event(
                                                window,
                                                session_id,
                                                context_id,
                                                StreamEvent::TextDelta { text: text.clone() },
                                            );
                                        }

                                        // 处理工具调用
                                        if let Some(tc) = &delta.tool_calls {
                                            for t in tc {
                                                let entry = tool_calls.entry(t.index).or_insert(ToolCall {
                                                    id: t.id.clone().unwrap_or_default(),
                                                    call_type: "function".to_string(),
                                                    function: FunctionCall {
                                                        name: String::new(),
                                                        arguments: String::new(),
                                                    },
                                                });

                                                if let Some(id) = &t.id {
                                                    entry.id = id.clone();
                                                }
                                                if let Some(name) = &t.function.as_ref().and_then(|f| f.name.clone()) {
                                                    entry.function.name = name.clone();
                                                }
                                                if let Some(args) = &t.function.as_ref().and_then(|f| f.arguments.clone()) {
                                                    entry.function.arguments.push_str(args);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "[OpenAIProxy] SSE 解析失败: {}, data: {}",
                                    e,
                                    truncate_for_log(data, 200)
                                );
                            }
                        }
                    }
                }
            }
        }

        // 检查 buffer 中是否有剩余数据
        if !buffer.trim().is_empty() {
            tracing::warn!(
                "[OpenAIProxy] Buffer 中有未处理的数据: {}",
                truncate_for_log(&buffer, 200)
            );
            
            // 尝试处理剩余数据
            for line in buffer.lines() {
                if let Some(data) = line.strip_prefix("data:") {
                    let data = data.trim_start();
                    if data != "[DONE]" {
                        tracing::info!(
                            "[OpenAIProxy] 处理剩余数据: {}",
                            truncate_for_log(data, 100)
                        );
                    }
                }
            }
        }

        tracing::info!("[OpenAIProxy] SSE 流处理完成, 内容长度: {}, 工具调用数: {}", content.len(), tool_calls.len());

        // 转换工具调用
        let mut tool_calls_vec: Vec<ToolCall> = tool_calls.into_values().collect();
        tool_calls_vec.sort_by_key(|tc| {
            tc.id.parse::<u32>().unwrap_or(0)
        });

        Ok((content, tool_calls_vec))
    }

    /// 执行工具
    async fn execute_tool(&self, function: &FunctionCall) -> String {
        tracing::info!("[OpenAIProxy] Executing tool: {}", function.name);

        let args: serde_json::Value = serde_json::from_str(&function.arguments).unwrap_or(serde_json::Value::Null);

        match function.name.as_str() {
            "read_file" => {
                if let Some(path) = args.get("path").and_then(|p| p.as_str()) {
                    match tokio::fs::read_to_string(path).await {
                        Ok(content) => content,
                        Err(e) => format!("Error reading file: {}", e),
                    }
                } else {
                    "Error: missing path parameter".to_string()
                }
            }
            "write_file" => {
                let path = args.get("path").and_then(|p| p.as_str());
                let content = args.get("content").and_then(|c| c.as_str());
                match (path, content) {
                    (Some(path), Some(content)) => {
                        // 确保父目录存在
                        if let Some(parent) = std::path::Path::new(path).parent() {
                            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                                return format!("Error creating directory: {}", e);
                            }
                        }
                        match tokio::fs::write(path, content).await {
                            Ok(_) => "File written successfully".to_string(),
                            Err(e) => format!("Error writing file: {}", e),
                        }
                    }
                    _ => "Error: missing path or content parameter".to_string(),
                }
            }
            "list_directory" => {
                if let Some(path) = args.get("path").and_then(|p| p.as_str()) {
                    match tokio::fs::read_dir(path).await {
                        Ok(mut entries) => {
                            let mut result = Vec::new();
                            while let Ok(Some(entry)) = entries.next_entry().await {
                                if let Some(name) = entry.file_name().to_str() {
                                    result.push(name.to_string());
                                }
                            }
                            result.join("\n")
                        }
                        Err(e) => format!("Error listing directory: {}", e),
                    }
                } else {
                    "Error: missing path parameter".to_string()
                }
            }
            "search_file_content" => {
                // TODO: 实现搜索功能
                "Search not implemented yet".to_string()
            }
            "execute_bash" => {
                if let Some(command) = args.get("command").and_then(|c| c.as_str()) {
                    let work_dir = args.get("work_dir").and_then(|d| d.as_str());

                    #[cfg(windows)]
                    let output = {
                        // Force UTF-8 output from cmd to avoid mojibake.
                        let wrapped = format!("chcp 65001 >nul & {}", command);
                        let mut cmd = StdCommand::new("cmd");
                        cmd.args(["/C", &wrapped]).creation_flags(CREATE_NO_WINDOW);
                        if let Some(dir) = work_dir {
                            cmd.current_dir(dir);
                        }
                        cmd.output()
                    };

                    #[cfg(not(windows))]
                    let output = {
                        let mut cmd = StdCommand::new("sh");
                        cmd.args(["-c", command]);
                        if let Some(dir) = work_dir {
                            cmd.current_dir(dir);
                        }
                        cmd.output()
                    };

                    match output {
                        Ok(output) => {
                            let stdout = String::from_utf8_lossy(&output.stdout);
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            if stderr.is_empty() {
                                stdout.to_string()
                            } else {
                                format!("{}\n{}", stdout, stderr)
                            }
                        }
                        Err(e) => format!("Error executing command: {}", e),
                    }
                } else {
                    "Error: missing command parameter".to_string()
                }
            }
            _ => format!("Unknown tool: {}", function.name),
        }
    }

    /// 发送事件到前端
    fn emit_event(
        &self,
        window: &Window,
        _session_id: &str,
        context_id: &Option<String>,
        event: StreamEvent,
    ) {
        let event_json = if let Some(cid) = context_id {
            serde_json::json!({
                "contextId": cid,
                "payload": event
            })
            .to_string()
        } else {
            serde_json::json!({
                "contextId": "main",
                "payload": event
            })
            .to_string()
        };

        tracing::debug!(
            "[OpenAIProxy] 发送事件: {}",
            truncate_for_log(&event_json, 100)
        );
        
        if let Err(e) = window.emit("chat-event", &event_json) {
            tracing::error!("[OpenAIProxy] 发送事件失败: {}", e);
        }
    }
}

fn notify_ai_reply_complete(window: &Window) {
    let _ = window
        .notification()
        .builder()
        .title("Polaris")
        .body("已完成本轮回复")
        .show();
}

fn truncate_for_log(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        value.chars().take(max_chars).collect()
    }
}

impl Default for OpenAIProxyService {
    fn default() -> Self {
        Self::new()
    }
}
