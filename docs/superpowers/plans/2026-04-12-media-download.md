# Media Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QQ Bot 和飞书机器人收到图片/音频/文件等媒体消息时，自动下载到本地并构造文本描述传递给 AI agent。

**Architecture:** 在 `PlatformIntegration` trait 新增 `download_media` 方法，各适配器自行实现下载逻辑（QQ Bot 直接 GET URL，飞书调消息资源 API）。manager 的 `handle_message` 检测非文本内容后调适配器下载，将本地路径拼成描述文本发给 AI。

**Tech Stack:** Rust, reqwest, tokio, async-trait

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/integrations/types.rs` | Modify | `MessageContent` 加 `file_name`；`IntegrationMessage` 加 `platform_message_id`；新增 `MediaDownload` |
| `src-tauri/src/integrations/traits.rs` | Modify | `PlatformIntegration` trait 加 `download_media` 方法 |
| `src-tauri/src/integrations/feishu/adapter.rs` | Modify | 补全 audio/file/video 解析；实现 `download_media` |
| `src-tauri/src/integrations/qqbot/adapter.rs` | Modify | 补全 file/video 解析；实现 `download_media` |
| `src-tauri/src/integrations/manager.rs` | Modify | `handle_message` 增加媒体检测与下载流程 |

---

### Task 1: 更新 types.rs — 扩展类型定义

**Files:**
- Modify: `src-tauri/src/integrations/types.rs`

- [ ] **Step 1: 给 Image 和 Audio 变体加 `file_name` 字段**

在 `types.rs:132-145`，将 `MessageContent` 枚举替换为：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum MessageContent {
    Text { text: String },
    Image {
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        local_path: Option<String>,
    },
    File { name: String, url: String, size: u64 },
    Audio {
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        transcript: Option<String>,
    },
    Mixed { items: Vec<MessageContent> },
}
```

- [ ] **Step 2: 给 `IntegrationMessage` 加 `platform_message_id` 字段**

在 `types.rs:81-99`，在 `raw` 字段之前加一行：

```rust
pub struct IntegrationMessage {
    pub id: String,
    pub platform: Platform,
    pub conversation_id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub content: MessageContent,
    pub timestamp: i64,
    /// 平台原始消息 ID（飞书 om_xxx，QQ Bot msg_id），用于下载媒体资源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
}
```

同步更新 `IntegrationMessage::new()`（`types.rs:101-120`），在 `raw: None` 之前加：

```rust
platform_message_id: None,
```

新增 builder 方法，紧跟在 `with_raw` 之后：

```rust
/// 设置平台原始消息 ID
pub fn with_platform_message_id(mut self, id: impl Into<String>) -> Self {
    self.platform_message_id = Some(id.into());
    self
}
```

- [ ] **Step 3: 新增 `MediaDownload` 结构体和 `has_media` 方法**

在 `types.rs` 末尾 `IntegrationSession` 之后添加：

```rust
/// 媒体下载结果
#[derive(Debug, Clone)]
pub struct MediaDownload {
    /// 媒体描述，如 "图片「photo.png」", "文件「报告.pdf」(2.3MB)"
    pub label: String,
    /// 本地保存路径（下载失败时为 None）
    pub local_path: Option<String>,
}
```

在 `MessageContent` 的 impl 块中（`types.rs:148-173`）追加方法：

```rust
/// 是否包含媒体内容（非纯文本）
pub fn has_media(&self) -> bool {
    match self {
        MessageContent::Text { .. } => false,
        MessageContent::Image { .. } => true,
        MessageContent::File { .. } => true,
        MessageContent::Audio { .. } => true,
        MessageContent::Mixed { items } => items.iter().any(|i| i.has_media()),
    }
}
```

