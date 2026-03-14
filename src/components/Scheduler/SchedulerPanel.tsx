/**
 * 定时任务管理面板
 */

import { useEffect, useState } from 'react';
import { useSchedulerStore } from '../../stores';
import type { TaskLog, TriggerType, CreateTaskParams } from '../../types/scheduler';
import type { ScheduledTask } from '../../types/scheduler';
import { TriggerTypeLabels, IntervalUnitLabels, parseIntervalValue } from '../../types/scheduler';

/** 格式化时间戳 */
function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return '--';
  return new Date(timestamp * 1000).toLocaleString('zh-CN');
}

/** 格式化相对时间 */
function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return '--';
  const now = Date.now() / 1000;
  const diff = timestamp - now;

  if (diff < 0) return '已过期';
  if (diff < 60) return `${Math.floor(diff)} 秒后`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟后`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时后`;
  return `${Math.floor(diff / 86400)} 天后`;
}

/** 状态徽章 */
function StatusBadge({ status }: { status?: 'running' | 'success' | 'failed' }) {
  if (!status) return <span className="text-gray-400">未执行</span>;

  const styles = {
    running: 'bg-blue-500/20 text-blue-400',
    success: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  const labels = {
    running: '执行中',
    success: '成功',
    failed: '失败',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/** 任务卡片 */
function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggle,
  onRun,
}: {
  task: ScheduledTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => void;
}) {
  return (
    <div className="bg-[#1a1a2e] rounded-lg p-4 border border-[#2a2a4a]">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${task.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
            <h3 className="text-white font-medium">{task.name}</h3>
          </div>

          <div className="mt-2 text-sm text-gray-400 space-y-1">
            <p>
              <span className="text-gray-500">触发: </span>
              {TriggerTypeLabels[task.triggerType]} - {task.triggerValue}
            </p>
            <p>
              <span className="text-gray-500">引擎: </span>
              {task.engineId}
            </p>
            <div className="flex items-center gap-4">
              <span>
                <span className="text-gray-500">状态: </span>
                <StatusBadge status={task.lastRunStatus} />
              </span>
              {task.enabled && task.nextRunAt && (
                <span>
                  <span className="text-gray-500">下次: </span>
                  {formatRelativeTime(task.nextRunAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            title="立即执行"
          >
            执行
          </button>
          <button
            onClick={onToggle}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              task.enabled
                ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
            }`}
          >
            {task.enabled ? '禁用' : '启用'}
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1 text-sm bg-gray-600/20 text-gray-300 hover:bg-gray-600/30 rounded transition-colors"
          >
            编辑
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

/** 任务编辑弹窗 */
function TaskEditor({
  task,
  onSave,
  onClose,
}: {
  task?: ScheduledTask;
  onSave: (params: CreateTaskParams) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(task?.name || '');
  const [triggerType, setTriggerType] = useState<TriggerType>(task?.triggerType || 'interval');
  const [triggerValue, setTriggerValue] = useState(task?.triggerValue || '1h');
  const [engineId, setEngineId] = useState(task?.engineId || 'claude');
  const [prompt, setPrompt] = useState(task?.prompt || '');
  const [workDir, setWorkDir] = useState(task?.workDir || '');

  // 间隔快速选择
  const [intervalNum, setIntervalNum] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<'s' | 'm' | 'h' | 'd'>('h');

  useEffect(() => {
    if (triggerType === 'interval') {
      const parsed = parseIntervalValue(triggerValue);
      if (parsed) {
        setIntervalNum(parsed.num);
        setIntervalUnit(parsed.unit);
      }
    }
  }, [triggerType, triggerValue]);

  const handleIntervalChange = (num: number, unit: 's' | 'm' | 'h' | 'd') => {
    setIntervalNum(num);
    setIntervalUnit(unit);
    setTriggerValue(`${num}${unit}`);
  };

  const handleSave = () => {
    if (!name.trim() || !prompt.trim()) {
      alert('请填写任务名称和提示词');
      return;
    }

    onSave({
      name,
      triggerType,
      triggerValue,
      engineId,
      prompt,
      workDir: workDir || undefined,
      enabled: task?.enabled ?? true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#16162a] rounded-lg w-[600px] max-h-[80vh] overflow-y-auto border border-[#2a2a4a]">
        <div className="p-4 border-b border-[#2a2a4a] flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">
            {task ? '编辑任务' : '新建任务'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 任务名称 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">任务名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
              placeholder="例如：每日日报生成"
            />
          </div>

          {/* 触发类型 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">触发方式</label>
            <div className="flex gap-2">
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                className="px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(TriggerTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              {triggerType === 'interval' ? (
                <div className="flex gap-2 flex-1">
                  <input
                    type="number"
                    value={intervalNum}
                    onChange={(e) => handleIntervalChange(parseInt(e.target.value) || 1, intervalUnit)}
                    min={1}
                    className="w-24 px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => handleIntervalChange(intervalNum, e.target.value as 's' | 'm' | 'h' | 'd')}
                    className="px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
                  >
                    {Object.entries(IntervalUnitLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : triggerType === 'cron' ? (
                <input
                  type="text"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="0 9 * * 1-5"
                />
              ) : (
                <input
                  type="datetime-local"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
            {triggerType === 'cron' && (
              <p className="mt-1 text-xs text-gray-500">
                示例: "0 9 * * 1-5" 表示工作日早9点
              </p>
            )}
          </div>

          {/* AI 引擎 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">AI 引擎</label>
            <select
              value={engineId}
              onChange={(e) => setEngineId(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="claude">Claude Code</option>
              <option value="iflow">IFlow</option>
              <option value="codex">Codex</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {/* 工作目录 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">工作目录（可选）</label>
            <input
              type="text"
              value={workDir}
              onChange={(e) => setWorkDir(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500"
              placeholder="留空使用默认目录"
            />
          </div>

          {/* 提示词 */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-white focus:outline-none focus:border-blue-500 resize-none"
              placeholder="输入 AI 要执行的提示词..."
            />
          </div>
        </div>

        <div className="p-4 border-t border-[#2a2a4a] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600/20 text-gray-300 hover:bg-gray-600/30 rounded transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 日志列表 */
function LogList({ logs }: { logs: TaskLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        暂无执行日志
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a4a]">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          >
            <div className="flex items-center gap-3">
              <StatusBadge status={log.status} />
              <span className="text-white">{log.taskName}</span>
            </div>
            <div className="text-sm text-gray-400">
              {formatTime(log.startedAt)}
              {log.finishedAt && (
                <span className="ml-2">
                  耗时 {log.finishedAt - log.startedAt}s
                </span>
              )}
            </div>
          </div>

          {expandedId === log.id && (
            <div className="mt-3 pt-3 border-t border-[#2a2a4a]">
              <div className="text-sm text-gray-400 mb-2">提示词:</div>
              <pre className="text-xs text-gray-300 bg-[#12122a] p-2 rounded overflow-x-auto">
                {log.prompt}
              </pre>

              {log.output && (
                <>
                  <div className="text-sm text-gray-400 mt-3 mb-2">输出:</div>
                  <pre className="text-xs text-green-400 bg-[#12122a] p-2 rounded overflow-x-auto max-h-60">
                    {log.output}
                  </pre>
                </>
              )}

              {log.error && (
                <>
                  <div className="text-sm text-gray-400 mt-3 mb-2">错误:</div>
                  <pre className="text-xs text-red-400 bg-[#12122a] p-2 rounded overflow-x-auto">
                    {log.error}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 主面板 */
export function SchedulerPanel() {
  const { tasks, logs, loading, loadTasks, loadLogs, createTask, updateTask, deleteTask, toggleTask, runTask } =
    useSchedulerStore();

  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | undefined>();
  const [activeTab, setActiveTab] = useState<'tasks' | 'logs'>('tasks');

  useEffect(() => {
    loadTasks();
    loadLogs(50);
  }, [loadTasks, loadLogs]);

  const handleCreate = async (params: CreateTaskParams) => {
    try {
      await createTask(params);
      setShowEditor(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    }
  };

  const handleUpdate = async (params: CreateTaskParams) => {
    if (!editingTask) return;
    try {
      await updateTask({
        ...editingTask,
        ...params,
      });
      setShowEditor(false);
      setEditingTask(undefined);
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;
    try {
      await deleteTask(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#12122a]">
      {/* 头部 */}
      <div className="p-4 border-b border-[#2a2a4a] flex items-center justify-between">
        <h1 className="text-xl font-medium text-white flex items-center gap-2">
          <span>⏰</span> 定时任务
        </h1>
        <button
          onClick={() => {
            setEditingTask(undefined);
            setShowEditor(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          + 新建任务
        </button>
      </div>

      {/* 标签页 */}
      <div className="border-b border-[#2a2a4a]">
        <div className="flex">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'tasks'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            任务列表 ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'logs'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            执行日志 ({logs.length})
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center text-gray-500 py-8">加载中...</div>
        ) : activeTab === 'tasks' ? (
          tasks.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              暂无定时任务，点击右上角按钮创建
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={() => {
                    setEditingTask(task);
                    setShowEditor(true);
                  }}
                  onDelete={() => handleDelete(task.id)}
                  onToggle={() => toggleTask(task.id, !task.enabled)}
                  onRun={() => runTask(task.id)}
                />
              ))}
            </div>
          )
        ) : (
          <LogList logs={logs} />
        )}
      </div>

      {/* 编辑弹窗 */}
      {showEditor && (
        <TaskEditor
          task={editingTask}
          onSave={editingTask ? handleUpdate : handleCreate}
          onClose={() => {
            setShowEditor(false);
            setEditingTask(undefined);
          }}
        />
      )}
    </div>
  );
}

export default SchedulerPanel;
