use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};

const MCP_SERVER_NAME: &str = "polaris-todo";
const MCP_CONFIG_RELATIVE_PATH: &str = ".polaris/claude/mcp.json";
const TODO_MCP_BIN_NAME: &str = "polaris-todo-mcp";
const TODO_MCP_BUNDLE_RELATIVE_PATH: &str = "bin/polaris-todo-mcp.exe";
const TODO_MCP_BUNDLE_FALLBACK_RELATIVE_PATH: &str = "polaris-todo-mcp.exe";
const TODO_MCP_DEV_RELATIVE_PATH: &str = "src-tauri/target/debug/polaris-todo-mcp.exe";

#[derive(Debug, Clone, serde::Serialize)]
struct ClaudeMcpServerConfig {
    command: String,
    args: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeMcpConfig {
    mcp_servers: std::collections::BTreeMap<String, ClaudeMcpServerConfig>,
}

pub struct WorkspaceMcpConfigService {
    executable_path: PathBuf,
}

impl WorkspaceMcpConfigService {
    pub fn new(executable_path: PathBuf) -> Self {
        Self { executable_path }
    }

    pub fn executable_path(&self) -> &Path {
        &self.executable_path
    }

    pub fn from_app_paths(resource_dir: Option<PathBuf>, app_root: PathBuf) -> Result<Self> {
        let executable_path = resolve_mcp_executable_path(resource_dir, app_root)?;
        Ok(Self::new(executable_path))
    }

    pub fn prepare_todo_config(&self, workspace_path: &str) -> Result<PathBuf> {
        let normalized_workspace = workspace_path.trim();
        if normalized_workspace.is_empty() {
            return Err(AppError::ValidationError("workspace_path 不能为空".to_string()));
        }

        if !self.executable_path.exists() {
            return Err(AppError::ProcessError(format!(
                "Todo MCP 可执行文件不存在: {}",
                self.executable_path.display()
            )));
        }

        let workspace_dir = PathBuf::from(normalized_workspace);
        let config_path = workspace_dir.join(Path::new(MCP_CONFIG_RELATIVE_PATH));

        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::ProcessError(format!("创建 MCP 配置目录失败: {}", e))
            })?;
        }

        let command = self.executable_path.to_string_lossy().to_string();
        let args = vec![normalized_workspace.to_string()];

        let mut servers = std::collections::BTreeMap::new();
        servers.insert(
            MCP_SERVER_NAME.to_string(),
            ClaudeMcpServerConfig { command, args },
        );

        let config = ClaudeMcpConfig {
            mcp_servers: servers,
        };

        write_json_atomically(&config_path, &config)?;
        Ok(config_path)
    }
}

fn resolve_mcp_executable_path(resource_dir: Option<PathBuf>, app_root: PathBuf) -> Result<PathBuf> {
    if let Some(ref resource_dir) = resource_dir {
        let bundled_candidates = [
            resource_dir.join(Path::new(TODO_MCP_BUNDLE_RELATIVE_PATH)),
            resource_dir.join(Path::new(TODO_MCP_BUNDLE_FALLBACK_RELATIVE_PATH)),
        ];

        for bundled_path in bundled_candidates {
            if bundled_path.exists() {
                return Ok(bundled_path);
            }
        }

        tracing::warn!(
            "[MCP] 未在资源目录找到 Todo MCP 可执行文件，已检查: '{}' 和 '{}'，回退到开发目录",
            resource_dir.join(Path::new(TODO_MCP_BUNDLE_RELATIVE_PATH)).display(),
            resource_dir
                .join(Path::new(TODO_MCP_BUNDLE_FALLBACK_RELATIVE_PATH))
                .display()
        );
    }

    if let Ok(path) = std::env::var("POLARIS_TODO_MCP_PATH") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            let override_path = PathBuf::from(trimmed);
            if override_path.exists() {
                return Ok(override_path);
            }

            tracing::warn!(
                "[MCP] POLARIS_TODO_MCP_PATH 指向的文件不存在，继续回退: {}",
                override_path.display()
            );
        }
    }

    let dev_path = app_root.join(Path::new(TODO_MCP_DEV_RELATIVE_PATH));
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err(AppError::ProcessError(format!(
        "无法定位 {}。已检查资源路径 '{}'、'{}' 与开发路径 '{}'",
        TODO_MCP_BIN_NAME,
        resource_dir
            .as_ref()
            .map(|dir| dir.join(Path::new(TODO_MCP_BUNDLE_RELATIVE_PATH)).display().to_string())
            .unwrap_or_else(|| "<无资源目录>".to_string()),
        resource_dir
            .as_ref()
            .map(|dir| dir.join(Path::new(TODO_MCP_BUNDLE_FALLBACK_RELATIVE_PATH)).display().to_string())
            .unwrap_or_else(|| "<无资源目录>".to_string()),
        dev_path.display()
    )))
}

