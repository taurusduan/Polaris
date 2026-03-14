/**
 * 定时任务 Tauri Commands
 */

use crate::error::Result;
use crate::models::scheduler::{ScheduledTask, TaskLog, TriggerType};
use crate::services::scheduler::{TaskStoreService, LogStoreService, SchedulerDispatcher};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

/// 获取所有任务
#[tauri::command]
pub async fn scheduler_get_tasks(
    task_store: tauri::State<'_, Arc<AsyncMutex<TaskStoreService>>>,
) -> Result<Vec<ScheduledTask>> {
    let store = task_store.lock().await;
    Ok(store.get_all().to_vec())
}

/// 获取单个任务
#[tauri::command]
pub async fn scheduler_get_task(
    id: String,
    task_store: tauri::State<'_, Arc<AsyncMutex<TaskStoreService>>>,
) -> Result<Option<ScheduledTask>> {
    let store = task_store.lock().await;
    Ok(store.get(&id).cloned())
}

/// 创建任务
#[tauri::command]
pub async fn scheduler_create_task(
    mut task: ScheduledTask,
    task_store: tauri::State<'_, Arc<AsyncMutex<TaskStoreService>>>,
) -> Result<ScheduledTask> {
    let mut store = task_store.lock().await;
    store.create(task)
}

/// 更新任务
#[tauri::command]
pub async fn scheduler_update_task(
    task: ScheduledTask,
    task_store: tauri::State<'_, Arc<AsyncMutex<TaskStoreService>>>,
) -> Result<()> {
    let mut store = task_store.lock().await;
    store.update(task)
}

/// 删除任务
#[tauri::command]
pub async fn scheduler_delete_task(
    id: String,
    task_store: tauri::State<'_, Arc<AsyncMutex<TaskStoreService>>>,
) -> Result<()> {
    let mut store = task_store.lock().await;
    store.delete(&id)
}

/// 切换任务启用状态
#[tauri::command]
pub async fn scheduler_toggle_task(
    id: String,
    enabled: bool,
    task_store: tauri::State<'_, Arc<AsyncMutex<TaskStoreService>>>,
) -> Result<()> {
    let mut store = task_store.lock().await;
    store.toggle(&id, enabled)
}

/// 立即执行任务
#[tauri::command]
pub async fn scheduler_run_task(
    id: String,
    dispatcher: tauri::State<'_, Arc<AsyncMutex<SchedulerDispatcher>>>,
) -> Result<()> {
    let disp = dispatcher.lock().await;
    disp.run_now(&id).await
}

/// 获取任务日志
#[tauri::command]
pub async fn scheduler_get_task_logs(
    task_id: String,
    log_store: tauri::State<'_, Arc<AsyncMutex<LogStoreService>>>,
) -> Result<Vec<TaskLog>> {
    let store = log_store.lock().await;
    Ok(store.get_task_logs(&task_id).into_iter().cloned().collect())
}

/// 获取所有日志
#[tauri::command]
pub async fn scheduler_get_all_logs(
    limit: Option<usize>,
    log_store: tauri::State<'_, Arc<AsyncMutex<LogStoreService>>>,
) -> Result<Vec<TaskLog>> {
    let store = log_store.lock().await;
    Ok(store.get_all_logs(limit).into_iter().cloned().collect())
}

/// 清理过期日志
#[tauri::command]
pub async fn scheduler_cleanup_logs(
    log_store: tauri::State<'_, Arc<AsyncMutex<LogStoreService>>>,
) -> Result<()> {
    let mut store = log_store.lock().await;
    store.cleanup_expired_logs()
}

/// 验证触发表达式
#[tauri::command]
pub fn scheduler_validate_trigger(
    trigger_type: TriggerType,
    trigger_value: String,
) -> Result<Option<i64>> {
    let now = chrono::Utc::now().timestamp();
    Ok(trigger_type.calculate_next_run(&trigger_value, now))
}

/// 解析间隔表达式
#[tauri::command]
pub fn scheduler_parse_interval(value: String) -> Option<i64> {
    crate::models::scheduler::parse_interval(&value)
}
