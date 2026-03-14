/**
 * Webview 标签页管理命令
 *
 * 实现内嵌 Webview 功能，用于搜索结果和链接浏览
 */

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};

/// Webview 标签页信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct WebviewTabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
}

/// 全局 Webview 管理器状态
pub struct WebviewManager {
    pub tabs: HashMap<String, String>, // id -> url
    pub visible_tab: Option<String>,
}

impl WebviewManager {
    pub fn new() -> Self {
        Self {
            tabs: HashMap::new(),
            visible_tab: None,
        }
    }
}

/// 获取 Webview 管理器状态
pub fn get_webview_manager() -> &'static Mutex<WebviewManager> {
    use std::sync::OnceLock;
    static MANAGER: OnceLock<Mutex<WebviewManager>> = OnceLock::new();
    MANAGER.get_or_init(|| Mutex::new(WebviewManager::new()))
}

/// 创建 Webview 标签页
#[tauri::command]
pub async fn create_webview_tab(
    app: AppHandle,
    id: String,
    url: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<WebviewTabInfo, String> {
    tracing::info!("[Webview] 创建 Webview 标签: {} -> {}", id, url);

    // 关闭已存在的同名 webview
    if let Some(existing) = app.get_webview_window(&id) {
        let _ = existing.close();
        tracing::info!("[Webview] 关闭已存在的 webview: {}", id);
    }

    // 创建无边框 Webview 窗口
    let _webview = WebviewWindowBuilder::new(
        &app,
        &id,
        WebviewUrl::External(url.parse().map_err(|e| format!("URL 解析失败: {}", e))?)
    )
    .title("")
    .decorations(false)
    .transparent(true)
    .always_on_top(false)
    .skip_taskbar(true)
    .inner_size(width as f64, height as f64)
    .position(x as f64, y as f64)
    .visible(true)
    .build()
    .map_err(|e| format!("创建 Webview 失败: {}", e))?;

    // 更新管理器状态
    let manager = get_webview_manager();
    if let Ok(mut m) = manager.lock() {
        m.tabs.insert(id.clone(), url.clone());
        m.visible_tab = Some(id.clone());
    }

    // 获取网页标题
    let title = extract_domain_name(&url);

    Ok(WebviewTabInfo {
        id,
        url,
        title,
    })
}

/// 显示 Webview 标签页
#[tauri::command]
pub async fn show_webview_tab(app: AppHandle, id: String) -> Result<(), String> {
    tracing::info!("[Webview] 显示 Webview: {}", id);

    // 先隐藏所有 webview
    let manager = get_webview_manager();
    if let Ok(m) = manager.lock() {
        for tab_id in m.tabs.keys() {
            if let Some(window) = app.get_webview_window(tab_id) {
                let _ = window.hide();
            }
        }
    }

    // 显示指定的 webview
    if let Some(window) = app.get_webview_window(&id) {
        window.show().map_err(|e| format!("显示 Webview 失败: {}", e))?;
        window.set_focus().ok();

        // 更新可见状态
        if let Ok(mut m) = manager.lock() {
            m.visible_tab = Some(id);
        }
    }

    Ok(())
}

/// 隐藏 Webview 标签页
#[tauri::command]
pub async fn hide_webview_tab(app: AppHandle, id: String) -> Result<(), String> {
    tracing::info!("[Webview] 隐藏 Webview: {}", id);

    if let Some(window) = app.get_webview_window(&id) {
        window.hide().map_err(|e| format!("隐藏 Webview 失败: {}", e))?;

        // 更新可见状态
        let manager = get_webview_manager();
        if let Ok(mut m) = manager.lock() {
            if m.visible_tab.as_ref() == Some(&id) {
                m.visible_tab = None;
            }
        }
    }

    Ok(())
}

/// 隐藏所有 Webview 标签页
#[tauri::command]
pub async fn hide_all_webview_tabs(app: AppHandle) -> Result<(), String> {
    tracing::info!("[Webview] 隐藏所有 Webview");

    let manager = get_webview_manager();
    if let Ok(m) = manager.lock() {
        for id in m.tabs.keys() {
            if let Some(window) = app.get_webview_window(id) {
                let _ = window.hide();
            }
        }
    }

    if let Ok(mut m) = manager.lock() {
        m.visible_tab = None;
    }

    Ok(())
}

/// 关闭 Webview 标签页
#[tauri::command]
pub async fn close_webview_tab(app: AppHandle, id: String) -> Result<(), String> {
    tracing::info!("[Webview] 关闭 Webview: {}", id);

    if let Some(window) = app.get_webview_window(&id) {
        window.close().map_err(|e| format!("关闭 Webview 失败: {}", e))?;
    }

    // 从管理器移除
    let manager = get_webview_manager();
    if let Ok(mut m) = manager.lock() {
        m.tabs.remove(&id);
        if m.visible_tab.as_ref() == Some(&id) {
            m.visible_tab = None;
        }
    }

    Ok(())
}

/// 调整 Webview 标签页大小和位置
#[tauri::command]
pub async fn resize_webview_tab(
    app: AppHandle,
    id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    tracing::debug!("[Webview] 调整 Webview 大小: {} -> ({}, {}, {}, {})", id, x, y, width, height);

    if let Some(window) = app.get_webview_window(&id) {
        use tauri::{Position, Size, PhysicalPosition, PhysicalSize};

        window
            .set_position(Position::Physical(PhysicalPosition::new(x, y)))
            .map_err(|e| format!("设置位置失败: {}", e))?;

        window
            .set_size(Size::Physical(PhysicalSize::new(width, height)))
            .map_err(|e| format!("设置大小失败: {}", e))?;
    }

    Ok(())
}

/// Webview 导航 - 后退
#[tauri::command]
pub async fn webview_go_back(app: AppHandle, id: String) -> Result<(), String> {
    tracing::info!("[Webview] 后退: {}", id);

    if let Some(window) = app.get_webview_window(&id) {
        window.eval("window.history.back()").ok();
    }

    Ok(())
}

/// Webview 导航 - 前进
#[tauri::command]
pub async fn webview_go_forward(app: AppHandle, id: String) -> Result<(), String> {
    tracing::info!("[Webview] 前进: {}", id);

    if let Some(window) = app.get_webview_window(&id) {
        window.eval("window.history.forward()").ok();
    }

    Ok(())
}

/// Webview 刷新
#[tauri::command]
pub async fn webview_refresh(app: AppHandle, id: String) -> Result<(), String> {
    tracing::info!("[Webview] 刷新: {}", id);

    if let Some(window) = app.get_webview_window(&id) {
        window.eval("window.location.reload()").ok();
    }

    Ok(())
}

/// Webview 导航到指定 URL
#[tauri::command]
pub async fn webview_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    tracing::info!("[Webview] 导航到: {} -> {}", id, url);

    if let Some(window) = app.get_webview_window(&id) {
        let script = format!("window.location.href = '{}'", url);
        window.eval(&script).ok();

        // 更新管理器中的 URL
        let manager = get_webview_manager();
        if let Ok(mut m) = manager.lock() {
            m.tabs.insert(id, url);
        }
    }

    Ok(())
}

