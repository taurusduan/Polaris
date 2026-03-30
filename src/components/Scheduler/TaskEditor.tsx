/**
 * 任务编辑器组件
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduledTask, CreateTaskParams, TriggerType } from '../../types/scheduler';
import { TEMPLATE_VARIABLES } from '../../types/scheduler';
import { TriggerConfig } from './TriggerConfig';
import { useToastStore, useWorkspaceStore, useConfigStore, useSchedulerStore } from '../../stores';

export interface TaskEditorProps {
  /** 编辑的任务（可选，不传则为新建） */
  task?: ScheduledTask;
  /** 保存回调 */
  onSave: (params: CreateTaskParams) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 弹窗标题 */
  title?: string;
}

/** 解析引擎 ID */
function parseEngineId(engineId: string): { baseEngine: string; providerId?: string } {
  if (engineId.startsWith('provider-')) {
    return { baseEngine: 'openai', providerId: engineId.replace('provider-', '') };
  }
  return { baseEngine: engineId };
}

export function TaskEditor({ task, onSave, onClose, title }: TaskEditorProps) {
  const { t } = useTranslation('scheduler');
  const toast = useToastStore();
  const { getCurrentWorkspace, workspaces } = useWorkspaceStore();
  const { config } = useConfigStore();
  const { templates, loadTemplates } = useSchedulerStore();

  // OpenAI Providers
  const openaiProviders = config?.openaiProviders || [];

  // 默认工作目录
  const currentWorkspace = getCurrentWorkspace();
  const defaultWorkDir = currentWorkspace?.path || config?.workDir || '';

  // 基本字段
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');
  const [prompt, setPrompt] = useState(task?.prompt || '');
  const [workDir, setWorkDir] = useState(task?.workDir || defaultWorkDir);

  // 触发配置
  const [triggerType, setTriggerType] = useState<TriggerType>(task?.triggerType || 'interval');
  const [triggerValue, setTriggerValue] = useState(task?.triggerValue || '1h');

  // 引擎配置
  const [engineId, setEngineId] = useState(task?.engineId || 'claude-code');

  // 模板配置
  const [templateId, setTemplateId] = useState<string | null>(task?.templateId || null);

  // 加载模板
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 获取选中的模板
  const selectedTemplate = templates.find((t) => t.id === templateId);

  // 生成预览
  const getPreview = () => {
    if (!selectedTemplate) return null;
    const now = new Date();
    const previewPrompt = prompt || t('editor.promptPreviewPlaceholder');
    return selectedTemplate.content
      .replace(/\{\{prompt\}\}/g, previewPrompt)
      .replace(/\{\{taskName\}\}/g, name || t('editor.taskNamePlaceholder'))
      .replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
      .replace(/\{\{time\}\}/g, now.toTimeString().slice(0, 5))
      .replace(/\{\{datetime\}\}/g, `${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`)
      .replace(/\{\{weekday\}\}/g, ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()]);
  };

  // 验证并保存
  const handleSave = () => {
    if (!name.trim()) {
      toast.warning(t('editor.nameRequired'));
      return;
    }

    if (!prompt.trim()) {
      toast.warning(t('editor.promptRequired'));
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      prompt: prompt.trim(),
      triggerType,
      triggerValue,
      engineId,
      workDir: workDir.trim() || undefined,
      enabled: task?.enabled ?? true,
      templateId: templateId || undefined,
    });
  };

  // 基础引擎选择
  const { baseEngine, providerId } = parseEngineId(engineId);

  const handleBaseEngineChange = (newBaseEngine: string) => {
    if (newBaseEngine === 'openai') {
      const enabledProviders = openaiProviders.filter((p) => p.enabled);
      if (enabledProviders.length > 0) {
        setEngineId(`provider-${enabledProviders[0].id}`);
      }
    } else {
      setEngineId(newBaseEngine);
    }
  };

  const handleProviderChange = (newProviderId: string) => {
    setEngineId(`provider-${newProviderId}`);
  };

  // 检测失效的 Provider
  const selectedProvider = openaiProviders.find((p) => p.id === providerId);
  const providerInvalid = baseEngine === 'openai' && providerId && (!selectedProvider || !selectedProvider.enabled);

  // 启用的模板列表
  const enabledTemplates = templates.filter((t) => t.enabled);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-xl w-[650px] max-h-[85vh] overflow-hidden border border-border-subtle shadow-2xl flex flex-col">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {title || (task ? t('editor.editTask') : t('editor.newTask'))}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 表单内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 任务名称 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.name')} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('editor.namePlaceholder')}
              className="w-full px-3 py-2 bg-background-surface border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* 任务描述 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.description')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('editor.descriptionPlaceholder')}
              className="w-full px-3 py-2 bg-background-surface border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* 触发配置 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.trigger')}
            </label>
            <TriggerConfig
              triggerType={triggerType}
              triggerValue={triggerValue}
              onTypeChange={setTriggerType}
              onValueChange={setTriggerValue}
            />
          </div>

          {/* AI 引擎 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.engine')}
            </label>
            <div className="space-y-2">
              {/* Provider 失效警告 */}
              {providerInvalid && (
                <div className="p-2 bg-warning-faint border border-warning/30 rounded-lg text-xs text-warning">
                  {t('editor.providerInvalid')}
                </div>
              )}

              <select
                value={baseEngine}
                onChange={(e) => handleBaseEngineChange(e.target.value)}
                className="w-full px-3 py-2 bg-background-surface border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="claude-code">Claude Code</option>
                <option value="iflow">IFlow</option>
                <option value="codex">Codex</option>
                <option value="openai" disabled={openaiProviders.filter((p) => p.enabled).length === 0}>
                  OpenAI Provider {openaiProviders.filter((p) => p.enabled).length === 0 ? `(${t('editor.noProvider')})` : ''}
                </option>
              </select>

              {/* OpenAI Provider 二级选择 */}
              {baseEngine === 'openai' && (
                <div className="pl-3 border-l-2 border-border-subtle">
                  <label className="block text-xs text-text-muted mb-1">
                    {t('editor.selectProvider')}
                  </label>
                  {openaiProviders.filter((p) => p.enabled).length > 0 ? (
                    <>
                      <select
                        value={providerId || ''}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        className="w-full px-3 py-2 bg-background-base border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        {openaiProviders
                          .filter((p) => p.enabled)
                          .map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.name} ({provider.model})
                            </option>
                          ))}
                      </select>
                      {selectedProvider && (
                        <div className="mt-2 p-2 bg-background-base rounded-lg text-xs text-text-secondary space-y-1">
                          <div>
                            {t('editor.model')}: <span className="text-primary">{selectedProvider.model}</span>
                          </div>
                          <div>
                            API: <span className="text-text-muted">{selectedProvider.apiBase}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-warning">{t('editor.noProviderConfigured')}</p>
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('navigate-to-settings', {
                              detail: { tab: 'openai-providers' },
                            })
                          );
                          onClose();
                        }}
                        className="px-3 py-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
                      >
                        {t('editor.goConfig')} →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 工作目录 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.workDir')}
            </label>
            <div className="space-y-2">
              {workspaces.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => setWorkDir(ws.path)}
                      className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                        workDir === ws.path
                          ? 'bg-primary text-white'
                          : 'bg-background-hover text-text-secondary hover:bg-background-active'
                      }`}
                    >
                      {ws.name}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={workDir}
                onChange={(e) => setWorkDir(e.target.value)}
                placeholder={t('editor.workDirPlaceholder')}
                className="w-full px-3 py-2 bg-background-surface border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* 提示词模板 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.promptTemplate')}
            </label>
            <select
              value={templateId || ''}
              onChange={(e) => setTemplateId(e.target.value || null)}
              className="w-full px-3 py-2 bg-background-surface border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">{t('editor.noTemplate')}</option>
              {enabledTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="mt-2 text-xs text-text-muted">
                {selectedTemplate.description && (
                  <p className="mb-1">{selectedTemplate.description}</p>
                )}
                <p>{t('editor.templateVariables')}: {TEMPLATE_VARIABLES.map((v) => v.key).join(', ')}</p>
              </div>
            )}
          </div>

          {/* 提示词 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t('editor.prompt')} <span className="text-danger">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder={t('editor.promptPlaceholder')}
              className="w-full px-3 py-2 bg-background-surface border border-border-subtle rounded-lg text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* 模板预览 */}
          {selectedTemplate && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                {t('editor.templatePreview')}
              </label>
              <div className="p-3 bg-background-surface border border-border-subtle rounded-lg text-sm text-text-secondary whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                {getPreview()}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-4 border-t border-border-subtle flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-background-hover text-text-secondary hover:bg-background-active rounded-lg transition-colors"
          >
            {t('editor.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
          >
            {t('editor.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
