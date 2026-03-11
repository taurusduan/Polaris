use crate::error::{AppError, Result};
use crate::models::config::{Config, EngineId};
use crate::models::events::StreamEvent;
use crate::services::iflow_service::IFlowService;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio, Child};
use std::sync::Arc;
use tauri::{Emitter, Window, State};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Claude 聊天会话
pub struct ChatSession {
    pub id: String,
    pub child: Child,
}

impl ChatSession {
    /// 创建ChatSession实例（用于continue_chat）
    pub fn with_id_and_child(id: String, child: Child) -> Self {
        Self { id, child }
    }
}

/// 从 claude.cmd 路径解析出 Node.js 和 cli.js 的路径
///
/// claude.cmd 通常位于: C:\Users\...\AppData\Roaming\npm\claude.cmd
/// node.exe 通常在同一目录或系统 PATH 中
/// cli.js 位于: node_modules\@anthropic-ai\claude-code\cli.js
#[cfg(windows)]
fn resolve_node_and_cli(claude_cmd_path: &str) -> Result<(String, String)> {
    let cmd_path = Path::new(claude_cmd_path);

    // 获取 .cmd 文件所在的目录（通常是 npm 目录）
    let npm_dir = cmd_path.parent()
        .ok_or_else(|| AppError::ProcessError("无法获取 claude.cmd 的父目录".to_string()))?;

    // 查找 node.exe
    let node_exe = find_node_exe(npm_dir)?;

    // 查找 cli.js
    let cli_js = find_cli_js(npm_dir)?;

    eprintln!("[resolve_node_and_cli] node_exe: {}", node_exe);
    eprintln!("[resolve_node_and_cli] cli_js: {}", cli_js);

    Ok((node_exe, cli_js))
}

