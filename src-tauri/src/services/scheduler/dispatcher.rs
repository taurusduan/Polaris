/**
 * 调度执行器
 *
 * 负责检查待执行任务并调用 AI 引擎执行
 */

use crate::error::Result;
use crate::models::scheduler::{ScheduledTask, TaskStatus};
use crate::ai::{EngineRegistry, EngineId, SessionOptions};
use crate::models::AIEvent;
use super::store::{TaskStoreService, LogStoreService};

use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use std::collections::HashMap;

/// 调度执行器
#[derive(Clone)]
pub struct SchedulerDispatcher {
    task_store: Arc<AsyncMutex<TaskStoreService>>,
    log_store: Arc<AsyncMutex<LogStoreService>>,
    engine_registry: Arc<AsyncMutex<EngineRegistry>>,
    /// 正在执行的任务
    running_tasks: Arc<AsyncMutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
}

impl SchedulerDispatcher {
    /// 创建新的调度执行器
    pub fn new(
        task_store: Arc<AsyncMutex<TaskStoreService>>,
        log_store: Arc<AsyncMutex<LogStoreService>>,
        engine_registry: Arc<AsyncMutex<EngineRegistry>>,
    ) -> Self {
        Self {
            task_store,
            log_store,
            engine_registry,
            running_tasks: Arc::new(AsyncMutex::new(HashMap::new())),
        }
    }

    /// 启动调度循环
    pub fn start(&self) {
        let dispatcher = self.clone();
        // 使用 tauri::async_runtime 而不是 tokio::spawn，确保在 Tauri 运行时中
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));

            loop {
                interval.tick().await;

                // 检查并执行待执行任务
                if let Err(e) = dispatcher.check_and_execute().await {
                    tracing::error!("[Scheduler] 调度检查失败: {:?}", e);
                }
            }
        });
    }

    /// 检查并执行待执行任务
    async fn check_and_execute(&self) -> Result<()> {
        let pending_tasks: Vec<ScheduledTask> = {
            let store = self.task_store.lock().await;
            store.get_pending_tasks()
                .into_iter()
                .cloned()
                .collect()
        };

        for task in pending_tasks {
            // 检查是否已经在执行
            let is_running = {
                let running = self.running_tasks.lock().await;
                running.contains_key(&task.id)
            };

            if is_running {
                continue;
            }

            // 执行任务
            self.execute_task(task).await;
        }

        Ok(())
    }

    /// 执行单个任务
    async fn execute_task(&self, task: ScheduledTask) {
        let task_id = task.id.clone();
        let task_id_for_map = task.id.clone(); // 用于后续插入 running_tasks
        let task_name = task.name.clone();
        let prompt = task.prompt.clone();
        let engine_id = task.engine_id.clone();
        let work_dir = task.work_dir.clone();

        let task_store = self.task_store.clone();
        let log_store = self.log_store.clone();
        let engine_registry = self.engine_registry.clone();
        let running_tasks = self.running_tasks.clone();

        let handle = tokio::spawn(async move {
            tracing::info!("[Scheduler] 开始执行任务: {} ({})", task_name, task_id);

            // 创建日志记录
            let log_id = {
                let mut store = log_store.lock().await;
                match store.create(&task_id, &task_name, &prompt) {
                    Ok(log) => log.id,
                    Err(e) => {
                        tracing::error!("[Scheduler] 创建日志失败: {:?}", e);
                        return;
                    }
                }
            };

            // 解析引擎 ID
            let engine_id_parsed = EngineId::from_str(&engine_id)
                .unwrap_or(EngineId::ClaudeCode);

            // 收集输出
            let output = Arc::new(AsyncMutex::new(String::new()));
            let output_clone = output.clone();

            // 创建会话选项
            let options = SessionOptions::new(move |event: AIEvent| {
                // 收集输出
                if let AIEvent::AssistantMessage(msg) = &event {
                    if let Ok(mut o) = output_clone.try_lock() {
                        o.push_str(&msg.content);
                    }
                }
            })
            .with_work_dir(work_dir.unwrap_or_else(|| ".".to_string()));

            // 执行
            let result = {
                let mut registry = engine_registry.lock().await;
                registry.start_session(Some(engine_id_parsed), &prompt, options)
            };

            // 更新结果
            {
                let mut log_store = log_store.lock().await;
                match result {
                    Ok(_) => {
                        let final_output = output.lock().await.clone();
                        if let Err(e) = log_store.update(&log_id, Some(final_output), None) {
                            tracing::error!("[Scheduler] 更新日志失败: {:?}", e);
                        }

                        // 更新任务状态
                        let mut task_store = task_store.lock().await;
                        if let Err(e) = task_store.update_run_status(&task_id, TaskStatus::Success) {
                            tracing::error!("[Scheduler] 更新任务状态失败: {:?}", e);
                        }

                        tracing::info!("[Scheduler] 任务执行成功: {}", task_name);
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        if let Err(e) = log_store.update(&log_id, None, Some(error_msg.clone())) {
                            tracing::error!("[Scheduler] 更新日志失败: {:?}", e);
                        }

                        // 更新任务状态
                        let mut task_store = task_store.lock().await;
                        if let Err(e) = task_store.update_run_status(&task_id, TaskStatus::Failed) {
                            tracing::error!("[Scheduler] 更新任务状态失败: {:?}", e);
                        }

                        tracing::error!("[Scheduler] 任务执行失败: {} - {}", task_name, error_msg);
                    }
                }
            }

            // 从运行列表中移除
            {
                let mut running = running_tasks.lock().await;
                running.remove(&task_id);
            }
        });

        // 添加到运行列表
        {
            let mut running = self.running_tasks.lock().await;
            running.insert(task_id_for_map, handle);
        }
    }

    /// 手动执行任务
    pub async fn run_now(&self, task_id: &str) -> Result<()> {
        let task = {
            let store = self.task_store.lock().await;
            store.get(task_id)
                .cloned()
                .ok_or_else(|| crate::error::AppError::ValidationError(format!("任务不存在: {}", task_id)))?
        };

        self.execute_task(task).await;
        Ok(())
    }
}