/// 获取当前 Webview 的 URL
#[tauri::command]
pub async fn get_webview_url(id: String) -> Result<Option<String>, String> {
    let manager = get_webview_manager();
    if let Ok(m) = manager.lock() {
        Ok(m.tabs.get(&id).cloned())
    } else {
        Ok(None)
    }
}

/// 获取所有 Webview 标签页
#[tauri::command]
pub async fn get_all_webview_tabs() -> Result<Vec<WebviewTabInfo>, String> {
    let manager = get_webview_manager();
    if let Ok(m) = manager.lock() {
        let tabs: Vec<WebviewTabInfo> = m
            .tabs
            .iter()
            .map(|(id, url)| WebviewTabInfo {
                id: id.clone(),
                url: url.clone(),
                title: extract_domain_name(url),
            })
            .collect();
        Ok(tabs)
    } else {
        Ok(vec![])
    }
}

/// 从 URL 提取域名作为标题
fn extract_domain_name(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            // 提取主域名（去掉 www. 前缀）
            let host = host.strip_prefix("www.").unwrap_or(host);
            // 搜索引擎特殊处理
            if host.contains("google.") {
                return "Google 搜索".to_string();
            } else if host.contains("baidu.") {
                return "百度搜索".to_string();
            } else if host.contains("bing.") {
                return "Bing 搜索".to_string();
            } else if host.contains("github.") {
                return "GitHub".to_string();
            } else if host.contains("stackoverflow.") {
                return "Stack Overflow".to_string();
            }
            return host.to_string();
        }
    }
    "网页".to_string()
}
