/**
 * IFlow 引擎实现
 *
 * 封装 IFlow CLI 的调用逻辑。
 * IFlow 通过监控 JSONL 文件来获取事件。
 */

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use crate::ai::event_parser::EventParser;
use crate::ai::session::SessionManager;
use crate::ai::traits::{AIEngine, EngineId, SessionOptions};
use crate::error::{AppError, Result};
use crate::models::config::Config;
use crate::models::events::StreamEvent;
use crate::models::iflow_events::IFlowJsonlEvent;
use crate::models::AIEvent;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// IFlow 引擎
pub struct IFlowEngine {
    /// 配置
    config: Config,
    /// 会话管理器
    sessions: SessionManager,
    /// CLI 路径缓存
    cli_path: Option<String>,
}

impl IFlowEngine {
    /// 创建新的 IFlow 引擎
    pub fn new(config: Config) -> Self {
        Self {
            config,
            sessions: SessionManager::new(),
            cli_path: None,
        }
    }

    /// 获取 IFlow CLI 路径
    fn get_cli_path(&mut self) -> Result<&str> {
        if self.cli_path.is_none() {
            self.cli_path = if let Some(ref path) = self.config.iflow.cli_path {
                Some(path.clone())
            } else if let Some(path) = crate::services::config_store::ConfigStore::find_iflow_path() {
                Some(path)
            } else {
                return Err(AppError::ConfigError("未找到 IFlow CLI".to_string()));
            };
        }
        Ok(self.cli_path.as_ref().unwrap())
    }

    /// 检查 CLI 是否可用
    fn check_cli_available(&mut self) -> bool {
        self.get_cli_path().is_ok()
    }

    /// 构建 IFlow 命令
    fn build_command(&self, message: &str, session_id: Option<&str>) -> Result<Command> {
        let cli_path = self.cli_path.as_ref()
            .ok_or_else(|| AppError::ProcessError("CLI 路径未初始化".to_string()))?;

        let mut cmd = Command::new(cli_path);
        cmd.arg("--yolo"); // 自动确认

        if let Some(sid) = session_id {
            cmd.arg("--resume").arg(sid);
        }

        cmd.arg("--prompt").arg(message);

        Ok(cmd)
    }

    /// 配置命令
    fn configure_command(&self, cmd: &mut Command, work_dir: Option<&str>) {
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Some(dir) = work_dir {
            cmd.current_dir(dir);
        } else if let Some(ref work_dir) = self.config.work_dir {
            cmd.current_dir(work_dir);
        }
    }

    /// 编码项目路径为 IFlow 格式
    fn encode_project_path(path: &str) -> String {
        let normalized = path.replace(":", "").replace("\\", "-").replace("/", "-");
        format!("-{}", normalized)
    }

    /// 获取项目会话目录
    fn get_project_session_dir(&self, work_dir: &str) -> Result<PathBuf> {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map_err(|_| AppError::ConfigError("无法获取用户目录".to_string()))?;

        let config_dir = PathBuf::from(home).join(".iflow");

        if !config_dir.exists() {
            return Err(AppError::ConfigError("IFlow 配置目录不存在".to_string()));
        }

        let encoded_path = Self::encode_project_path(work_dir);
        Ok(config_dir.join("projects").join(&encoded_path))
    }