/// 查找 node.exe 可执行文件
#[cfg(windows)]
fn find_node_exe(npm_dir: &Path) -> Result<String> {
    // 1. 检查 npm 目录下是否有 node.exe
    let local_node = npm_dir.join("node.exe");
    if local_node.exists() {
        return Ok(local_node.to_string_lossy().to_string());
    }

    // 2. 使用 where 命令查找系统中的 node.exe
    let output = Command::new("where")
        .args(["node"])
        .output()
        .map_err(|e| AppError::ProcessError(format!("查找 node.exe 失败: {}", e)))?;

    if output.status.success() {
        let node_path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(|s| s.trim().to_string());

        if let Some(path) = node_path {
            return Ok(path);
        }
    }

    // 3. 尝试常见路径
    let common_paths = vec![
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ];

    for path in common_paths {
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err(AppError::ProcessError("无法找到 node.exe".to_string()))
}

/// 查找 cli.js 文件
#[cfg(windows)]
fn find_cli_js(npm_dir: &Path) -> Result<String> {
    // cli.js 通常在: npm_dir/node_modules/@anthropic-ai/claude-code/cli.js
    let cli_js = npm_dir
        .join("node_modules")
        .join("@anthropic-ai")
        .join("claude-code")
        .join("cli.js");

    if cli_js.exists() {
        return Ok(cli_js.to_string_lossy().to_string());
    }

    // 如果不在预期位置，尝试全局 node_modules
    if let Some(roaming_appdata) = std::env::var("APPDATA").ok() {
        let global_cli = PathBuf::from(roaming_appdata)
            .join("npm")
            .join("node_modules")
            .join("@anthropic-ai")
            .join("claude-code")
            .join("cli.js");

        if global_cli.exists() {
            return Ok(global_cli.to_string_lossy().to_string());
        }
    }

    Err(AppError::ProcessError(format!(
        "无法找到 cli.js，预期位置: {}",
        cli_js.display()
    )))
}

/// 构建直接调用 Node.js 的命令
#[cfg(windows)]
fn build_node_command(node_exe: &str, cli_js: &str, message: &str, system_prompt: Option<&str>) -> Command {
    let mut cmd = Command::new(node_exe);
    cmd.arg(cli_js);

    // 添加 system-prompt 参数（如果有）
    if let Some(prompt) = system_prompt {
        if !prompt.is_empty() {
            cmd.arg("--system-prompt").arg(prompt);
        }
    }

    cmd.arg("--print")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg(message);
    cmd
}

/// 构建直接调用 Node.js 的命令（continue_chat）
#[cfg(windows)]
fn build_node_command_resume(node_exe: &str, cli_js: &str, session_id: &str, message: &str, system_prompt: Option<&str>) -> Command {
    let mut cmd = Command::new(node_exe);
    cmd.arg(cli_js)
        .arg("--resume")
        .arg(session_id);

    // 添加 system-prompt 参数（如果有）
    if let Some(prompt) = system_prompt {
        if !prompt.is_empty() {
            cmd.arg("--system-prompt").arg(prompt);
        }
    }

    cmd.arg("--print")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg(message);
    cmd
}

impl ChatSession {
    /// 启动新的聊天会话
    pub fn start(config: &Config, message: &str, system_prompt: Option<&str>) -> Result<Self> {
        eprintln!("[ChatSession::start] 启动 Claude 会话");
        let claude_cmd = config.get_claude_cmd();
        eprintln!("[ChatSession::start] claude_cmd: {}", claude_cmd);
        eprintln!("[ChatSession::start] message 长度: {} 字符", message.len());
        if let Some(prompt) = system_prompt {
            eprintln!("[ChatSession::start] systemPrompt 长度: {} 字符", prompt.len());
        }

        // 根据平台构建不同的命令
        #[cfg(windows)]
        let mut cmd = {
            // Windows: 直接调用 Node.js，绕过 cmd.exe
            let (node_exe, cli_js) = resolve_node_and_cli(&claude_cmd)?;
            build_node_command(&node_exe, &cli_js, message, system_prompt)
        };

        #[cfg(not(windows))]
        let mut cmd = {
            // Unix/Mac: 直接使用 claude 命令
            let mut c = Command::new(&claude_cmd);
            // 添加 system-prompt 参数（如果有）
            if let Some(prompt) = system_prompt {
                if !prompt.is_empty() {
                    c.arg("--system-prompt").arg(prompt);
                }
            }
            c.arg("--print")
                .arg("--verbose")
                .arg("--output-format")
                .arg("stream-json")
                .arg("--permission-mode")
                .arg("bypassPermissions")
                .arg(message)
        };

        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Windows 上隐藏窗口
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        // 设置工作目录
        if let Some(ref work_dir) = config.work_dir {
            eprintln!("[ChatSession::start] work_dir: {:?}", work_dir);
            cmd.current_dir(work_dir);
        }

        // 设置 Git Bash 环境变量 (Windows 需要)
        if let Some(ref git_bash_path) = config.git_bin_path {
            eprintln!("[ChatSession::start] 设置 CLAUDE_CODE_GIT_BASH_PATH: {}", git_bash_path);
            cmd.env("CLAUDE_CODE_GIT_BASH_PATH", git_bash_path);
        }

        eprintln!("[ChatSession::start] 执行命令: {:?}", cmd);

        let child = cmd.spawn()
            .map_err(|e| AppError::ProcessError(format!("启动 Claude 失败: {}", e)))?;

        eprintln!("[ChatSession::start] 进程 PID: {:?}", child.id());

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            child,
        })
    }

    /// 读取输出并解析事件
    pub fn read_events<F>(self, mut callback: F)
    where
        F: FnMut(StreamEvent) + Send + 'static,
    {
        eprintln!("[ChatSession::read_events] 开始读取输出");

        let stdout = match self.child.stdout {
            Some(stdout) => stdout,
            None => {
                eprintln!("[ChatSession::read_events] 无法获取 stdout");
                // 发送错误事件到前端
                callback(StreamEvent::Error {
                    error: "无法获取进程输出流".to_string(),
                });
                return;
            }
        };

        let stderr = match self.child.stderr {
            Some(stderr) => stderr,
            None => {
                eprintln!("[ChatSession::read_events] 无法获取 stderr");
                callback(StreamEvent::Error {
                    error: "无法获取进程错误流".to_string(),
                });
                return;
            }
        };

        // 启动单独的线程读取 stderr
        std::thread::spawn(move || {
            eprintln!("[stderr_reader] 开始读取 stderr");
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => eprintln!("[stderr] {}", l),
                    Err(_) => break,
                }
            }
            eprintln!("[stderr_reader] stderr 结束");
        });

        let reader = BufReader::new(stdout);
        let mut line_count = 0;
        let mut received_session_end = false;

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[ChatSession::read_events] 读取行错误: {}", e);
                    break;
                }
            };

            line_count += 1;
            let line_trimmed = line.trim();

            if line_trimmed.is_empty() {
                continue;
            }

            eprintln!("[ChatSession::read_events] 行 {}: {}", line_count, line_trimmed.chars().take(100).collect::<String>());

            // 使用 StreamEvent::parse_line 解析
            if let Some(event) = StreamEvent::parse_line(line_trimmed) {
                eprintln!("[ChatSession::read_events] 解析成功事件: {:?}", std::mem::discriminant(&event));

                // 检查是否收到 session_end 事件
                if matches!(event, StreamEvent::SessionEnd) {
                    received_session_end = true;
                }

                callback(event);
            } else {
                eprintln!("[ChatSession::read_events] 解析失败，原始内容: {}", line_trimmed.chars().take(200).collect::<String>());
            }
        }

        eprintln!("[ChatSession::read_events] 读取结束，共处理 {} 行", line_count);

        // 【关键修复】只有在进程没有正常发送 session_end 事件时才自动发送
        // 这样避免重复发送，同时确保异常退出时前端能收到通知
        if !received_session_end {
            eprintln!("[ChatSession::read_events] 进程异常退出，发送 session_end 事件");
            callback(StreamEvent::SessionEnd);
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 启动聊天会话（后台异步执行）
///
/// 统一接口，根据 engine_id 参数选择具体的 AI 引擎实现
#[tauri::command]
pub async fn start_chat(
    message: String,
    window: Window,
    state: State<'_, crate::AppState>,
    work_dir: Option<String>,
    engine_id: Option<String>,
    system_prompt: Option<String>,
    context_id: Option<String>,
) -> Result<String> {
    eprintln!("[start_chat] 收到消息，长度: {} 字符", message.len());
    if let Some(ref prompt) = system_prompt {
        eprintln!("[start_chat] 系统提示词长度: {} 字符", prompt.len());
    }
    if let Some(ref ctx_id) = context_id {
        eprintln!("[start_chat] 上下文 ID: {}", ctx_id);
    }

    // 从 AppState 获取实际配置（在独立作用域中，确保 MutexGuard 在 await 前释放）
    let (config, engine) = {
        let config_store = state.config_store.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        let mut cfg = config_store.get().clone();

        // 如果传入了 work_dir 参数，优先使用它而不是配置中的
        if let Some(ref work_dir_str) = work_dir {
            let work_dir_path = PathBuf::from(work_dir_str);
            eprintln!("[start_chat] 使用传入的工作目录: {:?}", work_dir_path);
            cfg.work_dir = Some(work_dir_path);
        }

        // 解析引擎 ID，优先使用参数，其次使用配置中的默认引擎
        let engine_id_str = engine_id.unwrap_or_else(|| cfg.default_engine.clone());
        let engine = EngineId::from_str(&engine_id_str)
            .unwrap_or(EngineId::ClaudeCode);

        eprintln!("[start_chat] 使用引擎: {:?}", engine);

        (cfg, engine)
    }; // MutexGuard 在此处释放

    match engine {
        EngineId::ClaudeCode => {
            start_claude_chat(&config, &message, window, state, system_prompt.as_deref(), context_id.as_deref()).await
        }
        EngineId::IFlow => {
            start_iflow_chat_internal(&config, &message, window, state, context_id.as_deref()).await
        }
        EngineId::Codex => {
            start_codex_chat_internal(&config, &message, window, state, context_id.as_deref()).await
        }
        EngineId::DeepSeek => {
            // DeepSeek 通过前端引擎处理，这里暂时返回错误
            Err(crate::error::AppError::Unknown("DeepSeek 引擎暂不支持通过后端启动".to_string()))
        }
    }
}

/// 启动 Claude Code 聊天会话
async fn start_claude_chat(
    config: &Config,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    system_prompt: Option<&str>,
    context_id: Option<&str>,
) -> Result<String> {
    eprintln!("[start_claude_chat] 启动 Claude 会话");

    // 启动 Claude 会话
    let session = ChatSession::start(config, message, system_prompt)?;

    let session_id = session.id.clone();
    let window_clone = window.clone();
    let process_id = session.child.id();
    let ctx_id = context_id.map(|s| s.to_string());

    eprintln!("[start_claude_chat] 临时会话 ID: {}, 进程 ID: {}", session_id, process_id);

    // 保存 PID 到全局 sessions
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id.clone(), process_id);
    }

    // 克隆 sessions Arc 以便在回调中使用
    let sessions_arc = Arc::clone(&state.sessions);
    let temp_session_id = session_id.clone();

    // 在后台线程中读取输出
    std::thread::spawn(move || {
        eprintln!("[start_claude_chat] 后台线程开始");
        session.read_events(move |event| {
            // 检查是否收到真实的 session_id
            if let StreamEvent::System { extra, .. } = &event {
                if let Some(serde_json::Value::String(real_session_id)) = extra.get("session_id") {
                    eprintln!("[start_claude_chat] 收到真实 session_id: {}, 更新映射", real_session_id);

                    if let Ok(mut sessions) = sessions_arc.lock() {
                        if let Some(&pid) = sessions.get(&temp_session_id) {
                            sessions.remove(&temp_session_id);
                            sessions.insert(real_session_id.clone(), pid);
                            eprintln!("[start_claude_chat] 映射已更新: {} -> PID {}", real_session_id, pid);
                        }
                    }
                }
            }

            // 包装事件，添加 contextId
            let event_json = if let Some(ref cid) = ctx_id {
                serde_json::json!({
                    "contextId": cid,
                    "payload": event
                }).to_string()
            } else {
                serde_json::json!({
                    "contextId": "main",
                    "payload": event
                }).to_string()
            };
            eprintln!("[start_claude_chat] 发送事件: {}", event_json);
            let _ = window_clone.emit("chat-event", event_json);
        });
        eprintln!("[start_claude_chat] 后台线程结束");
    });

    Ok(session_id)
}