- [ ] **Step 4: 编译验证**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -20`

Expected: 编译错误（适配器中构建 `MessageContent::Image/Audio` 的地方缺少 `file_name` 字段），这是预期的，Task 3/4 会修复。

- [ ] **Step 5: Commit**

```bash
cd D:/space/base/Polaris
git add src-tauri/src/integrations/types.rs
git commit -m "feat(integration): 扩展 MessageContent 和 IntegrationMessage 类型以支持媒体下载"
```

---

### Task 2: 更新 traits.rs — 新增 download_media 方法

**Files:**
- Modify: `src-tauri/src/integrations/traits.rs`

- [ ] **Step 1: 在 trait 中新增 download_media 方法**

在 `traits.rs` 的 `PlatformIntegration` trait 中，`status()` 之后、`is_connected()` 之前添加：

```rust
use std::path::Path;

/// 下载消息中的媒体文件到本地
///
/// # Arguments
/// * `msg` - 原始消息（含 platform_message_id 和 MessageContent）
/// * `save_dir` - 保存目录（由 manager 创建，已存在）
///
/// # Returns
/// 每个媒体项的下载结果列表
async fn download_media(
    &mut self,
    msg: &IntegrationMessage,
    save_dir: &Path,
) -> Vec<crate::integrations::types::MediaDownload> {
    // 默认空实现，子类可 override
    let _ = (msg, save_dir);
    vec![]
}
```

注意：默认空实现返回空 Vec，避免破坏已有实现。

- [ ] **Step 2: 编译验证**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -10`

Expected: 编译通过（默认空实现不破坏现有代码）

- [ ] **Step 3: Commit**

```bash
cd D:/space/base/Polaris
git add src-tauri/src/integrations/traits.rs
git commit -m "feat(integration): PlatformIntegration trait 新增 download_media 方法"
```

---

### Task 3: 更新飞书适配器 — 补全媒体解析 + 实现下载

**Files:**
- Modify: `src-tauri/src/integrations/feishu/adapter.rs`

- [ ] **Step 1: 补全 handle_message_event 中的媒体类型解析**

替换 `adapter.rs:293-322` 中 `let content = match msg_type { ... }` 整段为：

```rust
let content = match msg_type {
    "text" => {
        if let Ok(content_json) = serde_json::from_str::<serde_json::Value>(content_str) {
            let text = content_json
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let cleaned = Self::strip_at_mention(text);
            MessageContent::text(cleaned)
        } else {
            MessageContent::text("")
        }
    }
    "image" => {
        if let Ok(content_json) = serde_json::from_str::<serde_json::Value>(content_str) {
            let image_key = content_json
                .get("image_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            MessageContent::Image {
                url: image_key.to_string(),
                file_name: None,
                local_path: None,
            }
        } else {
            MessageContent::text("[图片]")
        }
    }
    "audio" => {
        if let Ok(content_json) = serde_json::from_str::<serde_json::Value>(content_str) {
            let file_key = content_json
                .get("file_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            MessageContent::Audio {
                url: file_key.to_string(),
                file_name: None,
                transcript: None,
            }
        } else {
            MessageContent::text("[语音]")
        }
    }
    "file" => {
        if let Ok(content_json) = serde_json::from_str::<serde_json::Value>(content_str) {
            let file_key = content_json
                .get("file_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let file_name = content_json
                .get("file_name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown_file")
                .to_string();
            MessageContent::File {
                name: file_name,
                url: file_key.to_string(),
                size: 0,
            }
        } else {
            MessageContent::text("[文件]")
        }
    }
    "video" => {
        if let Ok(content_json) = serde_json::from_str::<serde_json::Value>(content_str) {
            let file_key = content_json
                .get("file_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            MessageContent::File {
                name: "video.mp4".to_string(),
                url: file_key.to_string(),
                size: 0,
            }
        } else {
            MessageContent::text("[视频]")
        }
    }
    _ => MessageContent::text(format!("[{}消息]", msg_type)),
};
```

- [ ] **Step 2: 保留飞书 message_id 到 IntegrationMessage**

在 `adapter.rs` 的 `handle_message_event` 函数末尾，`Some(IntegrationMessage::new(...).with_raw(...))` 处（约 331-340 行），改为提取并保存 `message_id`：

