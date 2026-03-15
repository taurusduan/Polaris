/**
 * LSP 安装检测和安装器
 */

use std::path::PathBuf;
use std::process::Command;

use crate::models::lsp::{LSPServerStatus, LSPServerType, LSPCheckResult, LSPInstallResult};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 进程创建标志：不创建新窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// LSP 安装器
pub struct LSPInstaller;

impl LSPInstaller {
    /// 检测 LSP 服务器是否已安装
    pub fn check_server(language: LSPServerType) -> LSPCheckResult {
        match language {
            LSPServerType::TypeScript | LSPServerType::JavaScript => {
                // TypeScript/JavaScript 使用 WASM，始终已安装
                LSPCheckResult {
                    status: LSPServerStatus::Installed,
                    path: Some("wasm".to_string()),
                    version: Some("bundled".to_string()),
                    error: None,
                }
            }
            LSPServerType::Rust => detect_rust_analyzer(),
            LSPServerType::Python => {
                // Python LSP 暂不支持
                LSPCheckResult {
                    status: LSPServerStatus::NotInstalled,
                    path: None,
                    version: None,
                    error: Some("Python LSP not supported yet".to_string()),
                }
            }
        }
    }

    /// 安装 LSP 服务器
    pub fn install_server(language: LSPServerType) -> LSPInstallResult {
        match language {
            LSPServerType::TypeScript | LSPServerType::JavaScript => {
                // WASM 版本无需安装
                LSPInstallResult {
                    success: true,
                    error: None,
                }
            }
            LSPServerType::Rust => {
                // 通过 rustup 安装
                install_rust_analyzer()
            }
            LSPServerType::Python => {
                LSPInstallResult {
                    success: false,
                    error: Some("Python LSP installation not implemented".to_string()),
                }
            }
        }
    }

    /// 卸载 LSP 服务器
    pub fn uninstall_server(language: LSPServerType) -> LSPInstallResult {
        match language {
            LSPServerType::TypeScript | LSPServerType::JavaScript => {
                // WASM 版本无需卸载
                LSPInstallResult {
                    success: true,
                    error: None,
                }
            }
            LSPServerType::Rust => {
                // 通过 rustup 卸载
                uninstall_rust_analyzer()
            }
            LSPServerType::Python => {
                LSPInstallResult {
                    success: false,
                    error: Some("Python LSP uninstallation not implemented".to_string()),
                }
            }
        }
    }
}

/// 检测 rust-analyzer 是否已安装
pub fn detect_rust_analyzer() -> LSPCheckResult {
    // 尝试多种检测方式
    let detections = [
        // 方式 1: 检查 rustup 组件
        detect_via_rustup(),
        // 方式 2: 检查系统 PATH
        detect_via_path(),
        // 方式 3: 检查常见安装位置
        detect_via_common_paths(),
    ];

    // 返回第一个成功的结果
    for detection in &detections {
        if detection.status == LSPServerStatus::Installed {
            return detection.clone();
        }
    }

    // 如果都失败，返回第一个结果（通常是 rustup 检测）
    detections.first().cloned().unwrap_or(LSPCheckResult {
        status: LSPServerStatus::NotInstalled,
        path: None,
        version: None,
        error: Some("rust-analyzer not found".to_string()),
    })
}

/// 通过 rustup 检测
fn detect_via_rustup() -> LSPCheckResult {
    let output = Command::new("rustup")
        .args(["component", "list", "--installed"])
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.starts_with("rust-analyzer") {
                        // 获取 rustup 版本
                        let version = get_rustup_version();
                        return LSPCheckResult {
                            status: LSPServerStatus::Installed,
                            path: Some("rustup".to_string()),
                            version,
                            error: None,
                        };
                    }
                }
            }
            LSPCheckResult {
                status: LSPServerStatus::NotInstalled,
                path: None,
                version: None,
                error: Some("rust-analyzer component not installed via rustup".to_string()),
            }
        }
        Err(e) => LSPCheckResult {
            status: LSPServerStatus::NotInstalled,
            path: None,
            version: None,
            error: Some(format!("rustup not found: {}", e)),
        },
    }
}

