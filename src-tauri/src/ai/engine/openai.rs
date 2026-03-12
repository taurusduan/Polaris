/**
 * OpenAI 兼容 API 引擎实现
 *
 * 支持 OpenAI 兼容的 API（如 DeepSeek、Moonshot 等）
 */

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::ai::session::SessionManager;
use crate::ai::traits::{AIEngine, EngineId, SessionOptions};
use crate::error::{AppError, Result};
use crate::models::events::StreamEvent;

/// OpenAI Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIProviderConfig {
    pub provider_id: String,
    pub provider_name: String,
    pub api_key: String,
    pub api_base: String,
    pub model: String,
    #[serde(default)]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub supports_tools: bool,
}

fn default_max_tokens() -> u32 {
    4096
}

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionCall,
}

/// 函数调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
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
}

/// OpenAI 流式响应
#[derive(Debug, Clone, Deserialize)]
pub struct StreamResponse {
    pub id: Option<String>,
    pub choices: Vec<StreamChoice>,
}

/// 流式选择项
#[derive(Debug, Clone, Deserialize)]
pub struct StreamChoice {
    pub index: u32,
    pub delta: Delta,
    pub finish_reason: Option<String>,
}

/// 增量内容
#[derive(Debug, Clone, Deserialize)]
pub struct Delta {
    pub role: Option<String>,
    pub content: Option<String>,
}

/// OpenAI 兼容引擎
pub struct OpenAIEngine {
    /// 配置
    config: Option<OpenAIProviderConfig>,
    /// HTTP 客户端
    client: Client,
    /// 会话管理器
    sessions: SessionManager,
    /// 取消令牌映射
    cancel_tokens: HashMap<String, CancellationToken>,
}

impl OpenAIEngine {
    /// 创建新的 OpenAI 引擎
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config: None,
            client,
            sessions: SessionManager::new(),
            cancel_tokens: HashMap::new(),
        }
    }

    /// 使用配置创建引擎
    pub fn with_config(config: OpenAIProviderConfig) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config: Some(config),
            client,
            sessions: SessionManager::new(),
            cancel_tokens: HashMap::new(),
        }
    }

    /// 更新配置
    pub fn set_config(&mut self, config: OpenAIProviderConfig) {
        self.config = Some(config);
    }

    /// 解析 SSE 行
    fn parse_sse_line(&self, line: &str) -> Option<StreamResponse> {
        let line = line.trim();
        if line.is_empty() || !line.starts_with("data:") {
            return None;
        }

        let data = line.strip_prefix("data:")?.trim();
        if data == "[DONE]" {
            return None;
        }

        serde_json::from_str(data).ok()
    }

    /// 执行聊天请求（异步）
    async fn execute_chat(
        &mut self,
        messages: Vec<ChatMessage>,
        options: SessionOptions,
        session_id: String,
    ) -> Result<()> {
        let config = self.config.clone()
            .ok_or_else(|| AppError::ValidationError("OpenAI 配置未设置".to_string()))?;

        let cancel_token = CancellationToken::new();
        self.cancel_tokens.insert(session_id.clone(), cancel_token.clone());

        let client = self.client.clone();
        let event_callback = options.event_callback.clone();

        // 构建请求
        let request = ChatRequest {
            model: config.model.clone(),
            messages,
            temperature: Some(config.temperature),
            max_tokens: Some(config.max_tokens),
            stream: Some(true),
        };

        tracing::info!("[OpenAIEngine] 发送请求到 {}", config.api_base);

        // 发送请求
        let response = client
            .post(format!("{}/chat/completions", config.api_base.trim_end_matches('/')))
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::NetworkError(format!("API 请求失败: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::NetworkError(format!("API 错误 ({}): {}", status, body)));
        }

        // 使用字节流处理 SSE
        use futures_util::StreamExt;

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            // 检查取消
            if cancel_token.is_cancelled() {
                tracing::info!("[OpenAIEngine] 会话已取消: {}", session_id);
                break;
            }

            let chunk = chunk.map_err(|e| AppError::NetworkError(format!("读取流失败: {}", e)))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // 处理完整的行
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if let Some(response) = self.parse_sse_line(&line) {
                    for choice in response.choices {
                        if let Some(content) = &choice.delta.content {
                            event_callback(StreamEvent::TextDelta {
                                text: content.clone(),
                            });
                        }

                        // 检查完成
                        if choice.finish_reason.is_some() {
                            event_callback(StreamEvent::SessionEnd);
                        }
                    }
                }
            }
        }

        // 清理
        self.cancel_tokens.remove(&session_id);

        Ok(())
    }
}

impl AIEngine for OpenAIEngine {
    fn id(&self) -> EngineId {
        EngineId::OpenAI
    }

    fn name(&self) -> &'static str {
        "OpenAI"
    }

    fn description(&self) -> &'static str {
        "OpenAI 兼容 API 引擎"
    }

    fn is_available(&self) -> bool {
        self.config.is_some()
    }

    fn unavailable_reason(&self) -> Option<String> {
        if self.config.is_none() {
            Some("OpenAI 配置未设置".to_string())
        } else {
            None
        }
    }

    fn start_session(
        &mut self,
        message: &str,
        options: SessionOptions,
    ) -> Result<String> {
        tracing::info!("[OpenAIEngine] 启动会话");

        if self.config.is_none() {
            return Err(AppError::ValidationError("OpenAI 配置未设置".to_string()));
        }

        let session_id = uuid::Uuid::new_v4().to_string();

        // 注册会话
        self.sessions.register(
            session_id.clone(),
            0, // OpenAI 没有 PID
            "openai".to_string(),
        )?;

        // 构建消息
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: Some(message.to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        // 克隆必要的数据用于异步任务
        let mut engine_clone = OpenAIEngine {
            config: self.config.clone(),
            client: self.client.clone(),
            sessions: SessionManager::new(),
            cancel_tokens: HashMap::new(),
        };

        let sid = session_id.clone();

        // 在异步运行时中执行
        tokio::spawn(async move {
            if let Err(e) = engine_clone.execute_chat(messages, options, sid.clone()).await {
                tracing::error!("[OpenAIEngine] 执行失败: {}", e);
            }
        });

        Ok(session_id)
    }

    fn continue_session(
        &mut self,
        _session_id: &str,
        _message: &str,
        _options: SessionOptions,
    ) -> Result<()> {
        // OpenAI API 是无状态的，继续会话需要维护消息历史
        // 这里简化处理，返回错误提示
        Err(AppError::ValidationError(
            "OpenAI 引擎暂不支持继续会话，请使用前端维护消息历史".to_string(),
        ))
    }

    fn interrupt(&mut self, session_id: &str) -> Result<()> {
        tracing::info!("[OpenAIEngine] 中断会话: {}", session_id);

        if let Some(token) = self.cancel_tokens.remove(session_id) {
            token.cancel();
            tracing::info!("[OpenAIEngine] 会话已取消: {}", session_id);
        }

        self.sessions.remove(session_id);
        Ok(())
    }

    fn active_session_count(&self) -> usize {
        self.cancel_tokens.len()
    }
}

impl Default for OpenAIEngine {
    fn default() -> Self {
        Self::new()
    }
}