找到：
```rust
        Some(
            IntegrationMessage::new(
                Platform::Feishu,
                conversation_id,
                sender_id,
                sender_name,
                content,
            )
            .with_raw(event.clone()),
        )
```

替换为：
```rust
        let platform_msg_id = message
            .get("message_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Some(
            IntegrationMessage::new(
                Platform::Feishu,
                conversation_id,
                sender_id,
                sender_name,
                content,
            )
            .with_platform_message_id(platform_msg_id.unwrap_or_default())
            .with_raw(event.clone()),
        )
```

- [ ] **Step 3: 实现 download_media 方法**

在 `adapter.rs` 的 `impl FeishuAdapter` 块中（`send` 方法之前），添加以下方法：

```rust
    /// 下载飞书消息中的媒体资源
    ///
    /// 飞书 API: GET /open-apis/im/v1/messages/{message_id}/resources/{key}?type={image|file}
    async fn download_resource(
        &self,
        message_id: &str,
        resource_key: &str,
        resource_type: &str, // "image" 或 "file"
    ) -> Result<Vec<u8>> {
        let client = reqwest::Client::new();
        let token = self.access_token.as_ref()
            .ok_or_else(|| AppError::AuthError("未获取 access token".to_string()))?;

        let url = format!(
            "{}/open-apis/im/v1/messages/{}/resources/{}?type={}",
            FEISHU_API_BASE, message_id, resource_key, resource_type
        );

        tracing::info!("[Feishu] 📥 下载资源: type={}, key={}", resource_type, resource_key);

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| AppError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::ApiError(format!(
                "下载资源失败: HTTP {}, body={}", status, body
            )));
        }

        let bytes = response.bytes().await
            .map_err(|e| AppError::NetworkError(e.to_string()))?;

        tracing::info!("[Feishu] ✅ 资源下载完成: {} bytes", bytes.len());
        Ok(bytes.to_vec())
    }

    /// 根据消息类型推断文件扩展名
    fn guess_extension(msg_type: &str) -> &'static str {
        match msg_type {
            "image" => ".png",
            "audio" => ".ogg",
            "video" => ".mp4",
            _ => ".bin",
        }
    }

    /// 从 MessageContent 提取媒体项并下载
    fn collect_media_items(content: &MessageContent) -> Vec<(String, String, String)> {
        // 返回 (key, type_param, fallback_name)
        let mut items = Vec::new();
        match content {
            MessageContent::Image { url, .. } => {
                items.push((url.clone(), "image".to_string(), "image.png".to_string()));
            }
            MessageContent::Audio { url, .. } => {
                items.push((url.clone(), "file".to_string(), "audio.ogg".to_string()));
            }
            MessageContent::File { name, url, .. } => {
                items.push((url.clone(), "file".to_string(), name.clone()));
            }
            MessageContent::Mixed { items: inner } => {
                for item in inner {
                    items.extend(Self::collect_media_items(item));
                }
            }
            _ => {}
        }
        items
    }
```

然后在 `#[async_trait] impl PlatformIntegration for FeishuAdapter` 块中，在 `send` 方法之前添加 `download_media` 的 trait 实现：

