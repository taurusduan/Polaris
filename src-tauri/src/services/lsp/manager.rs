/**
 * LSP 进程管理器
 * 管理语言服务器进程的启动、停止和通信
 */

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::{json, Value};

use crate::error::Result;
use crate::models::lsp::{
    LSPCompletionItem, LSPHover, LSPInstallResult,
    LSPLocation, LSPPosition, LSPRange, LSPServerType, LSPServerStatus,
};
use super::installer::LSPInstaller;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// LSP 服务器句柄
pub struct LSPServerHandle {
    /// 语言类型
    pub language: LSPServerType,
    /// 子进程
    pub process: Child,
    /// 标准输入
    pub stdin: ChildStdin,
    /// 标准输出读取器
    pub stdout_reader: BufReader<ChildStdout>,
    /// 请求 ID 计数器
    pub request_id: u64,
    /// 工作区根目录
    pub workspace_root: PathBuf,
    /// 是否已初始化
    pub initialized: bool,
}

/// LSP 管理器
pub struct LSPManager {
    /// 活动的 LSP 服务器
    servers: Arc<Mutex<HashMap<LSPServerType, LSPServerHandle>>>,
}

impl LSPManager {
    /// 创建新的 LSP 管理器
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 检查服务器状态
    pub fn check_server(&self, language: LSPServerType) -> (LSPServerStatus, Option<String>, Option<String>) {
        let result = LSPInstaller::check_server(language.clone());
        (result.status, result.path, result.version)
    }

    /// 安装服务器
    pub fn install_server(&self, language: LSPServerType) -> LSPInstallResult {
        LSPInstaller::install_server(language)
    }

    /// 卸载服务器
    pub fn uninstall_server(&self, language: LSPServerType) -> LSPInstallResult {
        // 先停止服务器
        self.stop_server(language.clone());
        LSPInstaller::uninstall_server(language)
    }

    /// 启动服务器
    pub fn start_server(&self, language: LSPServerType, workspace_root: PathBuf) -> Result<()> {
        let mut servers = self.servers.lock();

        // 检查是否已启动
        if servers.contains_key(&language) {
            return Ok(());
        }

        // 获取服务器路径
        let (status, path, _) = self.check_server(language.clone());
        if status != LSPServerStatus::Installed {
            return Err(crate::error::AppError::LSPError(format!(
                "LSP server not installed for {:?}",
                language
            )));
        }

        let server_path = path.ok_or_else(|| {
            crate::error::AppError::LSPError("Server path not found".to_string())
        })?;

        // 启动进程
        let mut process = if server_path == "rustup" {
            // rustup 方式安装的 rust-analyzer
            Command::new("rustup")
                .args(["run", "stable", "rust-analyzer"])
                .current_dir(&workspace_root)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?
        } else {
            Command::new(&server_path)
                .current_dir(&workspace_root)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?
        };

        let stdin = process.stdin.take().ok_or_else(|| {
            crate::error::AppError::LSPError("Failed to get stdin".to_string())
        })?;

        let stdout = process.stdout.take().ok_or_else(|| {
            crate::error::AppError::LSPError("Failed to get stdout".to_string())
        })?;

        let stdout_reader = BufReader::new(stdout);

        let mut handle = LSPServerHandle {
            language: language.clone(),
            process,
            stdin,
            stdout_reader,
            request_id: 0,
            workspace_root: workspace_root.clone(),
            initialized: false,
        };

        // 发送初始化请求
        let _ = Self::send_initialize(&mut handle, &workspace_root);

        handle.initialized = true;
        servers.insert(language, handle);

        Ok(())
    }

    /// 停止服务器
    pub fn stop_server(&self, language: LSPServerType) {
        let mut servers = self.servers.lock();
        if let Some(mut handle) = servers.remove(&language) {
            // 发送 shutdown 请求
            let _ = Self::send_shutdown(&mut handle);

            // 等待进程退出
            let _ = handle.process.wait();

            tracing::info!("[LSP] Server stopped for {:?}", language);
        }
    }