fn write_json_atomically<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let temp_path = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(value)?;
    std::fs::write(&temp_path, format!("{}\n", content))?;
    std::fs::rename(&temp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_bundled_resource_path_when_present() {
        let temp_root = std::env::temp_dir().join(format!("polaris-mcp-test-{}", uuid::Uuid::new_v4()));
        let app_root = temp_root.join("app-root");
        let resource_dir = temp_root.join("resources");

        std::fs::create_dir_all(app_root.join("src-tauri/target/debug")).unwrap();
        std::fs::create_dir_all(resource_dir.join("bin")).unwrap();
        std::fs::write(app_root.join("src-tauri/target/debug/polaris-todo-mcp.exe"), "dev bin").unwrap();
        std::fs::write(resource_dir.join("bin/polaris-todo-mcp.exe"), "bundled bin").unwrap();

        let path = resolve_mcp_executable_path(Some(resource_dir.clone()), app_root.clone()).unwrap();
        assert_eq!(path, resource_dir.join("bin/polaris-todo-mcp.exe"));

        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn prefers_root_level_bundled_path_when_present() {
        let temp_root = std::env::temp_dir().join(format!("polaris-mcp-test-{}", uuid::Uuid::new_v4()));
        let app_root = temp_root.join("app-root");
        let resource_dir = temp_root.join("resources");

        std::fs::create_dir_all(app_root.join("src-tauri/target/debug")).unwrap();
        std::fs::create_dir_all(&resource_dir).unwrap();
        std::fs::write(app_root.join("src-tauri/target/debug/polaris-todo-mcp.exe"), "dev bin").unwrap();
        std::fs::write(resource_dir.join("polaris-todo-mcp.exe"), "bundled root bin").unwrap();

        let path = resolve_mcp_executable_path(Some(resource_dir.clone()), app_root.clone()).unwrap();
        assert_eq!(path, resource_dir.join("polaris-todo-mcp.exe"));

        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn falls_back_to_dev_path_when_resource_missing() {
        let temp_root = std::env::temp_dir().join(format!("polaris-mcp-test-{}", uuid::Uuid::new_v4()));
        let app_root = temp_root.join("app-root");
        let resource_dir = temp_root.join("resources");

        std::fs::create_dir_all(app_root.join("src-tauri/target/debug")).unwrap();
        std::fs::create_dir_all(&resource_dir).unwrap();
        std::fs::write(app_root.join("src-tauri/target/debug/polaris-todo-mcp.exe"), "dev bin").unwrap();

        let path = resolve_mcp_executable_path(Some(resource_dir), app_root.clone()).unwrap();
        assert_eq!(path, app_root.join("src-tauri/target/debug/polaris-todo-mcp.exe"));

        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn prepares_workspace_scoped_mcp_config() {
        let temp_root = std::env::temp_dir().join(format!("polaris-mcp-test-{}", uuid::Uuid::new_v4()));
        let workspace = temp_root.join("workspace-a");
        let executable_path = temp_root.join("bin/polaris-todo-mcp.exe");

        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(executable_path.parent().unwrap()).unwrap();
        std::fs::write(&executable_path, "bin").unwrap();

        let service = WorkspaceMcpConfigService::new(executable_path.clone());
        let config_path = service.prepare_todo_config(workspace.to_string_lossy().as_ref()).unwrap();

        assert_eq!(config_path, workspace.join(".polaris/claude/mcp.json"));

        let content = std::fs::read_to_string(&config_path).unwrap();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap();

        let server = &json["mcpServers"][MCP_SERVER_NAME];
        assert_eq!(
            server["command"],
            serde_json::Value::String(executable_path.to_string_lossy().to_string())
        );
        assert_eq!(
            server["args"][0],
            serde_json::Value::String(workspace.to_string_lossy().to_string())
        );

        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn rewrites_existing_config_idempotently() {
        let temp_root = std::env::temp_dir().join(format!("polaris-mcp-test-{}", uuid::Uuid::new_v4()));
        let workspace = temp_root.join("workspace-b");
        let executable_path = temp_root.join("bin/polaris-todo-mcp.exe");

        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(executable_path.parent().unwrap()).unwrap();
        std::fs::write(&executable_path, "bin").unwrap();

        let service = WorkspaceMcpConfigService::new(executable_path.clone());
        let first = service.prepare_todo_config(workspace.to_string_lossy().as_ref()).unwrap();
        let first_content = std::fs::read_to_string(&first).unwrap();
        let second = service.prepare_todo_config(workspace.to_string_lossy().as_ref()).unwrap();
        let second_content = std::fs::read_to_string(&second).unwrap();

        assert_eq!(first, second);
        assert_eq!(first_content, second_content);

        let _ = std::fs::remove_dir_all(&temp_root);
    }
}
