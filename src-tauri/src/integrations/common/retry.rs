/**
 * 重试机制
 *
 * 提供指数退避的异步重试功能。
 */

use std::time::Duration;
use tokio::time::sleep;

/// 重试配置
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// 最大重试次数
    pub max_retries: u32,
    /// 初始延迟（毫秒）
    pub initial_delay_ms: u64,
    /// 最大延迟（毫秒）
    pub max_delay_ms: u64,
    /// 退避倍数
    pub multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay_ms: 1000,
            max_delay_ms: 5000,
            multiplier: 2.0,
        }
    }
}

impl RetryConfig {
    /// 创建新的重试配置
    pub fn new(max_retries: u32) -> Self {
        Self {
            max_retries,
            ..Default::default()
        }
    }

    /// 设置初始延迟
    pub fn with_initial_delay(mut self, ms: u64) -> Self {
        self.initial_delay_ms = ms;
        self
    }

    /// 设置最大延迟
    pub fn with_max_delay(mut self, ms: u64) -> Self {
        self.max_delay_ms = ms;
        self
    }
}

/// 带重试的异步操作
///
/// # Arguments
/// * `config` - 重试配置
/// * `operation` - 要执行的操作
///
/// # Returns
/// 操作成功返回结果，所有重试失败后返回最后一个错误
pub async fn with_retry<T, E, F, Fut>(
    config: &RetryConfig,
    mut operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut last_error = None;

    for attempt in 0..=config.max_retries {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    tracing::debug!("Operation succeeded after {} retries", attempt);
                }
                return Ok(result);
            }
            Err(e) => {
                last_error = Some(e);

                if attempt < config.max_retries {
                    let delay = calculate_delay(attempt, config);
                    tracing::warn!(
                        "Operation failed, retrying in {}ms (attempt {}/{}): {:?}",
                        delay,
                        attempt + 1,
                        config.max_retries,
                        last_error.as_ref().unwrap()
                    );
                    sleep(Duration::from_millis(delay)).await;
                }
            }
        }
    }

    Err(last_error.expect("At least one error should exist"))
}

/// 计算重试延迟
fn calculate_delay(attempt: u32, config: &RetryConfig) -> u64 {
    let delay = config.initial_delay_ms as f64 * config.multiplier.powi(attempt as i32);
    delay.min(config.max_delay_ms as f64) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

}