    /// 发送初始化请求
    fn send_initialize(handle: &mut LSPServerHandle, workspace_root: &PathBuf) -> Result<Value> {
        let root_uri = format!("file://{}", workspace_root.to_string_lossy());

        let params = json!({
            "processId": null,
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "snippetSupport": true,
                            "documentationFormat": ["markdown", "plaintext"]
                        }
                    },
                    "definition": {
                        "linkSupport": true
                    },
                    "references": {},
                    "hover": {
                        "contentFormat": ["markdown", "plaintext"]
                    },
                    "diagnostic": {
                        "dynamicRegistration": false
                    }
                },
                "workspace": {
                    "workspaceFolders": true
                }
            }
        });

        Self::send_request(handle, "initialize", params)
    }

    /// 发送 shutdown 请求
    fn send_shutdown(handle: &mut LSPServerHandle) -> Result<Value> {
        let result = Self::send_request(handle, "shutdown", json!({}));
        let _ = Self::send_notification(handle, "exit", json!({}));
        result
    }

    /// 发送请求并等待响应
    fn send_request(handle: &mut LSPServerHandle, method: &str, params: Value) -> Result<Value> {
        handle.request_id += 1;
        let id = handle.request_id;

        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        Self::write_message(&mut handle.stdin, &request)?;
        let response = Self::read_message(&mut handle.stdout_reader)?;

        // 解析响应
        if let Some(result) = response.get("result") {
            Ok(result.clone())
        } else if let Some(error) = response.get("error") {
            Err(crate::error::AppError::LSPError(format!(
                "LSP error: {:?}",
                error
            )))
        } else {
            Err(crate::error::AppError::LSPError("Invalid response".to_string()))
        }
    }

    /// 发送通知
    fn send_notification(handle: &mut LSPServerHandle, method: &str, params: Value) -> Result<()> {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });

        Self::write_message(&mut handle.stdin, &notification)
    }

    /// 写入 LSP 消息
    fn write_message(stdin: &mut ChildStdin, message: &Value) -> Result<()> {
        let content = serde_json::to_string(message)?;
        let header = format!("Content-Length: {}\r\n\r\n", content.len());

        stdin.write_all(header.as_bytes())?;
        stdin.write_all(content.as_bytes())?;
        stdin.flush()?;

        Ok(())
    }

    /// 读取 LSP 消息
    fn read_message(reader: &mut BufReader<ChildStdout>) -> Result<Value> {
        // 读取 header
        let mut content_length: usize = 0;

        loop {
            let mut line = String::new();
            reader.read_line(&mut line)?;

            let line = line.trim();
            if line.is_empty() {
                break;
            }

            if line.starts_with("Content-Length:") {
                let len_str = line["Content-Length:".len()..].trim();
                content_length = len_str.parse().unwrap_or(0);
            }
        }

        if content_length == 0 {
            return Err(crate::error::AppError::LSPError("No Content-Length header".to_string()));
        }

        // 读取 body
        let mut buffer = vec![0u8; content_length];
        reader.read_exact(&mut buffer)?;

        let message: Value = serde_json::from_slice(&buffer)?;

        Ok(message)
    }

    /// 通知文件打开
    pub fn did_open(&self, language: LSPServerType, uri: &str, content: &str) -> Result<()> {
        let mut servers = self.servers.lock();
        let handle = servers.get_mut(&language).ok_or_else(|| {
            crate::error::AppError::LSPError("Server not running".to_string())
        })?;

        let language_id = match language {
            LSPServerType::Rust => "rust",
            LSPServerType::TypeScript => "typescript",
            LSPServerType::JavaScript => "javascript",
            LSPServerType::Python => "python",
        };

        let params = json!({
            "textDocument": {
                "uri": uri,
                "languageId": language_id,
                "version": 0,
                "text": content
            }
        });

        Self::send_notification(handle, "textDocument/didOpen", params)
    }

    /// 通知文件变化
    pub fn did_change(&self, language: LSPServerType, uri: &str, content: &str) -> Result<()> {
        let mut servers = self.servers.lock();
        let handle = servers.get_mut(&language).ok_or_else(|| {
            crate::error::AppError::LSPError("Server not running".to_string())
        })?;

        let params = json!({
            "textDocument": {
                "uri": uri,
                "version": 1
            },
            "contentChanges": [{
                "text": content
            }]
        });

        Self::send_notification(handle, "textDocument/didChange", params)
    }

    /// 请求补全
    pub fn completion(&self, language: LSPServerType, uri: &str, line: u32, character: u32) -> Result<Vec<LSPCompletionItem>> {
        let mut servers = self.servers.lock();
        let handle = servers.get_mut(&language).ok_or_else(|| {
            crate::error::AppError::LSPError("Server not running".to_string())
        })?;

        let params = json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        });

        let result = Self::send_request(handle, "textDocument/completion", params)?;

        let items = if let Some(items) = result.get("items") {
            items.clone()
        } else if result.is_array() {
            result.clone()
        } else {
            json!([])
        };

        let completions: Vec<LSPCompletionItem> = serde_json::from_value(items)?;

        Ok(completions)
    }

    /// 请求跳转定义
    pub fn goto_definition(&self, language: LSPServerType, uri: &str, line: u32, character: u32) -> Result<Option<LSPLocation>> {
        let mut servers = self.servers.lock();
        let handle = servers.get_mut(&language).ok_or_else(|| {
            crate::error::AppError::LSPError("Server not running".to_string())
        })?;

        let params = json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        });

        let result = Self::send_request(handle, "textDocument/definition", params)?;

        if result.is_null() {
            return Ok(None);
        }

        // 处理 LocationLink
        if let Some(target_uri) = result.get("targetUri") {
            let uri = target_uri.as_str().unwrap_or("").to_string();
            let target_range = result.get("targetRange").ok_or_else(|| {
                crate::error::AppError::LSPError("Missing targetRange".to_string())
            })?;
            let range = parse_range(target_range)?;
            return Ok(Some(LSPLocation { uri, range }));
        }

        // 处理 Location 数组
        if result.is_array() {
            let locations: Vec<Value> = serde_json::from_value(result.clone())?;
            if let Some(first) = locations.first() {
                let uri = first.get("uri").and_then(|u| u.as_str()).unwrap_or("").to_string();
                let range = first.get("range").ok_or_else(|| {
                    crate::error::AppError::LSPError("Missing range".to_string())
                })?;
                return Ok(Some(LSPLocation { uri, range: parse_range(range)? }));
            }
        }

        // 处理单个 Location
        if let Some(uri) = result.get("uri") {
            let uri = uri.as_str().unwrap_or("").to_string();
            let range = result.get("range").ok_or_else(|| {
                crate::error::AppError::LSPError("Missing range".to_string())
            })?;
            return Ok(Some(LSPLocation { uri, range: parse_range(range)? }));
        }

        Ok(None)
    }

    /// 请求查找引用
    pub fn find_references(&self, language: LSPServerType, uri: &str, line: u32, character: u32) -> Result<Vec<LSPLocation>> {
        let mut servers = self.servers.lock();
        let handle = servers.get_mut(&language).ok_or_else(|| {
            crate::error::AppError::LSPError("Server not running".to_string())
        })?;

        let params = json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character },
            "context": { "includeDeclaration": true }
        });

        let result = Self::send_request(handle, "textDocument/references", params)?;

        let locations: Vec<LSPLocation> = if result.is_array() {
            let refs: Vec<Value> = serde_json::from_value(result)?;
            refs.iter().filter_map(|r| {
                let uri = r.get("uri").and_then(|u| u.as_str())?.to_string();
                let range = r.get("range")?;
                Some(LSPLocation {
                    uri,
                    range: parse_range(range).ok()?,
                })
            }).collect()
        } else {
            vec![]
        };

        Ok(locations)
    }

    /// 请求悬停信息
    pub fn hover(&self, language: LSPServerType, uri: &str, line: u32, character: u32) -> Result<Option<LSPHover>> {
        let mut servers = self.servers.lock();
        let handle = servers.get_mut(&language).ok_or_else(|| {
            crate::error::AppError::LSPError("Server not running".to_string())
        })?;

        let params = json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        });

        let result = Self::send_request(handle, "textDocument/hover", params)?;

        if result.is_null() {
            return Ok(None);
        }

        let contents = if let Some(contents) = result.get("contents") {
            if contents.is_string() {
                contents.as_str().unwrap_or("").to_string()
            } else if let Some(value) = contents.get("value") {
                value.as_str().unwrap_or("").to_string()
            } else {
                serde_json::to_string(contents).unwrap_or_default()
            }
        } else {
            String::new()
        };

        Ok(Some(LSPHover { contents }))
    }

    /// 检查服务器是否运行
    pub fn is_running(&self, language: LSPServerType) -> bool {
        let servers = self.servers.lock();
        servers.contains_key(&language)
    }
}

impl Default for LSPManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 解析 LSP Range
fn parse_range(value: &Value) -> Result<LSPRange> {
    let start = value.get("start").ok_or_else(|| {
        crate::error::AppError::LSPError("Missing start in range".to_string())
    })?;
    let end = value.get("end").ok_or_else(|| {
        crate::error::AppError::LSPError("Missing end in range".to_string())
    })?;

    Ok(LSPRange {
        start: LSPPosition {
            line: start.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as u32,
            character: start.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as u32,
        },
        end: LSPPosition {
            line: end.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as u32,
            character: end.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as u32,
        },
    })
}