    /// 查找最新的会话文件
    fn find_latest_session_file(&self, work_dir: &str) -> Result<PathBuf> {
        let session_dir = self.get_project_session_dir(work_dir)?;

        if !session_dir.exists() {
            return Err(AppError::ProcessError("会话目录不存在".to_string()));
        }

        let entries = std::fs::read_dir(&session_dir)
            .map_err(|e| AppError::ProcessError(format!("读取会话目录失败: {}", e)))?;

        let mut latest_file: Option<PathBuf> = None;
        let mut latest_time: u64 = 0;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                if let Ok(meta) = std::fs::metadata(&path) {
                    if let Ok(modified) = meta.modified() {
                        let modified_secs = modified
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        if modified_secs > latest_time {
                            latest_time = modified_secs;
                            latest_file = Some(path);
                        }
                    }
                }
            }
        }

        latest_file.ok_or_else(|| AppError::ProcessError("未找到会话文件".to_string()))
    }

    /// 查找指定会话 ID 的 JSONL 文件
    fn find_session_jsonl(&self, work_dir: &str, session_id: &str) -> Result<PathBuf> {
        let session_dir = self.get_project_session_dir(work_dir)?;

        if !session_dir.exists() {
            return Err(AppError::ProcessError("会话目录不存在".to_string()));
        }

        let entries = std::fs::read_dir(&session_dir)
            .map_err(|e| AppError::ProcessError(format!("读取会话目录失败: {}", e)))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                if filename.starts_with("session-") && filename.ends_with(".jsonl") {
                    if let Ok(file) = File::open(&path) {
                        let reader = BufReader::new(file);
                        for line in reader.lines().take(10).flatten() {
                            if let Some(event) = IFlowJsonlEvent::parse_line(&line) {
                                if event.session_id == session_id {
                                    return Ok(path);
                                }
                            }
                        }
                    }
                }
            }
        }

        Err(AppError::ProcessError(format!("未找到会话文件: {}", session_id)))
    }

    /// 获取 JSONL 文件当前行数
    fn get_jsonl_line_count(path: &Path) -> usize {
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return 0,
        };

        BufReader::new(file)
            .lines()
            .filter_map(|r| r.ok())
            .filter(|l| !l.trim().is_empty())
            .count()
    }

    /// 监控 JSONL 文件
    fn monitor_jsonl_file(
        path: PathBuf,
        session_id: String,
        start_line: usize,
        event_callback: Arc<dyn Fn(AIEvent) + Send + Sync>,
        on_complete: Option<Arc<dyn Fn(i32) + Send + Sync>>,
    ) {
        std::thread::spawn(move || {
            tracing::info!("[IFlowEngine] 开始监控文件: {:?}, 从第 {} 行开始", path, start_line);

            // 创建事件解析器
            let mut parser = EventParser::new(&session_id);

            // 等待文件创建
            let mut wait_count = 0;
            while !path.exists() && wait_count < 50 {
                std::thread::sleep(Duration::from_millis(100));
                wait_count += 1;
            }

            if !path.exists() {
                tracing::error!("[IFlowEngine] 文件未创建: {:?}", path);
                event_callback(AIEvent::error("会话文件未创建"));
                return;
            }

            // 持续监控文件
            let mut line_count = start_line;
            let mut sleep_count = 0;
            const MAX_SLEEPS: usize = 600;

            loop {
                let file = match File::open(&path) {
                    Ok(f) => f,
                    Err(_) => {
                        std::thread::sleep(Duration::from_millis(100));
                        continue;
                    }
                };

                let reader = BufReader::new(file);
                let mut current_file_lines = 0;
                let mut has_new_content = false;

                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };

                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    current_file_lines += 1;

                    // 跳过已处理的行
                    if current_file_lines <= line_count {
                        continue;
                    }

                    has_new_content = true;
                    line_count = current_file_lines;
                    sleep_count = 0;

                    // 解析事件
                    if let Some(iflow_event) = IFlowJsonlEvent::parse_line(trimmed) {
                        let stream_events = iflow_event.to_stream_events();
                        for stream_event in stream_events {
                            let is_session_end = matches!(stream_event, StreamEvent::SessionEnd);

                            // 使用 EventParser 转换为 AIEvent
                            for ai_event in parser.parse(stream_event) {
                                event_callback(ai_event);
                            }

                            if is_session_end {
                                tracing::info!("[IFlowEngine] 检测到会话结束");
                                if let Some(cb) = on_complete {
                                    cb(0);
                                }
                                return;
                            }
                        }
                    }
                }

                if !has_new_content {
                    sleep_count += 1;
                    if sleep_count >= MAX_SLEEPS {
                        tracing::warn!("[IFlowEngine] 等待超时");
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }

            if let Some(cb) = on_complete {
                cb(0);
            }
        });
    }

    /// 读取 stderr 获取 session_id
    fn read_stderr_for_session_id(
        child: &mut Child,
        sessions: Arc<std::sync::Mutex<HashMap<String, crate::ai::session::SessionInfo>>>,
        temp_id: String,
    ) -> Option<String> {
        let stderr = child.stderr.take()?;
        let reader = BufReader::new(stderr);

        for line in reader.lines().flatten() {
            tracing::debug!("[iflow stderr] {}", line);

            // 从 stderr 提取 session_id
            if let Some(id) = Self::extract_session_id_from_line(&line) {
                if let Ok(mut s) = sessions.lock() {
                    if let Some(info) = s.remove(&temp_id) {
                        s.insert(id.clone(), info);
                    }
                }
                return Some(id);
            }
        }

        None
    }

    /// 从 stderr 行中提取 session_id
    fn extract_session_id_from_line(line: &str) -> Option<String> {
        // IFlow stderr 格式: "Session ID: xxx" 或 JSON 格式
        if line.contains("session_id") {
            // 尝试 JSON 解析
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(id) = json.get("session_id").and_then(|v| v.as_str()) {
                    return Some(id.to_string());
                }
            }
        }
        None
    }
}

impl AIEngine for IFlowEngine {
    fn id(&self) -> EngineId {
        EngineId::IFlow
    }