```rust
    async fn download_media(
        &mut self,
        msg: &IntegrationMessage,
        save_dir: &Path,
    ) -> Vec<crate::integrations::types::MediaDownload> {
        let message_id = match &msg.platform_message_id {
            Some(id) if !id.is_empty() => id.as_str(),
            _ => {
                tracing::warn!("[Feishu] ⚠️ 缺少 message_id，无法下载媒体");
                return vec![MediaDownload {
                    label: "媒体文件".to_string(),
                    local_path: None,
                }];
            }
        };

        // 确保 token 有效
        if let Err(e) = self.ensure_valid_token().await {
            tracing::error!("[Feishu] ❌ Token 刷新失败: {}", e);
            return vec![MediaDownload {
                label: "媒体文件".to_string(),
                local_path: None,
            }];
        }

        let media_items = Self::collect_media_items(&msg.content);
        let mut results = Vec::new();

        for (key, type_param, fallback_name) in media_items {
            let label = if fallback_name.starts_with("image") || fallback_name.starts_with("audio") {
                match type_param.as_str() {
                    "image" => "图片".to_string(),
                    _ => "语音".to_string(),
                }
            } else {
                format!("文件「{}」", fallback_name)
            };

            match self.download_resource(message_id, &key, &type_param).await {
                Ok(bytes) => {
                    let timestamp = chrono::Utc::now().timestamp();
                    let safe_name = fallback_name.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_', "_");
                    let file_name = format!("{}_{}", timestamp, safe_name);
                    let file_path = save_dir.join(&file_name);

                    match tokio::fs::write(&file_path, &bytes).await {
                        Ok(_) => {
                            tracing::info!("[Feishu] ✅ 媒体已保存: {}", file_path.display());
                            results.push(MediaDownload {
                                label,
                                local_path: Some(file_path.to_string_lossy().to_string()),
                            });
                        }
                        Err(e) => {
                            tracing::error!("[Feishu] ❌ 写入文件失败: {}", e);
                            results.push(MediaDownload { label, local_path: None });
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("[Feishu] ❌ 下载资源失败: {}", e);
                    results.push(MediaDownload { label, local_path: None });
                }
            }
        }

        results
    }
```

确保在文件顶部已有正确的 use 引用，添加（如不存在）：

```rust
use std::path::Path;
use super::super::types::MediaDownload;
```