/// 启动 IFlow 聊天会话
async fn start_iflow_chat_internal(
    config: &Config,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    context_id: Option<&str>,
) -> Result<String> {
    eprintln!("[start_iflow_chat] 启动 IFlow 会话");

    // 启动 IFlow 会话
    let session = IFlowService::start_chat(config, message)?;

    let temp_session_id = session.id.clone();
    let return_session_id = temp_session_id.clone();
    let window_clone = window.clone();
    let process_id = session.child.id();
    let ctx_id = context_id.map(|s| s.to_string());

    eprintln!("[start_iflow_chat] 临时会话 ID: {}, 进程 ID: {:?}", temp_session_id, process_id);

    // 保存 PID 到全局 sessions
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(temp_session_id.clone(), process_id);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let config_clone = config.clone();

    // 启动后台线程监控进程
    std::thread::spawn(move || {
        eprintln!("[start_iflow_chat] 后台线程开始");

        let temp_id = temp_session_id.clone();
        let mut session_id_found = false;

        // 读取 stderr 以获取会话信息
        let mut child = session.child;
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);

            for line in reader.lines() {
                if let Ok(line_text) = line {
                    eprintln!("[iflow stderr] {}", line_text);

                    if !session_id_found {
                        if let Some(id) = extract_session_id(&line_text) {
                            eprintln!("[start_iflow_chat] 找到 session_id: {}", id);

                            // 更新 sessions 映射
                            if let Ok(mut sessions) = sessions_arc.lock() {
                                sessions.remove(&temp_id);
                                sessions.insert(id.clone(), process_id);
                            }

                            session_id_found = true;

                            // 发送 session_id 到前端（包装 contextId）
                            let event_json = if let Some(ref cid) = ctx_id {
                                serde_json::json!({
                                    "contextId": cid,
                                    "payload": {
                                        "type": "system",
                                        "session_id": id
                                    }
                                }).to_string()
                            } else {
                                serde_json::json!({
                                    "contextId": "main",
                                    "payload": {
                                        "type": "system",
                                        "session_id": id
                                    }
                                }).to_string()
                            };
                            let _ = window_clone.emit("chat-event", event_json);

                            // 查找 JSONL 文件并启动监控
                            match IFlowService::find_session_jsonl(&config_clone, &id) {
                                Ok(jsonl_path) => {
                                    eprintln!("[start_iflow_chat] 找到 JSONL 文件: {:?}", jsonl_path);

                                let sessions_arc_clone = Arc::clone(&sessions_arc);
                                let id_clone = id.clone();
                                let window_clone2 = window_clone.clone();
                                let ctx_id_clone = ctx_id.clone();

                                // 第一次启动会话，从头开始读取（start_line = 0）
                                IFlowService::monitor_jsonl_file(
                                    jsonl_path,
                                    id_clone.clone(),
                                    move |event| {
                                        // 包装事件，添加 contextId
                                        let event_json = if let Some(ref cid) = ctx_id_clone {
                                            serde_json::json!({
                                                "contextId": cid,
                                                "payload": event
                                            }).to_string()
                                        } else {
                                            serde_json::json!({
                                                "contextId": "main",
                                                "payload": event
                                            }).to_string()
                                        };
                                        eprintln!("[iflow] 发送事件: {}", event_json);
                                        let _ = window_clone2.emit("chat-event", event_json);

                                        if matches!(event, StreamEvent::SessionEnd) {
                                            if let Ok(mut sessions) = sessions_arc_clone.lock() {
                                                sessions.remove(&id_clone);
                                            }
                                        }
                                    },
                                    0, // start_line: 从头开始
                                );
                                }
                                Err(e) => {
                                    eprintln!("[start_iflow_chat] 查找 JSONL 文件失败: {:?}", e);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 等待进程结束
        let _ = child.wait();

        eprintln!("[start_iflow_chat] 后台线程结束");
    });

    Ok(return_session_id)
}

/// 继续聊天会话
///
/// 统一接口，根据 engine_id 参数选择具体的 AI 引擎实现
#[tauri::command]
pub async fn continue_chat(
    session_id: String,
    message: String,
    window: Window,
    state: State<'_, crate::AppState>,
    work_dir: Option<String>,
    engine_id: Option<String>,
    system_prompt: Option<String>,
    context_id: Option<String>,
) -> Result<()> {
    eprintln!("[continue_chat] 继续会话: {}", session_id);
    eprintln!("[continue_chat] 消息长度: {} 字符", message.len());
    if let Some(ref prompt) = system_prompt {
        eprintln!("[continue_chat] 系统提示词长度: {} 字符", prompt.len());
    }
    if let Some(ref ctx_id) = context_id {
        eprintln!("[continue_chat] 上下文 ID: {}", ctx_id);
    }

    // 从 AppState 获取实际配置（在独立作用域中，确保 MutexGuard 在 await 前释放）
    let (config, engine) = {
        let config_store = state.config_store.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        let mut cfg = config_store.get().clone();

        // 如果传入了 work_dir 参数，优先使用它而不是配置中的
        if let Some(ref work_dir_str) = work_dir {
            let work_dir_path = PathBuf::from(work_dir_str);
            eprintln!("[continue_chat] 使用传入的工作目录: {:?}", work_dir_path);
            cfg.work_dir = Some(work_dir_path);
        }

        // 解析引擎 ID
        let engine_id_str = engine_id.unwrap_or_else(|| cfg.default_engine.clone());
        let engine = EngineId::from_str(&engine_id_str)
            .unwrap_or(EngineId::ClaudeCode);

        eprintln!("[continue_chat] 使用引擎: {:?}", engine);

        (cfg, engine)
    }; // MutexGuard 在此处释放

    match engine {
        EngineId::ClaudeCode => {
            continue_claude_chat(&config, &session_id, &message, window, state, system_prompt.as_deref(), context_id.as_deref()).await
        }
        EngineId::IFlow => {
            continue_iflow_chat_internal(&config, &session_id, &message, window, state, context_id.as_deref()).await
        }
        EngineId::Codex => {
            continue_codex_chat_internal(&config, &session_id, &message, window, state, context_id.as_deref()).await
        }
        EngineId::DeepSeek => {
            // DeepSeek 通过前端引擎处理，这里暂时返回错误
            Err(crate::error::AppError::Unknown("DeepSeek 引擎暂不支持通过后端继续会话".to_string()))
        }
    }
}

/// 继续 Claude Code 聊天会话
async fn continue_claude_chat(
    config: &Config,
    session_id: &str,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    system_prompt: Option<&str>,
    context_id: Option<&str>,
) -> Result<()> {
    eprintln!("[continue_claude_chat] 继续 Claude 会话: {}", session_id);

    // 如果已存在旧进程，先尝试终止它
    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.remove(session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_claude_chat] 发现旧进程 PID: {}, 尝试终止", pid);
        terminate_process(pid);
    }

    // 根据平台构建命令
    #[cfg(windows)]
    let mut cmd = {
        let claude_cmd = config.get_claude_cmd();
        let (node_exe, cli_js) = resolve_node_and_cli(&claude_cmd)?;
        build_node_command_resume(&node_exe, &cli_js, session_id, message, system_prompt)
    };

    #[cfg(not(windows))]
    let mut cmd = {
        let claude_cmd = config.get_claude_cmd();
        let mut c = Command::new(&claude_cmd)
            .arg("--resume")
            .arg(session_id);
        // 添加 system-prompt 参数（如果有）
        if let Some(prompt) = system_prompt {
            if !prompt.is_empty() {
                c.arg("--system-prompt").arg(prompt);
            }
        }
        c.arg("--print")
            .arg("--verbose")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--permission-mode")
            .arg("bypassPermissions")
            .arg(message)
    };

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Some(ref work_dir) = config.work_dir {
        eprintln!("[continue_claude_chat] work_dir: {:?}", work_dir);
        cmd.current_dir(work_dir);
    }

    if let Some(ref git_bash_path) = config.git_bin_path {
        eprintln!("[continue_claude_chat] 设置 CLAUDE_CODE_GIT_BASH_PATH: {}", git_bash_path);
        cmd.env("CLAUDE_CODE_GIT_BASH_PATH", git_bash_path);
    }

    eprintln!("[continue_claude_chat] 执行命令: {:?}", cmd);

    let child = cmd.spawn()
        .map_err(|e| AppError::ProcessError(format!("继续 Claude 会话失败: {}", e)))?;

    let new_pid = child.id();
    let window_clone = window.clone();
    let session_id_owned = session_id.to_string();
    let ctx_id = context_id.map(|s| s.to_string());

    eprintln!("[continue_claude_chat] 新进程 PID: {}", new_pid);

    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id_owned.clone(), new_pid);
    }

    std::thread::spawn(move || {
        eprintln!("[continue_claude_chat] 后台线程开始");
        let session = ChatSession::with_id_and_child(session_id_owned, child);
        session.read_events(move |event| {
            // 包装事件，添加 contextId
            let event_json = if let Some(ref cid) = ctx_id {
                serde_json::json!({
                    "contextId": cid,
                    "payload": event
                }).to_string()
            } else {
                serde_json::json!({
                    "contextId": "main",
                    "payload": event
                }).to_string()
            };
            eprintln!("[continue_claude_chat] 发送事件: {}", event_json);
            let _ = window_clone.emit("chat-event", event_json);
        });
        eprintln!("[continue_claude_chat] 后台线程结束");
    });

    Ok(())
}

/// 继续 IFlow 聊天会话
async fn continue_iflow_chat_internal(
    config: &Config,
    session_id: &str,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    context_id: Option<&str>,
) -> Result<()> {
    eprintln!("[continue_iflow_chat] 继续 IFlow 会话: {}", session_id);

    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.remove(session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_iflow_chat] 发现旧进程 PID: {:?}, 尝试终止", pid);
        terminate_process(pid);
    }

    let mut child = IFlowService::continue_chat(config, session_id, message)?;
    let new_pid = child.id();

    eprintln!("[continue_iflow_chat] 新进程 PID: {:?}", new_pid);

    let session_id_owned = session_id.to_string();
    let ctx_id = context_id.map(|s| s.to_string());
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id_owned.clone(), new_pid);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let window_clone = window.clone();
    let config_clone = config.clone();

    std::thread::spawn(move || {
        eprintln!("[continue_iflow_chat] 后台线程开始");

        if let Ok(jsonl_path) = IFlowService::find_session_jsonl(&config_clone, &session_id_owned) {
            // 获取当前文件行数，从下一行开始读取，避免重复发送已有内容
            let start_line = IFlowService::get_jsonl_line_count(&jsonl_path).unwrap_or(0);
            eprintln!("[continue_iflow_chat] 当前文件有 {} 行，从第 {} 行开始读取", start_line, start_line);

            let session_id_clone = session_id_owned.clone();
            let ctx_id_clone = ctx_id.clone();
            IFlowService::monitor_jsonl_file(
                jsonl_path,
                session_id_clone.clone(),
                move |event| {
                    // 包装事件，添加 contextId
                    let event_json = if let Some(ref cid) = ctx_id_clone {
                        serde_json::json!({
                            "contextId": cid,
                            "payload": event
                        }).to_string()
                    } else {
                        serde_json::json!({
                            "contextId": "main",
                            "payload": event
                        }).to_string()
                    };
                    eprintln!("[iflow] 发送事件: {}", event_json);
                    let _ = window_clone.emit("chat-event", event_json);

                    if matches!(event, StreamEvent::SessionEnd) {
                        if let Ok(mut sessions) = sessions_arc.lock() {
                            sessions.remove(&session_id_clone);
                        }
                    }
                },
                start_line, // 从当前行数开始，跳过已有内容
            );
        }

        let _ = child.wait();

        eprintln!("[continue_iflow_chat] 后台线程结束");
    });

    Ok(())
}