    fn name(&self) -> &'static str {
        "IFlow"
    }

    fn description(&self) -> &'static str {
        "支持多种 AI 模型的智能编程助手"
    }

    fn is_available(&self) -> bool {
        true
    }

    fn unavailable_reason(&self) -> Option<String> {
        None
    }

    fn start_session(
        &mut self,
        message: &str,
        options: SessionOptions,
    ) -> Result<String> {
        tracing::info!("[IFlowEngine] 启动会话，消息长度: {}", message.len());

        if !self.check_cli_available() {
            return Err(AppError::ProcessError("IFlow CLI 不可用".to_string()));
        }

        let work_dir = options.work_dir.clone()
            .or_else(|| self.config.work_dir.as_ref().map(|p| p.to_string_lossy().to_string()))
            .unwrap_or_else(|| ".".to_string());

        // 构建命令
        let mut cmd = self.build_command(message, None)?;
        self.configure_command(&mut cmd, Some(&work_dir));

        // 启动进程
        let child = cmd.spawn()
            .map_err(|e| AppError::ProcessError(format!("启动 IFlow 进程失败: {}", e)))?;

        let pid = child.id();
        let temp_id = uuid::Uuid::new_v4().to_string();

        tracing::info!("[IFlowEngine] 进程启动，PID: {}, 临时 ID: {}", pid, temp_id);

        // 注册会话
        self.sessions.register(temp_id.clone(), pid, "iflow".to_string())?;

        // 后台线程监控
        let event_callback = options.event_callback.clone();
        let on_complete = options.on_complete.clone();
        let work_dir_owned = work_dir;
        let temp_id_for_monitor = temp_id.clone();

        std::thread::spawn(move || {
            // 等待会话文件创建
            std::thread::sleep(Duration::from_millis(500));

            // 尝试找到最新的会话文件
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_default();

            let config_dir = PathBuf::from(home).join(".iflow");
            let encoded_path = Self::encode_project_path(&work_dir_owned);
            let session_dir = config_dir.join("projects").join(&encoded_path);

            // 等待文件出现
            let mut wait_count = 0;
            let jsonl_path = loop {
                if let Ok(entries) = std::fs::read_dir(&session_dir) {
                    let mut latest: Option<PathBuf> = None;
                    let mut latest_time: u64 = 0;

                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                            if let Ok(meta) = std::fs::metadata(&path) {
                                if let Ok(modified) = meta.modified() {
                                    let secs = modified
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs();
                                    if secs > latest_time {
                                        latest_time = secs;
                                        latest = Some(path);
                                    }
                                }
                            }
                        }
                    }

                    if let Some(p) = latest {
                        break p;
                    }
                }

                wait_count += 1;
                if wait_count > 50 {
                    event_callback(AIEvent::error("未找到会话文件"));
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            };

            // 监控文件
            Self::monitor_jsonl_file(
                jsonl_path,
                temp_id_for_monitor,
                0,
                event_callback,
                on_complete,
            );
        });

        Ok(temp_id)
    }

    fn continue_session(
        &mut self,
        session_id: &str,
        message: &str,
        options: SessionOptions,
    ) -> Result<()> {
        tracing::info!("[IFlowEngine] 继续会话: {}, 消息长度: {}", session_id, message.len());

        if !self.check_cli_available() {
            return Err(AppError::ProcessError("IFlow CLI 不可用".to_string()));
        }

        let work_dir = options.work_dir.clone()
            .or_else(|| self.config.work_dir.as_ref().map(|p| p.to_string_lossy().to_string()))
            .unwrap_or_else(|| ".".to_string());

        // 终止旧进程
        let _ = self.sessions.kill_process(session_id);

        // 构建命令
        let mut cmd = self.build_command(message, Some(session_id))?;
        self.configure_command(&mut cmd, Some(&work_dir));

        // 启动进程
        let child = cmd.spawn()
            .map_err(|e| AppError::ProcessError(format!("继续 IFlow 会话失败: {}", e)))?;

        let pid = child.id();

        tracing::info!("[IFlowEngine] 进程启动，PID: {}", pid);

        // 更新会话 PID
        self.sessions.register(session_id.to_string(), pid, "iflow".to_string())?;

        // 查找会话文件
        let jsonl_path = self.find_session_jsonl(&work_dir, session_id)?;
        let start_line = Self::get_jsonl_line_count(&jsonl_path);

        // 启动监控
        Self::monitor_jsonl_file(
            jsonl_path,
            session_id.to_string(),
            start_line,
            options.event_callback.clone(),
            options.on_complete.clone(),
        );

        Ok(())
    }

    fn interrupt(&mut self, session_id: &str) -> Result<()> {
        tracing::info!("[IFlowEngine] 中断会话: {}", session_id);

        if self.sessions.kill_process(session_id)? {
            tracing::info!("[IFlowEngine] 会话已中断: {}", session_id);
        }

        Ok(())
    }

    fn active_session_count(&self) -> usize {
        self.sessions.count()
    }
}
