use crate::error::{AppError, Result};
use crate::models::scheduler::{ScheduledTask, TaskLog, TaskStore, LogStore, TriggerType};
use std::path::PathBuf;
use std::collections::HashMap;
use uuid::Uuid;
use chrono::Utc;

/// 任务存储服务
pub struct TaskStoreService {
    store: TaskStore,
    store_path: PathBuf,
}

impl TaskStoreService {
    /// 创建新的任务存储服务
    pub fn new() -> Result<Self> {
        let store_dir = dirs::config_dir()
            .ok_or_else(|| AppError::ConfigError("无法获取配置目录".to_string()))?
            .join("claude-code-pro");

        // 确保目录存在
        std::fs::create_dir_all(&store_dir)?;

        let store_path = store_dir.join("scheduler_tasks.json");
        let store = Self::load_from_file(&store_path)?;

        Ok(Self { store, store_path })
    }

    /// 从文件加载
    fn load_from_file(path: &PathBuf) -> Result<TaskStore> {
        if path.exists() {
            let content = std::fs::read_to_string(path)?;
            if let Ok(store) = serde_json::from_str::<TaskStore>(&content) {
                return Ok(store);
            }
        }
        Ok(TaskStore::default())
    }

    /// 保存到文件
    fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(&self.store)?;
        std::fs::write(&self.store_path, content)?;
        Ok(())
    }

    /// 获取所有任务
    pub fn get_all(&self) -> &[ScheduledTask] {
        &self.store.tasks
    }

    /// 获取单个任务
    pub fn get(&self, id: &str) -> Option<&ScheduledTask> {
        self.store.tasks.iter().find(|t| t.id == id)
    }

    /// 创建任务
    pub fn create(&mut self, mut task: ScheduledTask) -> Result<ScheduledTask> {
        let now = Utc::now().timestamp();
        task.id = Uuid::new_v4().to_string();
        task.created_at = now;
        task.updated_at = now;

        // 计算下次执行时间
        task.next_run_at = task.trigger_type.calculate_next_run(&task.trigger_value, now);

        self.store.tasks.push(task.clone());
        self.save()?;
        Ok(task)
    }

    /// 更新任务
    pub fn update(&mut self, task: ScheduledTask) -> Result<()> {
        if let Some(existing) = self.store.tasks.iter_mut().find(|t| t.id == task.id) {
            let now = Utc::now().timestamp();
            existing.name = task.name;
            existing.enabled = task.enabled;
            existing.trigger_type = task.trigger_type;
            existing.trigger_value = task.trigger_value;
            existing.engine_id = task.engine_id;
            existing.prompt = task.prompt;
            existing.work_dir = task.work_dir;
            existing.updated_at = now;

            // 重新计算下次执行时间
            existing.next_run_at = existing.trigger_type.calculate_next_run(&existing.trigger_value, now);

            self.save()?;
        }
        Ok(())
    }

    /// 删除任务
    pub fn delete(&mut self, id: &str) -> Result<()> {
        self.store.tasks.retain(|t| t.id != id);
        self.save()?;
        Ok(())
    }

    /// 切换任务启用状态
    pub fn toggle(&mut self, id: &str, enabled: bool) -> Result<()> {
        if let Some(task) = self.store.tasks.iter_mut().find(|t| t.id == id) {
            task.enabled = enabled;
            task.updated_at = Utc::now().timestamp();

            // 如果启用，重新计算下次执行时间
            if enabled {
                task.next_run_at = task.trigger_type.calculate_next_run(&task.trigger_value, Utc::now().timestamp());
            } else {
                task.next_run_at = None;
            }

            self.save()?;
        }
        Ok(())
    }

    /// 更新任务执行状态
    pub fn update_run_status(&mut self, id: &str, status: crate::models::scheduler::TaskStatus) -> Result<()> {
        if let Some(task) = self.store.tasks.iter_mut().find(|t| t.id == id) {
            let now = Utc::now().timestamp();
            task.last_run_at = Some(now);
            task.last_run_status = Some(status);

            // 如果是间隔或 cron 任务，计算下次执行时间
            if task.enabled {
                task.next_run_at = task.trigger_type.calculate_next_run(&task.trigger_value, now);
            }

            self.save()?;
        }
        Ok(())
    }

    /// 获取待执行的任务
    pub fn get_pending_tasks(&self) -> Vec<&ScheduledTask> {
        let now = Utc::now().timestamp();
        self.store.tasks.iter()
            .filter(|t| {
                t.enabled &&
                t.next_run_at.map(|nr| nr <= now).unwrap_or(false)
            })
            .collect()
    }
}