- [ ] **Step 4: 编译验证**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -20`

Expected: 飞书适配器编译通过（可能 QQ Bot 仍有 `file_name` 缺失错误，Task 4 修复）

- [ ] **Step 5: Commit**

```bash
cd D:/space/base/Polaris
git add src-tauri/src/integrations/feishu/adapter.rs
git commit -m "feat(feishu): 补全 audio/file/video 解析，实现 download_media"
```

---

### Task 4: 更新 QQ Bot 适配器 — 补全媒体解析 + 实现下载

**Files:**
- Modify: `src-tauri/src/integrations/qqbot/adapter.rs`

- [ ] **Step 1: 补全 parse_content 中的附件类型**

替换 `adapter.rs:265-309` 的 `parse_content` 方法为：

```rust
    /// 解析消息内容
    fn parse_content(raw: &serde_json::Value) -> MessageContent {
        let content = raw
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // 检查附件
        if let Some(attachments) = raw.get("attachments").and_then(|v| v.as_array()) {
            if !attachments.is_empty() {
                let mut items = vec![MessageContent::text(content)];

                for att in attachments {
                    let content_type = att
                        .get("content_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let url = att
                        .get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let filename = att
                        .get("filename")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    if content_type.starts_with("image/") {
                        items.push(MessageContent::Image {
                            url,
                            file_name: filename,
                            local_path: None,
                        });
                    } else if content_type.starts_with("audio/") {
                        items.push(MessageContent::Audio {
                            url,
                            file_name: filename,
                            transcript: None,
                        });
                    } else if content_type.starts_with("video/") {
                        let name = filename.unwrap_or_else(|| "video.mp4".to_string());
                        let size = att.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                        items.push(MessageContent::File {
                            name,
                            url,
                            size,
                        });
                    } else {
                        // 其他附件类型按文件处理
                        let name = filename.unwrap_or_else(|| "file".to_string());
                        let size = att.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                        items.push(MessageContent::File {
                            name,
                            url,
                            size,
                        });
                    }
                }

                return MessageContent::Mixed { items };
            }
        }

        MessageContent::text(content)
    }
```

- [ ] **Step 2: 保留 QQ Bot message_id 到 IntegrationMessage**

在 `handle_message_event` 函数中（`adapter.rs` 约 318 行），`msg_id` 已经从 `event_data.get("id")` 提取。找到构造 `IntegrationMessage` 的位置，在 `.with_raw(event_data.clone())` 之前加 `.with_platform_message_id(msg_id.to_string())`：

找到（约 415 行）：
```rust
        Some(
            IntegrationMessage::new(
                Platform::QQBot,
                conversation_id,
                sender_id,
                sender_name,
                content,
            )
            .with_raw(event_data.clone()),
        )
```

替换为：
```rust
        Some(
            IntegrationMessage::new(
                Platform::QQBot,
                conversation_id,
                sender_id,
                sender_name,
                content,
            )
            .with_platform_message_id(message_id)
            .with_raw(event_data.clone()),
        )
```

- [ ] **Step 3: 实现 download_media 方法**

在 `impl QQBotAdapter` 块中（`send` 方法之前），添加：

```rust
    /// 从 MessageContent 提取所有媒体项
    fn collect_media_urls(content: &MessageContent) -> Vec<(String, String, u64)> {
        // 返回 (url, filename, size)
        let mut items = Vec::new();
        match content {
            MessageContent::Image { url, file_name, .. } => {
                items.push((url.clone(), file_name.clone().unwrap_or_else(|| "image.png".to_string()), 0));
            }
            MessageContent::Audio { url, file_name, .. } => {
                items.push((url.clone(), file_name.clone().unwrap_or_else(|| "audio.silk".to_string()), 0));
            }
            MessageContent::File { name, url, size } => {
                items.push((url.clone(), name.clone(), *size));
            }
            MessageContent::Mixed { items: inner } => {
                for item in inner {
                    items.extend(Self::collect_media_urls(item));
                }
            }
            _ => {}
        }
        items
    }
```

然后在 `#[async_trait] impl PlatformIntegration for QQBotAdapter` 块中，在 `send` 方法之前添加 trait 实现：

```rust
    async fn download_media(
        &mut self,
        msg: &IntegrationMessage,
        save_dir: &Path,
    ) -> Vec<crate::integrations::types::MediaDownload> {
        use super::super::types::MediaDownload;

        let media_items = Self::collect_media_urls(&msg.content);
        let mut results = Vec::new();

        for (url, filename, size) in media_items {
            let label = if filename.starts_with("image") || filename.ends_with(".png") || filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
                "图片".to_string()
            } else if filename.starts_with("audio") || filename.ends_with(".silk") {
                "语音".to_string()
            } else {
                let size_str = if size > 0 {
                    format!("({:.1}KB)", size as f64 / 1024.0)
                } else {
                    String::new()
                };
                format!("文件「{}」{}", filename, size_str)
            };

            tracing::info!("[QQBot] 📥 下载媒体: {}", filename);

            let client = reqwest::Client::new();
            match client.get(&url).send().await {
                Ok(response) if response.status().is_success() => {
                    match response.bytes().await {
                        Ok(bytes) => {
                            let timestamp = chrono::Utc::now().timestamp();
                            let safe_name = filename.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_', "_");
                            let file_name = format!("{}_{}", timestamp, safe_name);
                            let file_path = save_dir.join(&file_name);

                            match tokio::fs::write(&file_path, &bytes).await {
                                Ok(_) => {
                                    tracing::info!("[QQBot] ✅ 媒体已保存: {}", file_path.display());
                                    results.push(MediaDownload {
                                        label,
                                        local_path: Some(file_path.to_string_lossy().to_string()),
                                    });
                                }
                                Err(e) => {
                                    tracing::error!("[QQBot] ❌ 写入文件失败: {}", e);
                                    results.push(MediaDownload { label, local_path: None });
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("[QQBot] ❌ 读取响应体失败: {}", e);
                            results.push(MediaDownload { label, local_path: None });
                        }
                    }
                }
                Ok(response) => {
                    tracing::error!("[QQBot] ❌ 下载失败: HTTP {}", response.status());
                    results.push(MediaDownload { label, local_path: None });
                }
                Err(e) => {
                    tracing::error!("[QQBot] ❌ 下载请求失败: {}", e);
                    results.push(MediaDownload { label, local_path: None });
                }
            }
        }

        results
    }
```

确保文件顶部有：
```rust
use std::path::Path;
```

- [ ] **Step 4: 编译验证**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -10`

Expected: 编译通过

- [ ] **Step 5: Commit**

```bash
cd D:/space/base/Polaris
git add src-tauri/src/integrations/qqbot/adapter.rs
git commit -m "feat(qqbot): 补全 file/video 解析，实现 download_media"
```

---

### Task 5: 更新 manager — 媒体检测、下载、文本构造

**Files:**
- Modify: `src-tauri/src/integrations/manager.rs`

- [ ] **Step 1: 重构 handle_message 的非文本处理逻辑**

替换 `manager.rs:253-260` 的 `handle_message` 开头部分。

找到：
```rust
        let text = match msg.content.as_text() {
            Some(t) => t,
            None => {
                tracing::debug!("[IntegrationManager] 非文本消息，跳过处理");
                return;
            }
        };

        let conversation_id = msg.conversation_id.clone();

        // 注入默认工作区（从当前激活实例配置中读取）
        {
            let mut states = conversation_states.lock().await;
            let state = states.get_or_create(&conversation_id);
            if state.work_dir.is_none() {
                if let Some(work_dir) = Self::get_instance_work_dir(&instance_registry, platform).await {
                    tracing::info!("[IntegrationManager] 📂 注入默认工作区: conversation={}, work_dir={}", conversation_id, work_dir);
                    state.work_dir = Some(work_dir);
                }
            }
        }
```

替换为：
```rust
        let conversation_id = msg.conversation_id.clone();

        // 注入默认工作区（从当前激活实例配置中读取）
        let work_dir = {
            let mut states = conversation_states.lock().await;
            let state = states.get_or_create(&conversation_id);
            if state.work_dir.is_none() {
                if let Some(wd) = Self::get_instance_work_dir(&instance_registry, platform).await {
                    tracing::info!("[IntegrationManager] 📂 注入默认工作区: conversation={}, work_dir={}", conversation_id, wd);
                    state.work_dir = Some(wd);
                }
            }
            state.work_dir.clone()
        };

        // 处理媒体内容：下载文件并构造文本描述
        let text = if msg.content.has_media() {
            Self::handle_media_content(&msg, &adapters, &work_dir).await
        } else {
            match msg.content.as_text() {
                Some(t) => t.to_string(),
                None => {
                    tracing::debug!("[IntegrationManager] 非文本消息，跳过处理");
                    return;
                }
            }
        };

        if text.is_empty() {
            tracing::debug!("[IntegrationManager] 消息内容为空，跳过处理");
            return;
        }
```

- [ ] **Step 2: 添加 handle_media_content 方法**

在 `manager.rs` 的 `impl IntegrationManager` 块中（`handle_message` 之前），添加：

```rust
    /// 处理消息中的媒体内容：下载文件并构造文本描述
    async fn handle_media_content(
        msg: &IntegrationMessage,
        adapters: &Arc<Mutex<HashMap<Platform, Box<dyn PlatformIntegration>>>>,
        work_dir: &Option<String>,
    ) -> String {
        let mut parts: Vec<String> = Vec::new();

        // 提取原始文本（Mixed 内容可能包含文字）
        if let Some(text) = msg.content.as_text() {
            if !text.is_empty() {
                parts.push(text.to_string());
            }
        }

        // 确定保存目录
        let media_dir = match work_dir {
            Some(dir) => std::path::PathBuf::from(dir).join(".media"),
            None => dirs::data_local_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("claude-code-pro")
                .join("media"),
        };

        // 创建目录（如不存在）
        if let Err(e) = tokio::fs::create_dir_all(&media_dir).await {
            tracing::error!("[IntegrationManager] ❌ 创建媒体目录失败: {}", e);
            parts.push("⚠️ 媒体文件保存失败：无法创建目录".to_string());
            return parts.join("\n");
        }

        // 调用适配器下载媒体
        let downloads = {
            let mut adapters_lock = adapters.lock().await;
            if let Some(adapter) = adapters_lock.get_mut(&msg.platform) {
                adapter.download_media(msg, &media_dir).await
            } else {
                vec![]
            }
        };
        // 适配器锁已释放

        // 构造文本描述
        for dl in downloads {
            match &dl.local_path {
                Some(path) => {
                    parts.push(format!("[{}] 已保存到: {}", dl.label, path));
                }
                None => {
                    parts.push(format!("[{}] 下载失败", dl.label));
                }
            }
        }

        let result = parts.join("\n");
        tracing::info!("[IntegrationManager] 📎 媒体处理结果: {} chars", result.len());
        result
    }
```

- [ ] **Step 3: 更新后续代码适配 String 类型**

由于 `text` 从 `&str` 变成了 `String`，需要修改 `handle_message` 中后续使用 `text` 的地方。

找到命令解析部分（约 276 行）：
```rust
        if let Some(cmd) = CommandParser::parse(text) {
```

改为：
```rust
        if let Some(cmd) = CommandParser::parse(&text) {
```

往下找到 `process_ai_message` 调用处（在约 296 行之后的 `// 2. 普通 AI 消息处理` 块中），确认 `text` 传入处改为 `&text`（如果原代码传的是 `text`）。

搜索 `process_ai_message` 调用，确认第一个参数从 text 引用改为 `&text`（类型从 `&str` 应仍兼容，因为 `String` 可 `Deref` 为 `&str`）。

- [ ] **Step 4: 编译验证**

Run: `cd D:/space/base/Polaris/src-tauri && cargo check 2>&1 | tail -20`

Expected: 编译通过。如有类型不匹配错误，根据错误信息调整。

- [ ] **Step 5: 完整构建**

Run: `cd D:/space/base/Polaris/src-tauri && cargo build 2>&1 | tail -5`

Expected: `Finished` 成功

- [ ] **Step 6: Commit**

```bash
cd D:/space/base/Polaris
git add src-tauri/src/integrations/manager.rs
git commit -m "feat(integration): handle_message 支持媒体消息下载与文本描述构造"
```

---

### Task 6: 前端类型同步

**Files:**
- Modify: `src/types/integration.ts`

- [ ] **Step 1: 同步前端 MessageContent 类型定义**

在 `src/types/integration.ts` 中找到 `MessageContent` 相关类型，在 `Image` 和 `Audio` 变体中添加 `fileName` 字段（与后端 `file_name` 的 camelCase 对应）。

找到 Image 相关类型定义，添加 `fileName?: string`。找到 Audio 相关类型定义，添加 `fileName?: string`。

同步在 `IntegrationMessage` 类型中添加 `platformMessageId?: string`。

- [ ] **Step 2: 前端编译验证**

Run: `cd D:/space/base/Polaris && npx tsc --noEmit 2>&1 | tail -10`

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
cd D:/space/base/Polaris
git add src/types/integration.ts
git commit -m "feat(integration): 同步前端媒体消息类型定义"
```

---

## 验证清单

实现完成后，手动测试以下场景：

- [ ] QQ Bot 发送纯文本 → 正常处理（无回归）
- [ ] QQ Bot 发送图片 → 下载到 `work_dir/.media/`，AI 收到路径描述
- [ ] QQ Bot 发送文字+图片混合 → 文本和图片描述都传递给 AI
- [ ] 飞书发送纯文本 → 正常处理（无回归）
- [ ] 飞书发送图片 → 下载到 `work_dir/.media/`，AI 收到路径描述
- [ ] 飞书发送文件 → 文件名正确，下载保存
- [ ] 飞书发送语音 → 下载保存（.ogg 格式）
- [ ] 网络异常导致下载失败 → 不崩溃，AI 收到"下载失败"描述
- [ ] work_dir 未设置时 → 回退到默认路径，不崩溃
