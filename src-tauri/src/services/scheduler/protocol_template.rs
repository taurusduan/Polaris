//! Protocol Template Service
//!
//! Manages protocol templates for document-driven task workflows.
//! Supports both built-in templates and user-defined custom templates.

use crate::error::Result;
use crate::models::scheduler::{
    CreateProtocolTemplateParams, ProtocolTemplate, ProtocolTemplateStore,
    TaskCategory, TriggerType, get_builtin_protocol_templates,
};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Protocol template storage service
pub struct ProtocolTemplateService {
    /// Storage file path
    store_path: PathBuf,
    /// In-memory cache
    cache: Arc<Mutex<Option<ProtocolTemplateStore>>>,
}

impl ProtocolTemplateService {
    /// Create a new template service
    pub fn new(config_dir: &PathBuf) -> Self {
        let store_path = config_dir.join("protocol-templates.json");
        Self {
            store_path,
            cache: Arc::new(Mutex::new(None)),
        }
    }

    /// Load template store from disk
    fn load_store(&self) -> Result<ProtocolTemplateStore> {
        // Check cache first
        if let Some(ref cache) = *self.cache.lock().unwrap() {
            return Ok(cache.clone());
        }

        // Load from file
        let store = if self.store_path.exists() {
            let content = fs::read_to_string(&self.store_path)?;
            serde_json::from_str(&content).unwrap_or_else(|_| ProtocolTemplateStore::default())
        } else {
            ProtocolTemplateStore::default()
        };

        // Update cache
        *self.cache.lock().unwrap() = Some(store.clone());

        Ok(store)
    }

    /// Save template store to disk
    fn save_store(&self, store: &ProtocolTemplateStore) -> Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = self.store_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Write to file
        let content = serde_json::to_string_pretty(store)?;
        fs::write(&self.store_path, content)?;

        // Update cache
        *self.cache.lock().unwrap() = Some(store.clone());

        Ok(())
    }

    /// Get all templates (built-in + custom)
    pub fn list_templates(&self) -> Result<Vec<ProtocolTemplate>> {
        let store = self.load_store()?;
        let builtins = get_builtin_protocol_templates();
        let mut all = builtins;
        all.extend(store.templates);
        Ok(all)
    }

    /// Get templates by category
    pub fn list_templates_by_category(&self, category: TaskCategory) -> Result<Vec<ProtocolTemplate>> {
        let all = self.list_templates()?;
        Ok(all.into_iter().filter(|t| t.category == category).collect())
    }

    /// Get a single template by ID
    pub fn get_template(&self, id: &str) -> Result<Option<ProtocolTemplate>> {
        let all = self.list_templates()?;
        Ok(all.into_iter().find(|t| t.id == id))
    }

    /// Check if a template is built-in
    pub fn is_builtin_template(&self, id: &str) -> bool {
        let builtins = get_builtin_protocol_templates();
        builtins.iter().any(|t| t.id == id)
    }

    /// Create a custom template
    pub fn create_template(&self, params: CreateProtocolTemplateParams) -> Result<ProtocolTemplate> {
        let mut store = self.load_store()?;

        // Generate ID
        let now = chrono::Utc::now().timestamp();
        let id = format!("custom-{}", now);

        let template = ProtocolTemplate {
            id,
            name: params.name,
            description: params.description,
            category: params.category,
            builtin: false,
            protocol_config: params.protocol_config,
            prompt_template: params.prompt_template,
            params: params.params,
            default_trigger_type: params.default_trigger_type,
            default_trigger_value: params.default_trigger_value,
            default_engine_id: params.default_engine_id,
            default_max_runs: params.default_max_runs,
            default_timeout_minutes: params.default_timeout_minutes,
            enabled: params.enabled,
            created_at: now,
            updated_at: now,
        };

        store.templates.push(template.clone());
        self.save_store(&store)?;

        Ok(template)
    }

    /// Update a custom template
    pub fn update_template(&self, id: &str, params: CreateProtocolTemplateParams) -> Result<Option<ProtocolTemplate>> {
        // Cannot update built-in templates
        if self.is_builtin_template(id) {
            return Ok(None);
        }

        let mut store = self.load_store()?;
        let now = chrono::Utc::now().timestamp();

        if let Some(template) = store.templates.iter_mut().find(|t| t.id == id) {
            template.name = params.name;
            template.description = params.description;
            template.category = params.category;
            template.protocol_config = params.protocol_config;
            template.prompt_template = params.prompt_template;
            template.params = params.params;
            template.default_trigger_type = params.default_trigger_type;
            template.default_trigger_value = params.default_trigger_value;
            template.default_engine_id = params.default_engine_id;
            template.default_max_runs = params.default_max_runs;
            template.default_timeout_minutes = params.default_timeout_minutes;
            template.updated_at = now;

            let updated = template.clone();
            self.save_store(&store)?;
            Ok(Some(updated))
        } else {
            Ok(None)
        }
    }

    /// Delete a custom template
    pub fn delete_template(&self, id: &str) -> Result<bool> {
        // Cannot delete built-in templates
        if self.is_builtin_template(id) {
            return Ok(false);
        }

        let mut store = self.load_store()?;
        let original_len = store.templates.len();
        store.templates.retain(|t| t.id != id);

        if store.templates.len() < original_len {
            self.save_store(&store)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Toggle template enabled state
    pub fn toggle_template(&self, id: &str, enabled: bool) -> Result<Option<ProtocolTemplate>> {
        // Built-in templates cannot be disabled (they're always enabled)
        if self.is_builtin_template(id) {
            let builtins = get_builtin_protocol_templates();
            return Ok(builtins.into_iter().find(|t| t.id == id));
        }

        let mut store = self.load_store()?;
        let now = chrono::Utc::now().timestamp();

        if let Some(template) = store.templates.iter_mut().find(|t| t.id == id) {
            template.enabled = enabled;
            template.updated_at = now;

            let updated = template.clone();
            self.save_store(&store)?;
            Ok(Some(updated))
        } else {
            Ok(None)
        }
    }

    /// Clear cache (useful for testing or forced reload)
    pub fn clear_cache(&self) {
        *self.cache.lock().unwrap() = None;
    }
}