/// 通过 PATH 检测
fn detect_via_path() -> LSPCheckResult {
    #[cfg(windows)]
    let output = Command::new("where")
        .arg("rust-analyzer")
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    #[cfg(not(windows))]
    let output = Command::new("which")
        .arg("rust-analyzer")
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    let version = get_rust_analyzer_version(&path);
                    return LSPCheckResult {
                        status: LSPServerStatus::Installed,
                        path: Some(path),
                        version,
                        error: None,
                    };
                }
            }
            LSPCheckResult {
                status: LSPServerStatus::NotInstalled,
                path: None,
                version: None,
                error: Some("rust-analyzer not found in PATH".to_string()),
            }
        }
        Err(_) => LSPCheckResult {
            status: LSPServerStatus::NotInstalled,
            path: None,
            version: None,
            error: Some("Failed to search PATH".to_string()),
        },
    }
}

/// 通过常见路径检测
fn detect_via_common_paths() -> LSPCheckResult {
    let common_paths = get_common_rust_analyzer_paths();

    for path in common_paths {
        if path.exists() {
            let version = get_rust_analyzer_version(&path.to_string_lossy());
            return LSPCheckResult {
                status: LSPServerStatus::Installed,
                path: Some(path.to_string_lossy().to_string()),
                version,
                error: None,
            };
        }
    }

    LSPCheckResult {
        status: LSPServerStatus::NotInstalled,
        path: None,
        version: None,
        error: Some("rust-analyzer not found in common paths".to_string()),
    }
}

/// 获取常见 rust-analyzer 安装路径
fn get_common_rust_analyzer_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(windows)]
    {
        // Windows: 检查用户目录和 Program Files
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".cargo/bin/rust-analyzer.exe"));
            paths.push(home.join(".rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rust-analyzer.exe"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".cargo/bin/rust-analyzer"));
            paths.push(home.join(".rustup/toolchains/stable-x86_64-apple-darwin/bin/rust-analyzer"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".cargo/bin/rust-analyzer"));
            paths.push(home.join(".rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/rust-analyzer"));
        }
    }

    paths
}

/// 获取 rustup 版本
fn get_rustup_version() -> Option<String> {
    let output = Command::new("rustup")
        .args(["--version"])
        .output()
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(|s| s.trim().to_string());
        version
    } else {
        None
    }
}

/// 获取 rust-analyzer 版本
fn get_rust_analyzer_version(path: &str) -> Option<String> {
    let output = Command::new(path)
        .args(["--version"])
        .output()
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(|s| s.trim().to_string());
        version
    } else {
        None
    }
}

/// 通过 rustup 安装 rust-analyzer
fn install_rust_analyzer() -> LSPInstallResult {
    let output = Command::new("rustup")
        .args(["component", "add", "rust-analyzer"])
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                LSPInstallResult {
                    success: true,
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                LSPInstallResult {
                    success: false,
                    error: Some(format!("Failed to install rust-analyzer: {}", stderr)),
                }
            }
        }
        Err(e) => LSPInstallResult {
            success: false,
            error: Some(format!("Failed to run rustup: {}", e)),
        },
    }
}

/// 通过 rustup 卸载 rust-analyzer
fn uninstall_rust_analyzer() -> LSPInstallResult {
    let output = Command::new("rustup")
        .args(["component", "remove", "rust-analyzer"])
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                LSPInstallResult {
                    success: true,
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                LSPInstallResult {
                    success: false,
                    error: Some(format!("Failed to uninstall rust-analyzer: {}", stderr)),
                }
            }
        }
        Err(e) => LSPInstallResult {
            success: false,
            error: Some(format!("Failed to run rustup: {}", e)),
        },
    }
}
