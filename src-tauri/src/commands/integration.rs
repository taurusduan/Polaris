/**
 * 集成相关 Tauri 命令
 *
 * 提供平台集成的启动、停止、状态查询、消息发送等命令。
 */

use std::collections::HashMap;
use tauri::State;

use crate::error::Result;
use crate::integrations::types::*;
use crate::integrations::manager::IntegrationManager;
use crate::models::config::QQBotConfig;

/// 启动集成平台
#[tauri::command]
pub async fn start_integration(
    platform: String,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    let platform: Platform = platform
        .parse()
        .map_err(|e: String| crate::error::AppError::ValidationError(e))?;

    let mut manager = state.integration_manager.lock().await;
    manager.start(platform).await
}

/// 停止集成平台
#[tauri::command]
pub async fn stop_integration(
    platform: String,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    let platform: Platform = platform
        .parse()
        .map_err(|e: String| crate::error::AppError::ValidationError(e))?;

    let mut manager = state.integration_manager.lock().await;
    manager.stop(platform).await
}

/// 获取集成状态
#[tauri::command]
pub async fn get_integration_status(
    platform: String,
    state: State<'_, crate::AppState>,
) -> Result<Option<IntegrationStatus>> {
    let platform: Platform = platform
        .parse()
        .map_err(|e: String| crate::error::AppError::ValidationError(e))?;

    let manager = state.integration_manager.lock().await;
    Ok(manager.status(platform))
}

/// 获取所有集成状态
#[tauri::command]
pub async fn get_all_integration_status(
    state: State<'_, crate::AppState>,
) -> Result<HashMap<String, IntegrationStatus>> {
    let manager = state.integration_manager.lock().await;
    Ok(manager
        .all_status()
        .into_iter()
        .map(|(p, s)| (p.to_string(), s))
        .collect())
}

/// 发送集成消息
#[tauri::command]
pub async fn send_integration_message(
    platform: String,
    target: SendTarget,
    content: MessageContent,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    let platform: Platform = platform
        .parse()
        .map_err(|e: String| crate::error::AppError::ValidationError(e))?;

    let manager = state.integration_manager.lock().await;
    manager.send(platform, target, content).await
}

/// 获取集成会话列表
#[tauri::command]
pub async fn get_integration_sessions(
    state: State<'_, crate::AppState>,
) -> Result<Vec<IntegrationSession>> {
    let manager = state.integration_manager.lock().await;
    Ok(manager.sessions().into_iter().cloned().collect())
}

/// 初始化集成管理器
#[tauri::command]
pub async fn init_integration(
    qqbot_config: Option<QQBotConfig>,
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<()> {
    let mut manager = state.integration_manager.lock().await;
    manager.init(qqbot_config, app_handle);
    Ok(())
}