// ============================================================================
// Codex 会话处理
// ============================================================================

use crate::services::codex_service::CodexService;

/// 启动 Codex 聊天会话
async fn start_codex_chat_internal(
    config: &Config,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    context_id: Option<&str>,
) -> Result<String> {
    eprintln!("[start_codex_chat] 启动 Codex 会话");

    let session = CodexService::start_chat(config, message)?;

    let temp_session_id = session.id.clone();
    let return_session_id = temp_session_id.clone();
    let process_id = session.child.id();
    let ctx_id = context_id.map(|s| s.to_string());

    eprintln!("[start_codex_chat] 临时会话 ID: {}, 进程 ID: {:?}", temp_session_id, process_id);

    // 保存 PID 到全局 sessions
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(temp_session_id.clone(), process_id);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let window_clone = window.clone();

    // 启动后台线程监控进程输出
    CodexService::monitor_output(session.child, temp_session_id.clone(), move |event| {
        // 检查是否收到真实的 session_id
        if let StreamEvent::System { extra, .. } = &event {
            if let Some(serde_json::Value::String(real_session_id)) = extra.get("session_id") {
                eprintln!("[start_codex_chat] 收到真实 session_id: {}", real_session_id);

                if let Ok(mut sessions) = sessions_arc.lock() {
                    if let Some(&pid) = sessions.get(&temp_session_id) {
                        sessions.remove(&temp_session_id);
                        sessions.insert(real_session_id.clone(), pid);
                    }
                }
            }
        }

        // 包装事件，添加 contextId
        let event_payload = if let Some(ref cid) = ctx_id {
            serde_json::json!({
                "contextId": cid,
                "payload": event
            })
        } else {
            serde_json::json!({
                "contextId": "main",
                "payload": event
            })
        };
        eprintln!("[start_codex_chat] 发送事件: {}", event_payload.to_string().chars().take(200).collect::<String>());
        if let Err(e) = window_clone.emit("chat-event", &event_payload) {
            eprintln!("[start_codex_chat] 发送事件失败: {:?}", e);
        }
    });

    Ok(return_session_id)
}