/// 日志存储服务
pub struct LogStoreService {
    store: LogStore,
    store_path: PathBuf,
    max_logs_per_task: usize,
    max_output_length: usize,
}

impl LogStoreService {
    /// 创建新的日志存储服务
    pub fn new() -> Result<Self> {
        let store_dir = dirs::config_dir()
            .ok_or_else(|| AppError::ConfigError("无法获取配置目录".to_string()))?
            .join("claude-code-pro");

        std::fs::create_dir_all(&store_dir)?;

        let store_path = store_dir.join("scheduler_logs.json");
        let store = Self::load_from_file(&store_path)?;

        Ok(Self {
            store,
            store_path,
            max_logs_per_task: 100,
            max_output_length: 2000,
        })
    }

    /// 从文件加载
    fn load_from_file(path: &PathBuf) -> Result<LogStore> {
        if path.exists() {
            let content = std::fs::read_to_string(path)?;
            if let Ok(store) = serde_json::from_str::<LogStore>(&content) {
                return Ok(store);
            }
        }
        Ok(LogStore::default())
    }

    /// 保存到文件
    fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(&self.store)?;
        std::fs::write(&self.store_path, content)?;
        Ok(())
    }

    /// 创建日志记录
    pub fn create(&mut self, task_id: &str, task_name: &str, prompt: &str) -> Result<TaskLog> {
        let log = TaskLog {
            id: Uuid::new_v4().to_string(),
            task_id: task_id.to_string(),
            task_name: task_name.to_string(),
            started_at: Utc::now().timestamp(),
            finished_at: None,
            status: crate::models::scheduler::TaskStatus::Running,
            prompt: prompt.to_string(),
            output: None,
            error: None,
        };

        // 添加到任务日志列表
        self.store.logs
            .entry(task_id.to_string())
            .or_insert_with(Vec::new)
            .insert(0, log.clone());

        // 添加到所有日志列表
        self.store.all_logs.insert(0, log.clone());

        // 清理旧日志
        self.cleanup_old_logs(task_id)?;

        self.save()?;
        Ok(log)
    }

    /// 更新日志
    pub fn update(&mut self, log_id: &str, output: Option<String>, error: Option<String>) -> Result<()> {
        let status = if error.is_some() {
            crate::models::scheduler::TaskStatus::Failed
        } else {
            crate::models::scheduler::TaskStatus::Success
        };

        let finished_at = Utc::now().timestamp();

        // 截取输出
        let truncated_output = output.map(|o| {
            if o.len() > self.max_output_length {
                format!("{}...\n[输出已截断，共 {} 字符]",
                    &o[..self.max_output_length], o.len())
            } else {
                o
            }
        });

        // 更新所有日志中的记录
        for log in &mut self.store.all_logs {
            if log.id == log_id {
                log.finished_at = Some(finished_at);
                log.status = status.clone();
                log.output = truncated_output.clone();
                log.error = error.clone();
                break;
            }
        }

        self.save()?;
        Ok(())
    }

    /// 获取任务日志
    pub fn get_task_logs(&self, task_id: &str) -> Vec<&TaskLog> {
        self.store.logs.get(task_id)
            .map(|logs| logs.iter().collect())
            .unwrap_or_default()
    }

    /// 获取所有日志
    pub fn get_all_logs(&self, limit: Option<usize>) -> Vec<&TaskLog> {
        match limit {
            Some(n) => self.store.all_logs.iter().take(n).collect(),
            None => self.store.all_logs.iter().collect(),
        }
    }

    /// 清理旧日志
    fn cleanup_old_logs(&mut self, task_id: &str) -> Result<()> {
        if let Some(logs) = self.store.logs.get_mut(task_id) {
            if logs.len() > self.max_logs_per_task {
                let removed: Vec<_> = logs.drain(self.max_logs_per_task..).collect();
                // 从 all_logs 中移除
                let removed_ids: std::collections::HashSet<_> = removed.iter().map(|l| l.id.as_str()).collect();
                self.store.all_logs.retain(|l| !removed_ids.contains(l.id.as_str()));
            }
        }
        Ok(())
    }

    /// 清理过期日志（超过 30 天）
    pub fn cleanup_expired_logs(&mut self) -> Result<()> {
        let thirty_days_ago = Utc::now().timestamp() - (30 * 24 * 60 * 60);

        self.store.all_logs.retain(|log| log.started_at > thirty_days_ago);

        for logs in self.store.logs.values_mut() {
            logs.retain(|log| log.started_at > thirty_days_ago);
        }

        self.save()?;
        Ok(())
    }
}
