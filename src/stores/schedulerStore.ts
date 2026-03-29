/**
 * 定时任务状态管理（精简版）
 */

import { create } from 'zustand';
import type { ScheduledTask, TriggerType, CreateTaskParams, TaskExecution, ExecutionLog, ToolCallRecord, ExecutionStatus } from '../types/scheduler';
import * as tauri from '../services/tauri';
import type { LockStatus } from '../services/tauri';

interface SchedulerState {
  /** 任务列表 */
  tasks: ScheduledTask[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 锁状态 */
  lockStatus: LockStatus | null;
  /** 锁操作加载中 */
  lockLoading: boolean;
  /** 正在执行的任务 ID 集合 */
  runningTaskIds: Set<string>;

  // === 执行详情相关 ===
  /** 当前查看的执行详情 */
  currentExecution: TaskExecution | null;
  /** 执行详情视图是否显示 */
  showExecutionView: boolean;

  /** 加载任务列表 */
  loadTasks: () => Promise<void>;
  /** 创建任务 */
  createTask: (params: CreateTaskParams) => Promise<ScheduledTask>;
  /** 更新任务 */
  updateTask: (task: ScheduledTask) => Promise<void>;
  /** 删除任务 */
  deleteTask: (id: string) => Promise<void>;
  /** 切换任务启用状态 */
  toggleTask: (id: string, enabled: boolean) => Promise<void>;
  /** 验证触发表达式 */
  validateTrigger: (type: TriggerType, value: string) => Promise<number | null>;
  /** 获取锁状态 */
  loadLockStatus: () => Promise<void>;
  /** 获取锁 */
  acquireLock: () => Promise<boolean>;
  /** 释放锁 */
  releaseLock: () => Promise<void>;
  /** 手动触发任务执行 */
  runTask: (id: string) => Promise<ScheduledTask>;
  /** 更新任务执行结果 */
  updateRunStatus: (id: string, status: 'success' | 'failed') => Promise<void>;
  /** 检查任务是否正在执行 */
  isTaskRunning: (id: string) => boolean;

  // === 执行详情相关方法 ===
  /** 打开执行详情视图 */
  openExecutionView: (taskId: string, taskName: string) => void;
  /** 关闭执行详情视图 */
  closeExecutionView: () => void;
  /** 添加执行日志 */
  addExecutionLog: (taskId: string, log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
  /** 添加工具调用记录 */
  addToolCall: (taskId: string, toolCall: Omit<ToolCallRecord, 'startTime'>) => void;
  /** 更新执行状态 */
  setExecutionStatus: (taskId: string, status: ExecutionStatus, error?: string) => void;
  /** 清空执行日志 */
  clearExecutionLogs: (taskId: string) => void;
  /** 获取任务执行详情 */
  getTaskExecution: (taskId: string) => TaskExecution | null;
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  lockStatus: null,
  lockLoading: false,
  runningTaskIds: new Set<string>(),
  currentExecution: null,
  showExecutionView: false,

  loadTasks: async () => {
    set({ loading: true, error: null });
    try {
      const tasks = await tauri.schedulerGetTasks();
      set({ tasks, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '加载任务失败',
        loading: false,
      });
    }
  },

  createTask: async (params) => {
    set({ loading: true, error: null });
    try {
      const task = await tauri.schedulerCreateTask(params);

      // 刷新列表
      const tasks = await tauri.schedulerGetTasks();
      set({ tasks, loading: false });

      return task;
    } catch (e) {
      const error = e instanceof Error ? e.message : '创建任务失败';
      set({ error, loading: false });
      throw new Error(error);
    }
  },

  updateTask: async (task) => {
    set({ loading: true, error: null });
    try {
      await tauri.schedulerUpdateTask(task);

      // 刷新列表
      const tasks = await tauri.schedulerGetTasks();
      set({ tasks, loading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : '更新任务失败';
      set({ error, loading: false });
      throw new Error(error);
    }
  },

  deleteTask: async (id) => {
    set({ loading: true, error: null });
    try {
      await tauri.schedulerDeleteTask(id);

      // 刷新列表
      const tasks = await tauri.schedulerGetTasks();
      set({ tasks, loading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : '删除任务失败';
      set({ error, loading: false });
      throw new Error(error);
    }
  },

  toggleTask: async (id, enabled) => {
    try {
      await tauri.schedulerToggleTask(id, enabled);

      // 更新本地状态
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, enabled } : t
        ),
      }));
    } catch (e) {
      console.error('切换任务状态失败:', e);
    }
  },

  validateTrigger: async (type, value) => {
    try {
      return await tauri.schedulerValidateTrigger(type, value);
    } catch (e) {
      console.error('验证触发表达式失败:', e);
      return null;
    }
  },

  loadLockStatus: async () => {
    try {
      const lockStatus = await tauri.schedulerGetLockStatus();
      set({ lockStatus });
    } catch (e) {
      console.error('获取锁状态失败:', e);
    }
  },

  acquireLock: async () => {
    set({ lockLoading: true });
    try {
      const success = await tauri.schedulerAcquireLock();
      // 刷新锁状态
      const lockStatus = await tauri.schedulerGetLockStatus();
      set({ lockStatus, lockLoading: false });
      return success;
    } catch (e) {
      console.error('获取锁失败:', e);
      set({ lockLoading: false });
      return false;
    }
  },

  releaseLock: async () => {
    set({ lockLoading: true });
    try {
      await tauri.schedulerReleaseLock();
      // 刷新锁状态
      const lockStatus = await tauri.schedulerGetLockStatus();
      set({ lockStatus, lockLoading: false });
    } catch (e) {
      console.error('释放锁失败:', e);
      set({ lockLoading: false });
    }
  },

  runTask: async (id) => {
    // 标记任务为执行中
    set((state) => {
      const newRunningTaskIds = new Set(state.runningTaskIds);
      newRunningTaskIds.add(id);
      return { runningTaskIds: newRunningTaskIds };
    });

    try {
      const task = await tauri.schedulerRunTask(id);

      // 更新本地任务状态
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, lastRunStatus: 'running' as const, lastRunAt: Date.now() / 1000 } : t
        ),
      }));

      return task;
    } catch (e) {
      // 执行失败，移除执行中状态
      set((state) => {
        const newRunningTaskIds = new Set(state.runningTaskIds);
        newRunningTaskIds.delete(id);
        return { runningTaskIds: newRunningTaskIds };
      });
      throw e;
    }
  },

  updateRunStatus: async (id, status) => {
    try {
      await tauri.schedulerUpdateRunStatus(id, status);

      // 更新本地状态
      set((state) => {
        const newRunningTaskIds = new Set(state.runningTaskIds);
        newRunningTaskIds.delete(id);
        return {
          runningTaskIds: newRunningTaskIds,
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, lastRunStatus: status } : t
          ),
        };
      });
    } catch (e) {
      console.error('更新任务执行状态失败:', e);
    }
  },

  isTaskRunning: (id) => {
    return get().runningTaskIds.has(id);
  },

  // === 执行详情相关方法 ===
  openExecutionView: (taskId, taskName) => {
    const existingExecution = get().currentExecution;
    if (existingExecution && existingExecution.taskId === taskId) {
      set({ showExecutionView: true });
      return;
    }

    // 创建新的执行详情
    const execution: TaskExecution = {
      taskId,
      taskName,
      status: get().runningTaskIds.has(taskId) ? 'running' : 'idle',
      startTime: Date.now(),
      logs: [],
      toolCalls: [],
    };
    set({ currentExecution: execution, showExecutionView: true });
  },

  closeExecutionView: () => {
    set({ showExecutionView: false });
  },

  addExecutionLog: (taskId, log) => {
    set((state) => {
      if (!state.currentExecution || state.currentExecution.taskId !== taskId) {
        return state;
      }
      const newLog: ExecutionLog = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        ...log,
      };
      return {
        currentExecution: {
          ...state.currentExecution,
          logs: [...state.currentExecution.logs, newLog],
        },
      };
    });
  },

  addToolCall: (taskId, toolCall) => {
    set((state) => {
      if (!state.currentExecution || state.currentExecution.taskId !== taskId) {
        return state;
      }
      const newToolCall: ToolCallRecord = {
        ...toolCall,
        startTime: Date.now(),
      };
      return {
        currentExecution: {
          ...state.currentExecution,
          toolCalls: [...state.currentExecution.toolCalls, newToolCall],
        },
      };
    });
  },

  setExecutionStatus: (taskId, status, error) => {
    set((state) => {
      if (!state.currentExecution || state.currentExecution.taskId !== taskId) {
        return state;
      }
      return {
        currentExecution: {
          ...state.currentExecution,
          status,
          endTime: status === 'success' || status === 'failed' || status === 'cancelled' ? Date.now() : undefined,
          error,
        },
      };
    });
  },

  clearExecutionLogs: (taskId) => {
    set((state) => {
      if (!state.currentExecution || state.currentExecution.taskId !== taskId) {
        return state;
      }
      return {
        currentExecution: {
          ...state.currentExecution,
          logs: [],
        },
      };
    });
  },

  getTaskExecution: (taskId) => {
    const state = get();
    if (state.currentExecution && state.currentExecution.taskId === taskId) {
      return state.currentExecution;
    }
    return null;
  },
}));