/// 继续 Codex 聊天会话
async fn continue_codex_chat_internal(
    config: &Config,
    session_id: &str,
    message: &str,
    window: Window,
    state: State<'_, crate::AppState>,
    context_id: Option<&str>,
) -> Result<()> {
    eprintln!("[continue_codex_chat] 继续 Codex 会话: {}", session_id);

    let old_pid = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.remove(session_id)
    };

    if let Some(pid) = old_pid {
        eprintln!("[continue_codex_chat] 发现旧进程 PID: {:?}, 尝试终止", pid);
        terminate_process(pid);
    }

    let child = CodexService::continue_chat(config, session_id, message)?;
    let new_pid = child.id();

    eprintln!("[continue_codex_chat] 新进程 PID: {:?}", new_pid);

    let session_id_owned = session_id.to_string();
    let ctx_id = context_id.map(|s| s.to_string());
    {
        let mut sessions = state.sessions.lock()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        sessions.insert(session_id_owned.clone(), new_pid);
    }

    let sessions_arc = Arc::clone(&state.sessions);
    let window_clone = window.clone();

    CodexService::monitor_output(child, session_id_owned.clone(), move |event| {
        // 包装事件，添加 contextId
        let event_json = if let Some(ref cid) = ctx_id {
            serde_json::json!({
                "contextId": cid,
                "payload": event
            }).to_string()
        } else {
            serde_json::json!({
                "contextId": "main",
                "payload": event
            }).to_string()
        };
        eprintln!("[continue_codex_chat] 发送事件: {}", event_json);
        let _ = window_clone.emit("chat-event", event_json);

        if matches!(event, StreamEvent::SessionEnd) {
            if let Ok(mut sessions) = sessions_arc.lock() {
                sessions.remove(&session_id_owned);
            }
        }
    });

    Ok(())
}

/// 终止指定进程（包括其子进程）
fn terminate_process(pid: u32) {
    #[cfg(windows)]
    {
        use std::process::Command;
        // 使用 /T 参数终止进程树
        let result = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    eprintln!("[terminate_process] 成功终止进程树: {}", pid);
                } else {
                    eprintln!("[terminate_process] 终止进程失败: {}", String::from_utf8_lossy(&output.stderr));
                }
            }
            Err(e) => {
                eprintln!("[terminate_process] 执行 taskkill 命令失败: {}", e);
            }
        }
    }

    #[cfg(not(windows))]
    {
        use std::process::Command;
        // Unix-like: 先尝试正常终止，等待后强制终止
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .output();

        std::thread::sleep(std::time::Duration::from_millis(500));

        let result = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    eprintln!("[terminate_process] 成功终止进程: {}", pid);
                } else {
                    eprintln!("[terminate_process] 终止进程失败: {}", String::from_utf8_lossy(&output.stderr));
                }
            }
            Err(e) => {
                eprintln!("[terminate_process] 执行 kill 命令失败: {}", e);
            }
        }
    }
}

/// 中断聊天会话
#[tauri::command]
pub async fn interrupt_chat(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<()> {
    eprintln!("[interrupt_chat] 中断会话: {}", session_id);

    // 从 sessions 中取出并移除 PID
    let pid_opt = {
        let mut sessions = state.sessions.lock()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
        sessions.remove(&session_id)
    };

    if let Some(pid) = pid_opt {
        eprintln!("[interrupt_chat] 找到进程 PID: {}, 正在终止", pid);
        terminate_process(pid);
        eprintln!("[interrupt_chat] 中断命令已发送");
    } else {
        // 尝试取消 OpenAIProxy 任务
        let token_opt = {
            let mut tasks = state.openai_tasks.lock()
                .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
            tasks.remove(&session_id)
        };

        if let Some(token) = token_opt {
            eprintln!("[interrupt_chat] 找到 OpenAIProxy 任务，正在取消");
            token.cancel();
            eprintln!("[interrupt_chat] OpenAIProxy 取消命令已发送");
        } else {
            eprintln!("[interrupt_chat] 未找到会话: {}", session_id);
            return Err(AppError::ProcessError(format!("未找到会话: {}", session_id)));
        }
    }

    Ok(())
}

/// 从文本中提取 IFlow session ID
fn extract_session_id(text: &str) -> Option<String> {
    let re = regex::Regex::new(r"session-[a-f0-9-]+").ok()?;
    re.find(text).map(|m| m.as_str().to_string())
}

// ============================================================================
// IFlow 会话历史相关命令
// ============================================================================

use crate::models::iflow_events::{
    IFlowSessionMeta, IFlowHistoryMessage, IFlowFileContext, IFlowTokenStats,
};

/// 列出 IFlow 会话
#[tauri::command]
pub async fn list_iflow_sessions(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<IFlowSessionMeta>> {
    eprintln!("[list_iflow_sessions] 获取 IFlow 会话列表");

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::list_sessions(&config)
}

/// 获取 IFlow 会话历史
#[tauri::command]
pub async fn get_iflow_session_history(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<IFlowHistoryMessage>> {
    eprintln!("[get_iflow_session_history] 获取会话历史: {}", session_id);

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::get_session_history(&config, &session_id)
}

/// 获取 IFlow 文件上下文
#[tauri::command]
pub async fn get_iflow_file_contexts(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<IFlowFileContext>> {
    eprintln!("[get_iflow_file_contexts] 获取文件上下文: {}", session_id);

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::get_file_contexts(&config, &session_id)
}

/// 获取 IFlow Token 统计
#[tauri::command]
pub async fn get_iflow_token_stats(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<IFlowTokenStats> {
    eprintln!("[get_iflow_token_stats] 获取 Token 统计: {}", session_id);

    let config_store = state.config_store.lock()
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let config = config_store.get().clone();
    crate::services::iflow_service::IFlowService::get_token_stats(&config, &session_id)
}

// ============================================================================
// Claude Code 原生历史相关命令
// ============================================================================

/// Claude Code 会话元数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSessionMeta {
    pub session_id: String,
    pub first_prompt: String,
    pub message_count: u32,
    pub created: String,
    pub modified: String,
    pub file_path: String,
    pub file_size: u64,
}

/// Claude Code 会话消息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeMessage {
    pub role: String,
    pub content: serde_json::Value,
    pub timestamp: Option<String>,
}

/// 获取 Claude Code 原生会话列表
///
/// 读取 ~/.claude/projects/{项目名}/sessions-index.json
#[tauri::command]
pub async fn list_claude_code_sessions(
    project_path: Option<String>,
) -> Result<Vec<ClaudeCodeSessionMeta>> {
    eprintln!("[list_claude_code_sessions] 获取 Claude Code 会话列表");

    // 获取项目目录名（用于构建 .claude 路径）
    let project_dir = if let Some(path) = project_path {
        PathBuf::from(path)
    } else {
        // 如果没有指定，使用当前工作目录
        std::env::current_dir()
            .map_err(|e| AppError::Unknown(format!("获取当前目录失败: {}", e)))?
    };

    // 获取项目名（如 "D:\Polaris" -> "D--Polaris"）
    let project_name = project_name_from_path(&project_dir);

    // 构建 sessions-index.json 路径
    let projects_dir = claude_projects_dir();
    let index_path = projects_dir.join(&project_name).join("sessions-index.json");

    eprintln!("[list_claude_code_sessions] 项目路径: {:?}", project_dir);
    eprintln!("[list_claude_code_sessions] 项目名: {}", project_name);
    eprintln!("[list_claude_code_sessions] projects 目录: {:?}", projects_dir);
    eprintln!("[list_claude_code_sessions] 索引文件: {:?}", index_path);

    let project_session_dir = projects_dir.join(&project_name);

    // 如果索引文件存在，优先使用索引
    if index_path.exists() {
        eprintln!("[list_claude_code_sessions] 使用索引文件");
        return parse_sessions_index(&index_path);
    }

    // 索引文件不存在，扫描 .jsonl 文件
    eprintln!("[list_claude_code_sessions] 索引文件不存在，扫描 .jsonl 文件");

    if !project_session_dir.exists() {
        eprintln!("[list_claude_code_sessions] 项目会话目录不存在");
        return Ok(vec![]);
    }

    scan_jsonl_sessions(&project_session_dir)
}

/// 解析 sessions-index.json 索引文件
fn parse_sessions_index(index_path: &PathBuf) -> Result<Vec<ClaudeCodeSessionMeta>> {
    let content = std::fs::read_to_string(index_path)
        .map_err(|e| AppError::Unknown(format!("读取索引文件失败: {}", e)))?;

    let index: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::Unknown(format!("解析索引文件失败: {}", e)))?;

    let mut sessions = vec![];

    if let Some(entries) = index.get("entries").and_then(|v| v.as_array()) {
        for entry in entries {
            if let (Some(session_id), Some(first_prompt), Some(message_count), Some(created), Some(modified), Some(full_path))
                = (
                    entry.get("sessionId").and_then(|v| v.as_str()),
                    entry.get("firstPrompt").and_then(|v| v.as_str()),
                    entry.get("messageCount").and_then(|v| v.as_u64()),
                    entry.get("created").and_then(|v| v.as_str()),
                    entry.get("modified").and_then(|v| v.as_str()),
                    entry.get("fullPath").and_then(|v| v.as_str()),
                ) {
                // 获取文件大小
                let file_size = std::fs::metadata(full_path)
                    .map(|m| m.len())
                    .unwrap_or(0);

                sessions.push(ClaudeCodeSessionMeta {
                    session_id: session_id.to_string(),
                    first_prompt: truncate_string(first_prompt, 100),
                    message_count: message_count as u32,
                    created: created.to_string(),
                    modified: modified.to_string(),
                    file_path: full_path.to_string(),
                    file_size,
                });
            }
        }
    }

    // 按修改时间倒序排序
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    eprintln!("[parse_sessions_index] 找到 {} 个会话", sessions.len());
    Ok(sessions)
}

/// 扫描目录下的 .jsonl 文件并解析会话元数据
fn scan_jsonl_sessions(session_dir: &PathBuf) -> Result<Vec<ClaudeCodeSessionMeta>> {
    let mut sessions = vec![];

    let entries = std::fs::read_dir(session_dir)
        .map_err(|e| AppError::Unknown(format!("读取会话目录失败: {}", e)))?;

    for entry in entries {
        let entry = entry.map_err(|e| AppError::Unknown(format!("读取目录条目失败: {}", e)))?;
        let path = entry.path();

        // 只处理 .jsonl 文件
        if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
            if let Ok(meta) = parse_jsonl_session(&path) {
                sessions.push(meta);
            }
        }
    }

    // 按修改时间倒序排序
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    eprintln!("[scan_jsonl_sessions] 找到 {} 个会话", sessions.len());
    Ok(sessions)
}

/// 解析单个 .jsonl 文件获取会话元数据
fn parse_jsonl_session(file_path: &Path) -> std::io::Result<ClaudeCodeSessionMeta> {
    use std::fs::File;
    use std::io::BufRead;
    use std::fs::metadata;

    let file = File::open(file_path)?;
    let reader = std::io::BufReader::new(file);
    let file_size = metadata(file_path)?.len();

    // 从文件名提取 session_id
    let session_id = file_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut first_prompt = String::new();
    let mut message_count: u32 = 0;
    let mut created = String::new();
    let mut modified = String::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&line) {
            // 提取时间戳
            if let Some(ts) = entry.get("timestamp").and_then(|v| v.as_str()) {
                if created.is_empty() {
                    created = ts.to_string();
                }
                modified = ts.to_string();
            }

            // 统计消息数量
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if entry_type == "user" || entry_type == "assistant" {
                message_count += 1;
            }

            // 提取第一条用户消息
            if first_prompt.is_empty() && entry_type == "user" {
                if let Some(message) = entry.get("message") {
                    if let Some(content) = message.get("content") {
                        if let Some(text) = content.as_str() {
                            first_prompt = text.to_string();
                        } else if let Some(arr) = content.as_array() {
                            for block in arr {
                                if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                                    if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                                        first_prompt = t.to_string();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(ClaudeCodeSessionMeta {
        session_id,
        first_prompt: truncate_string(&first_prompt, 100),
        message_count,
        created,
        modified,
        file_path: file_path.to_string_lossy().to_string(),
        file_size,
    })
}

/// 获取 Claude Code 会话详细历史
#[tauri::command]
pub async fn get_claude_code_session_history(
    session_id: String,
    project_path: Option<String>,
) -> Result<Vec<ClaudeCodeMessage>> {
    eprintln!("[get_claude_code_session_history] 获取会话历史: {}", session_id);

    let project_dir = if let Some(path) = project_path {
        PathBuf::from(path)
    } else {
        std::env::current_dir()
            .map_err(|e| AppError::Unknown(format!("获取当前目录失败: {}", e)))?
    };

    let project_name = project_name_from_path(&project_dir);
    let projects_dir = claude_projects_dir();
    let session_file_path = projects_dir.join(&project_name).join(format!("{}.jsonl", session_id));

    eprintln!("[get_claude_code_session_history] 项目路径: {:?}", project_dir);
    eprintln!("[get_claude_code_session_history] 项目名: {}", project_name);
    eprintln!("[get_claude_code_session_history] projects 目录: {:?}", projects_dir);
    eprintln!("[get_claude_code_session_history] 会话文件: {:?}", session_file_path);

    if !session_file_path.exists() {
        return Err(AppError::Unknown(format!("会话文件不存在: {:?}", session_file_path)));
    }

    let mut messages = vec![];
    let content = std::fs::read_to_string(&session_file_path)
        .map_err(|e| AppError::Unknown(format!("读取会话文件失败: {}", e)))?;

    // 解析 jsonl 文件
    for line in content.lines() {
        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
            // 跳过非消息类型的条目
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if entry_type == "user" || entry_type == "assistant" {
                if let Some(message) = entry.get("message") {
                    let role = entry_type.to_string();
                    let content_val = message.get("content").cloned().unwrap_or(serde_json::json!(""));

                    // 提取时间戳
                    let timestamp = entry.get("timestamp")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    messages.push(ClaudeCodeMessage {
                        role,
                        content: content_val,
                        timestamp,
                    });
                }
            }
        }
    }

    eprintln!("[get_claude_code_session_history] 解析到 {} 条消息", messages.len());
    Ok(messages)
}

/// 将路径转换为 Claude Code 项目名格式
/// 例如: "D:\Polaris" -> "D--Polaris"
fn project_name_from_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace(':', "--")
        .replace("\\", "-")
        .replace("/", "-")
        .replace("---", "--")  // 修复 D: -> D-- 后再加 - 导致的 D--- 问题
}

/// 获取 Claude Code projects 目录
/// 通常位于 ~/.claude/projects/
fn claude_projects_dir() -> PathBuf {
    // Windows: 优先使用 USERPROFILE
    #[cfg(windows)]
    {
        if let Some(userprofile) = std::env::var("USERPROFILE").ok() {
            return PathBuf::from(userprofile).join(".claude").join("projects");
        }
    }

    // 非-Windows 或备选方案
    #[cfg(not(windows))]
    {
        if let Some(home) = std::env::var("HOME").ok() {
            return PathBuf::from(home).join(".claude").join("projects");
        }
    }

    // 最后备选：当前目录
    PathBuf::from(".claude").join("projects")
}

/// 截断字符串到指定长度
fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", s.chars().take(max_len.saturating_sub(3)).collect::<String>())
    }
}

// ============================================================================
// Codex CLI 命令
// ============================================================================

/// 路径验证结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPathValidationResult {
    /// 路径是否有效
    pub valid: bool,
    /// 错误信息
    pub error: Option<String>,
    /// Codex 版本
    pub version: Option<String>,
}

/// 查找所有可用的 Codex CLI 路径
#[tauri::command]
pub fn find_codex_paths() -> Vec<String> {
    let mut paths = Vec::new();

    // 1. 检查 PATH 环境变量
    if let Ok(path_env) = std::env::var("PATH") {
        let separators = if cfg!(windows) { ";" } else { ":" };
        for dir in path_env.split(separators) {
            let codex_path = if cfg!(windows) {
                PathBuf::from(dir).join("codex.cmd")
            } else {
                PathBuf::from(dir).join("codex")
            };

            if codex_path.exists() {
                if let Some(path_str) = codex_path.to_str() {
                    if !paths.contains(&path_str.to_string()) {
                        paths.push(path_str.to_string());
                    }
                }
            }

            // 也检查 codex.exe (Windows)
            if cfg!(windows) {
                let codex_exe = PathBuf::from(dir).join("codex.exe");
                if codex_exe.exists() {
                    if let Some(path_str) = codex_exe.to_str() {
                        if !paths.contains(&path_str.to_string()) {
                            paths.push(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. 检查常见安装位置
    #[cfg(windows)]
    {
        let common_paths = vec![
            // npm 全局安装
            PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join("npm"),
            // 用户目录
            PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()).join(".codex"),
        ];

        for dir in common_paths {
            let codex_cmd = dir.join("codex.cmd");
            if codex_cmd.exists() {
                if let Some(path_str) = codex_cmd.to_str() {
                    if !paths.contains(&path_str.to_string()) {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let common_paths = vec![
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".codex"),
        ];

        for dir in common_paths {
            let codex_path = dir.join("codex");
            if codex_path.exists() {
                if let Some(path_str) = codex_path.to_str() {
                    if !paths.contains(&path_str.to_string()) {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
    }

    paths
}

/// 验证 Codex CLI 路径
#[tauri::command]
pub fn validate_codex_path(path: String) -> CodexPathValidationResult {
    let codex_path = Path::new(&path);

    // 检查文件是否存在
    if !codex_path.exists() {
        return CodexPathValidationResult {
            valid: false,
            error: Some("文件不存在".to_string()),
            version: None,
        };
    }

    // 尝试运行 codex --version
    #[cfg(windows)]
    let output = Command::new(&path)
        .arg("--version")
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    #[cfg(not(windows))]
    let output = Command::new(&path)
        .arg("--version")
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                CodexPathValidationResult {
                    valid: true,
                    error: None,
                    version: Some(version),
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                CodexPathValidationResult {
                    valid: false,
                    error: Some(format!("执行失败: {}", stderr)),
                    version: None,
                }
            }
        }
        Err(e) => CodexPathValidationResult {
            valid: false,
            error: Some(format!("无法执行: {}", e)),
            version: None,
        },
    }
}

// ============================================================================
// Codex 历史记录命令
// ============================================================================

/// Codex 会话元数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionMeta {
    /// 会话 ID
    pub session_id: String,
    /// 会话标题（从第一条用户消息提取）
    pub title: String,
    /// 消息数量
    pub message_count: u32,
    /// 文件大小（字节）
    pub file_size: u64,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
    /// 文件路径
    pub file_path: String,
}

/// Codex 历史消息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHistoryMessage {
    /// 消息 ID
    pub id: String,
    /// 时间戳
    pub timestamp: String,
    /// 消息类型: user, assistant
    pub r#type: String,
    /// 文本内容
    pub content: String,
}

/// 获取 Codex 会话目录
fn get_codex_sessions_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    PathBuf::from(home).join(".codex").join("sessions")
}

/// 列出所有 Codex 会话
#[tauri::command]
pub fn list_codex_sessions(work_dir: Option<String>) -> Result<Vec<CodexSessionMeta>> {
    let sessions_dir = get_codex_sessions_dir();

    if !sessions_dir.exists() {
        eprintln!("[list_codex_sessions] Codex 会话目录不存在: {:?}", sessions_dir);
        return Ok(vec![]);
    }

    let mut sessions: Vec<CodexSessionMeta> = vec![];

    // 遍历 sessions 目录下的所有年份/月份目录
    fn scan_dir(dir: &Path, sessions: &mut Vec<CodexSessionMeta>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    // 递归扫描子目录
                    scan_dir(&path, sessions);
                } else if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                    // 解析 JSONL 文件
                    if let Ok(meta) = parse_codex_session_file(&path) {
                        sessions.push(meta);
                    }
                }
            }
        }
    }

    scan_dir(&sessions_dir, &mut sessions);

    // 按修改时间倒序排序
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    // 可选：过滤指定工作目录的会话
    if let Some(wd) = work_dir {
        // 从文件内容中提取工作目录并过滤
        // 这里简化处理，返回所有会话
        eprintln!("[list_codex_sessions] 过滤工作目录: {}", wd);
    }

    eprintln!("[list_codex_sessions] 找到 {} 个会话", sessions.len());
    Ok(sessions)
}

/// 解析 Codex 会话文件
fn parse_codex_session_file(file_path: &Path) -> std::io::Result<CodexSessionMeta> {
    use std::fs::File;
    use std::io::BufRead;

    let file = File::open(file_path)?;
    let reader = std::io::BufReader::new(file);
    let file_size = std::fs::metadata(file_path)?.len();

    // 从文件名提取 session_id
    let filename = file_path.file_name().unwrap_or_default().to_string_lossy();
    let session_id = extract_codex_session_id(&filename);

    let mut title = String::from("Codex 对话");
    let mut message_count: u32 = 0;
    let mut created_at = String::new();
    let mut updated_at = String::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&line) {
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

            // 从 session_meta 获取创建时间
            if entry_type == "session_meta" {
                if let Some(payload) = entry.get("payload") {
                    if let Some(ts) = payload.get("timestamp").and_then(|v| v.as_str()) {
                        if created_at.is_empty() {
                            created_at = ts.to_string();
                        }
                    }
                }
            }

            // 从 message 获取内容
            if entry_type == "message" {
                if let Some(payload) = entry.get("payload") {
                    // 时间戳
                    if let Some(ts) = payload.get("timestamp").and_then(|v| v.as_str()) {
                        updated_at = ts.to_string();
                        if created_at.is_empty() {
                            created_at = ts.to_string();
                        }
                    }

                    // 角色和内容
                    let role = payload.get("role").and_then(|v| v.as_str()).unwrap_or("");
                    if role == "user" || role == "assistant" {
                        message_count += 1;
                    }

                    // 提取标题（第一条用户消息）
                    if title == "Codex 对话" && role == "user" {
                        if let Some(content) = payload.get("content") {
                            if let Some(text) = content.as_str() {
                                title = truncate_string(text, 50);
                            } else if let Some(arr) = content.as_array() {
                                for block in arr {
                                    if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                                        if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                                            title = truncate_string(t, 50);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(CodexSessionMeta {
        session_id,
        title,
        message_count,
        file_size,
        created_at,
        updated_at,
        file_path: file_path.to_string_lossy().to_string(),
    })
}

/// 从文件名提取 session_id
fn extract_codex_session_id(filename: &str) -> String {
    // 文件名格式: rollout-2026-03-09T21-51-52-019cd2de-5521-7973-ad00-639ba81645c1.jsonl
    // 提取最后的 UUID
    if let Some(pos) = filename.rfind('-') {
        // 找到倒数第四个 '-'，因为 UUID 有 4 个 '-'
        let uuid_part = &filename[pos - 35..]; // UUID 长度为 36
        let uuid = uuid_part.trim_end_matches(".jsonl");
        return uuid.to_string();
    }
    filename.replace(".jsonl", "").to_string()
}

/// 获取 Codex 会话历史
#[tauri::command]
pub fn get_codex_session_history(file_path: String) -> Result<Vec<CodexHistoryMessage>> {
    use std::fs::File;
    use std::io::BufRead;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(AppError::Unknown(format!("文件不存在: {}", file_path)));
    }

    let file = File::open(path).map_err(|e| AppError::Unknown(format!("打开文件失败: {}", e)))?;
    let reader = std::io::BufReader::new(file);

    let mut messages: Vec<CodexHistoryMessage> = vec![];

    for line in reader.lines() {
        let line = line.map_err(|e| AppError::Unknown(format!("读取行失败: {}", e)))?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&line) {
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if entry_type == "message" {
                if let Some(payload) = entry.get("payload") {
                    let id = payload.get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let timestamp = payload.get("timestamp")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let role = payload.get("role")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    // 提取内容
                    let content = if let Some(c) = payload.get("content") {
                        if let Some(text) = c.as_str() {
                            text.to_string()
                        } else if let Some(arr) = c.as_array() {
                            let mut text_content = String::new();
                            for block in arr {
                                if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                                    if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                                        text_content.push_str(t);
                                    }
                                }
                            }
                            text_content
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    };

                    if !role.is_empty() && !content.is_empty() {
                        messages.push(CodexHistoryMessage {
                            id,
                            timestamp,
                            r#type: role.to_string(),
                            content,
                        });
                    }
                }
            }
        }
    }

    eprintln!("[get_codex_session_history] 找到 {} 条消息", messages.len());
    Ok(messages)
}
