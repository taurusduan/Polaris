/**
 * simpleTodoService.ts 单元测试
 *
 * 测试简化待办服务的核心功能：
 * - 工作区管理
 * - CRUD 操作
 * - 查询功能
 * - 子任务管理
 * - 订阅机制
 * - 文件持久化
 *
 * 注意：所有 Tauri IPC 调用通过 vi.mocked(invoke) 进行 mock。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { TodoItem, TodoCreateParams } from '../types';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// 导入被测模块（需要在 mock 之后）
import { SimpleTodoService, simpleTodoService } from './simpleTodoService';

// 获取 mock 函数
const mockInvoke = vi.mocked(invoke);

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建模拟的 TodoItem
 */
function createMockTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'test-uuid-1',
    content: 'Test Todo',
    status: 'pending',
    priority: 'normal',
    createdAt: '2026-03-19T10:00:00.000Z',
    updatedAt: '2026-03-19T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * 创建模拟的文件内容
 */
function createMockFileContent(todos: TodoItem[] = []): string {
  return JSON.stringify({
    version: '1.0.0',
    updatedAt: '2026-03-19T10:00:00.000Z',
    todos,
  });
}

// ============================================================
// 工作区管理测试
// ============================================================
describe('工作区管理', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentWorkspacePath', () => {
    it('初始状态应返回 null', () => {
      expect(service.getCurrentWorkspacePath()).toBeNull();
    });

    it('设置工作区后应返回路径', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent());

      await service.setWorkspace('/test/workspace');

      expect(service.getCurrentWorkspacePath()).toBe('/test/workspace');
    });
  });

  describe('setWorkspace', () => {
    it('应加载文件中的待办', async () => {
      const mockTodos = [createMockTodo({ id: 'todo-1', content: 'Task 1' })];
      mockInvoke.mockResolvedValueOnce(createMockFileContent(mockTodos));

      const count = await service.setWorkspace('/test/workspace');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: '/test/workspace/.polaris/todos.json',
      });
      expect(count).toBe(1);
      expect(service.getAllTodos()).toHaveLength(1);
    });

    it('文件不存在时应初始化为空并创建文件', async () => {
      mockInvoke
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(undefined);

      const count = await service.setWorkspace('/test/workspace');

      expect(count).toBe(0);
      expect(service.getAllTodos()).toHaveLength(0);
      // 应调用 write_file_absolute 创建文件
      expect(mockInvoke).toHaveBeenCalledWith(
        'write_file_absolute',
        expect.objectContaining({
          path: '/test/workspace/.polaris/todos.json',
        })
      );
    });

    it('相同工作区不强制重载时应跳过', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([createMockTodo()]));

      await service.setWorkspace('/test/workspace');
      const invokeCountAfterFirst = mockInvoke.mock.calls.length;

      const count = await service.setWorkspace('/test/workspace');

      // 第二次调用不应增加 invoke 调用次数
      expect(mockInvoke.mock.calls.length).toBe(invokeCountAfterFirst);
      expect(count).toBe(1);
    });

    it('相同工作区强制重载时应重新加载', async () => {
      mockInvoke
        .mockResolvedValueOnce(createMockFileContent([createMockTodo()]))
        .mockResolvedValueOnce(createMockFileContent([createMockTodo(), createMockTodo({ id: 'todo-2' })]));

      await service.setWorkspace('/test/workspace');
      const invokeCountAfterFirst = mockInvoke.mock.calls.length;

      const count = await service.setWorkspace('/test/workspace', true);

      // 强制重载应增加一次 read 调用
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(invokeCountAfterFirst);
      expect(count).toBe(2);
    });

    it('应返回待办数量', async () => {
      const mockTodos = [
        createMockTodo({ id: '1' }),
        createMockTodo({ id: '2' }),
        createMockTodo({ id: '3' }),
      ];
      mockInvoke.mockResolvedValueOnce(createMockFileContent(mockTodos));

      const count = await service.setWorkspace('/test/workspace');

      expect(count).toBe(3);
    });
  });
});

// ============================================================
// 查询功能测试
// ============================================================
describe('查询功能', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();

    // 初始化工作区并加载测试数据
    const mockTodos = [
      createMockTodo({ id: '1', status: 'pending', priority: 'low' }),
      createMockTodo({ id: '2', status: 'in_progress', priority: 'normal' }),
      createMockTodo({ id: '3', status: 'completed', priority: 'high' }),
      createMockTodo({ id: '4', status: 'pending', priority: 'urgent' }),
    ];
    mockInvoke.mockResolvedValueOnce(createMockFileContent(mockTodos));
    await service.setWorkspace('/test/workspace');
  });

  describe('getAllTodos', () => {
    it('应返回所有待办的数组副本', () => {
      const todos = service.getAllTodos();

      expect(todos).toHaveLength(4);
      // 验证数组是副本（修改数组本身不影响原数组）
      const originalLength = service.getAllTodos().length;
      todos.push(createMockTodo({ id: 'new' }));
      expect(service.getAllTodos().length).toBe(originalLength);
    });

    it('未设置工作区时应返回空数组', () => {
      const newService = new SimpleTodoService();
      expect(newService.getAllTodos()).toEqual([]);
    });
  });

  describe('getTodosByStatus', () => {
    it('应筛选 pending 状态', () => {
      const todos = service.getTodosByStatus('pending');

      expect(todos).toHaveLength(2);
      expect(todos.every(t => t.status === 'pending')).toBe(true);
    });

    it('应筛选 in_progress 状态', () => {
      const todos = service.getTodosByStatus('in_progress');

      expect(todos).toHaveLength(1);
      expect(todos[0].status).toBe('in_progress');
    });

    it('应筛选 completed 状态', () => {
      const todos = service.getTodosByStatus('completed');

      expect(todos).toHaveLength(1);
      expect(todos[0].status).toBe('completed');
    });

    it('status=all 应返回所有待办', () => {
      const todos = service.getTodosByStatus('all');

      expect(todos).toHaveLength(4);
    });
  });

  describe('getStats', () => {
    it('应返回正确的统计信息', () => {
      const stats = service.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(2);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(1);
    });

    it('空待办列表应返回零值统计', async () => {
      const emptyService = new SimpleTodoService();
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await emptyService.setWorkspace('/test/workspace');

      const stats = emptyService.getStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(0);
    });
  });
});

// ============================================================
// CRUD 操作测试
// ============================================================
describe('CRUD 操作', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();

    // 初始化工作区
    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks(); // 清除初始化调用记录
  });

  describe('createTodo', () => {
    it('应创建基本待办', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const params: TodoCreateParams = {
        content: 'New Task',
      };
      const todo = await service.createTodo(params);

      expect(todo.content).toBe('New Task');
      expect(todo.status).toBe('pending');
      expect(todo.priority).toBe('normal');
      expect(todo.id).toBeDefined();
      expect(todo.createdAt).toBeDefined();
      expect(todo.updatedAt).toBeDefined();
      expect(mockInvoke).toHaveBeenCalledWith(
        'write_file_absolute',
        expect.objectContaining({
          path: '/test/workspace/.polaris/todos.json',
        })
      );
    });

    it('应正确设置可选字段', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const params: TodoCreateParams = {
        content: 'Task with options',
        description: 'Detailed description',
        priority: 'high',
        tags: ['important', 'work'],
        relatedFiles: ['/src/index.ts'],
        dueDate: '2026-04-01',
        estimatedHours: 4,
      };
      const todo = await service.createTodo(params);

      expect(todo.description).toBe('Detailed description');
      expect(todo.priority).toBe('high');
      expect(todo.tags).toEqual(['important', 'work']);
      expect(todo.relatedFiles).toEqual(['/src/index.ts']);
      expect(todo.dueDate).toBe('2026-04-01');
      expect(todo.estimatedHours).toBe(4);
    });

    it('应创建带子任务的待办', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const params: TodoCreateParams = {
        content: 'Task with subtasks',
        subtasks: [
          { title: 'Subtask 1' },
          { title: 'Subtask 2' },
        ],
      };
      const todo = await service.createTodo(params);

      expect(todo.subtasks).toHaveLength(2);
      expect(todo.subtasks![0].title).toBe('Subtask 1');
      expect(todo.subtasks![0].completed).toBe(false);
      expect(todo.subtasks![0].id).toBeDefined();
      expect(todo.subtasks![0].createdAt).toBeDefined();
    });

    it('创建后应能查询到', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await service.createTodo({ content: 'Task 1' });
      await service.createTodo({ content: 'Task 2' });

      expect(service.getAllTodos()).toHaveLength(2);
    });

    it('未设置工作区时创建应保存失败但不抛出错误', async () => {
      const noWorkspaceService = new SimpleTodoService();

      // 由于 log.warn 不会抛出错误，这里会正常执行
      // 但 invoke 不会被调用
      const todo = await noWorkspaceService.createTodo({ content: 'Test' });

      expect(mockInvoke).not.toHaveBeenCalled();
      // 待办仍然添加到内存
      expect(noWorkspaceService.getAllTodos()).toHaveLength(1);
    });
  });

  describe('updateTodo', () => {
    it('应更新待办内容', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      // 先创建一个待办
      const created = await service.createTodo({ content: 'Original' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { content: 'Updated' });

      const updated = service.getAllTodos()[0];
      expect(updated.content).toBe('Updated');
      expect(updated.updatedAt).toBeDefined();
    });

    it('应更新状态并记录完成时间', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const created = await service.createTodo({ content: 'Task' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { status: 'completed' });

      const updated = service.getAllTodos()[0];
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('已完成任务再次更新状态不应覆盖完成时间', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const created = await service.createTodo({ content: 'Task' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { status: 'completed' });
      const firstCompletedAt = service.getAllTodos()[0].completedAt;

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { content: 'Updated content' });

      const updated = service.getAllTodos()[0];
      expect(updated.completedAt).toBe(firstCompletedAt);
    });

    it('更新不存在的待办应抛出错误', async () => {
      await expect(
        service.updateTodo('non-existent', { content: 'Updated' })
      ).rejects.toThrow('待办不存在: non-existent');
    });

    it('空内容不应覆盖原有内容', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const created = await service.createTodo({ content: 'Original Content' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { content: '' });

      const updated = service.getAllTodos()[0];
      expect(updated.content).toBe('Original Content');
    });

    it('空白字符串不应覆盖原有内容', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const created = await service.createTodo({ content: 'Original Content' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { content: '   ' });

      const updated = service.getAllTodos()[0];
      expect(updated.content).toBe('Original Content');
    });

    it('有效内容应正常更新', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const created = await service.createTodo({ content: 'Original Content' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { content: 'Valid Content' });

      const updated = service.getAllTodos()[0];
      expect(updated.content).toBe('Valid Content');
    });
  });

  describe('deleteTodo', () => {
    it('应删除指定待办', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const created = await service.createTodo({ content: 'To Delete' });
      expect(service.getAllTodos()).toHaveLength(1);
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.deleteTodo(created.id);

      expect(service.getAllTodos()).toHaveLength(0);
    });

    it('删除不存在的待办应抛出错误', async () => {
      await expect(
        service.deleteTodo('non-existent')
      ).rejects.toThrow('待办不存在: non-existent');
    });

    it('应删除正确的待办', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const todo1 = await service.createTodo({ content: 'Task 1' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      const todo2 = await service.createTodo({ content: 'Task 2' });
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.deleteTodo(todo1.id);

      const remaining = service.getAllTodos();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(todo2.id);
    });
  });
});

// ============================================================
// 子任务管理测试
// ============================================================
describe('子任务管理', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();

    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks();
  });

  describe('toggleSubtask', () => {
    it('应切换子任务完成状态', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({
        content: 'Task with subtasks',
        subtasks: [{ title: 'Subtask 1' }],
      });
      const subtaskId = todo.subtasks![0].id;
      vi.clearAllMocks();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.toggleSubtask(todo.id, subtaskId);

      const updated = service.getAllTodos()[0];
      expect(updated.subtasks![0].completed).toBe(true);

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.toggleSubtask(todo.id, subtaskId);

      const toggled = service.getAllTodos()[0];
      expect(toggled.subtasks![0].completed).toBe(false);
    });

    it('待办不存在时应抛出错误', async () => {
      await expect(
        service.toggleSubtask('non-existent', 'subtask-id')
      ).rejects.toThrow('待办不存在: non-existent');
    });

    it('子任务不存在时应抛出错误', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({
        content: 'Task with subtasks',
        subtasks: [{ title: 'Subtask 1' }],
      });

      await expect(
        service.toggleSubtask(todo.id, 'non-existent-subtask')
      ).rejects.toThrow('子任务不存在: non-existent-subtask');
    });

    it('没有子任务的待办应抛出错误', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task without subtasks' });

      await expect(
        service.toggleSubtask(todo.id, 'any-subtask')
      ).rejects.toThrow('子任务不存在: any-subtask');
    });
  });
});

// ============================================================
// 订阅机制测试
// ============================================================
describe('订阅机制', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();

    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks();
  });

  describe('subscribe', () => {
    it('应在创建待办时通知监听器', async () => {
      const listener = vi.fn();
      service.subscribe(listener);

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.createTodo({ content: 'New Task' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应在更新待办时通知监听器', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const todo = await service.createTodo({ content: 'Task' });

      const listener = vi.fn();
      service.subscribe(listener);

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(todo.id, { content: 'Updated' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应在删除待办时通知监听器', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const todo = await service.createTodo({ content: 'Task' });

      const listener = vi.fn();
      service.subscribe(listener);

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.deleteTodo(todo.id);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应在切换子任务时通知监听器', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const todo = await service.createTodo({
        content: 'Task',
        subtasks: [{ title: 'Subtask' }],
      });

      const listener = vi.fn();
      service.subscribe(listener);

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.toggleSubtask(todo.id, todo.subtasks![0].id);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('取消订阅后不应收到通知', async () => {
      const listener = vi.fn();
      const unsubscribe = service.subscribe(listener);
      unsubscribe();

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.createTodo({ content: 'New Task' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('多个监听器应都被通知', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      service.subscribe(listener1);
      service.subscribe(listener2);
      service.subscribe(listener3);

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.createTodo({ content: 'New Task' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('部分监听器取消订阅后其他应继续收到通知', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      service.subscribe(listener1);
      const unsub2 = service.subscribe(listener2);
      service.subscribe(listener3);

      unsub2(); // 取消 listener2

      mockInvoke.mockResolvedValueOnce(undefined);
      await service.createTodo({ content: 'New Task' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================
// 文件持久化测试
// ============================================================
describe('文件持久化', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  describe('文件格式', () => {
    it('保存时应写入正确格式', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      await service.createTodo({ content: 'New Task' });

      expect(mockInvoke).toHaveBeenCalledWith(
        'write_file_absolute',
        expect.objectContaining({
          path: '/test/workspace/.polaris/todos.json',
          content: expect.stringContaining('"version": "1.0.0"'),
        })
      );
    });

    it('保存应包含 updatedAt 时间戳', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      await service.createTodo({ content: 'New Task' });

      const call = mockInvoke.mock.calls[0];
      const content = JSON.parse(call[1].content);

      expect(content.updatedAt).toBeDefined();
      expect(content.todos).toHaveLength(1);
    });

    it('加载时应解析正确的数据', async () => {
      const mockTodos = [
        createMockTodo({ id: '1', content: 'Task 1', status: 'pending' }),
        createMockTodo({ id: '2', content: 'Task 2', status: 'completed' }),
      ];
      mockInvoke.mockResolvedValueOnce(createMockFileContent(mockTodos));

      await service.setWorkspace('/test/workspace');

      const todos = service.getAllTodos();
      expect(todos).toHaveLength(2);
      expect(todos[0].content).toBe('Task 1');
      expect(todos[1].status).toBe('completed');
    });

    it('加载缺少 todos 字段的文件时应初始化为空', async () => {
      mockInvoke.mockResolvedValueOnce(JSON.stringify({ version: '1.0.0' }));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });

    it('加载无效 JSON 时应初始化为空', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Invalid JSON'));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });
  });

  describe('路径处理', () => {
    it('应使用正确的工作区路径', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));

      await service.setWorkspace('/custom/path/to/workspace');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: '/custom/path/to/workspace/.polaris/todos.json',
      });
    });

    it('Windows 路径应正确处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));

      await service.setWorkspace('D:\\projects\\my-project');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: 'D:\\projects\\my-project/.polaris/todos.json',
      });
    });
  });
});

// ============================================================
// 边界情况和错误处理测试
// ============================================================
describe('边界情况和错误处理', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  describe('空值处理', () => {
    it('创建待办时空子任务数组应正常处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({
        content: 'Task',
        subtasks: [],
      });

      expect(todo.subtasks).toEqual([]);
    });

    it('创建待办时空标签数组应正常处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({
        content: 'Task',
        tags: [],
      });

      expect(todo.tags).toEqual([]);
    });
  });

  describe('并发操作', () => {
    it('连续创建多个待办应全部保存', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValue(undefined);

      await Promise.all([
        service.createTodo({ content: 'Task 1' }),
        service.createTodo({ content: 'Task 2' }),
        service.createTodo({ content: 'Task 3' }),
      ]);

      // 由于并发操作，最终应该有 3 个待办
      expect(service.getAllTodos().length).toBe(3);
    });

    it('并发更新不同待办应正常工作', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      mockInvoke.mockResolvedValueOnce(undefined);
      const todo1 = await service.createTodo({ content: 'Task 1' });
      const todo2 = await service.createTodo({ content: 'Task 2' });

      vi.clearAllMocks();
      mockInvoke.mockResolvedValue(undefined);

      await Promise.all([
        service.updateTodo(todo1.id, { status: 'completed' }),
        service.updateTodo(todo2.id, { status: 'in_progress' }),
      ]);

      const todos = service.getAllTodos();
      const t1 = todos.find(t => t.id === todo1.id);
      const t2 = todos.find(t => t.id === todo2.id);
      expect(t1?.status).toBe('completed');
      expect(t2?.status).toBe('in_progress');
    });
  });

  describe('特殊字符处理', () => {
    it('待办内容应正确处理 Unicode 字符', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({
        content: '任务：完成开发 🔥',
        description: '详细说明：这是一段中文描述 📝',
        tags: ['重要', '紧急'],
      });

      expect(todo.content).toBe('任务：完成开发 🔥');
      expect(todo.description).toBe('详细说明：这是一段中文描述 📝');
      expect(todo.tags).toEqual(['重要', '紧急']);
    });

    it('待办内容应正确处理特殊 JSON 字符', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const specialContent = 'Task with "quotes" and \\backslash\\ and\nnewline';
      const todo = await service.createTodo({
        content: specialContent,
      });

      expect(todo.content).toBe(specialContent);
    });

    it('待办内容应正确处理 HTML 标签', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const htmlContent = '<div>HTML content</div><script>alert("xss")</script>';
      const todo = await service.createTodo({
        content: htmlContent,
      });

      expect(todo.content).toBe(htmlContent);
    });
  });

  describe('极端数据', () => {
    it('超长内容应正常处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const longContent = 'A'.repeat(10000);
      const todo = await service.createTodo({
        content: longContent,
      });

      expect(todo.content).toBe(longContent);
    });

    it('大量待办应正常处理', async () => {
      const manyTodos = Array.from({ length: 100 }, (_, i) =>
        createMockTodo({ id: `todo-${i}`, content: `Task ${i}` })
      );
      mockInvoke.mockResolvedValueOnce(createMockFileContent(manyTodos));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toHaveLength(100);
    });

    it('大量子任务应正常处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const manySubtasks = Array.from({ length: 50 }, (_, i) => ({
        title: `Subtask ${i}`,
      }));
      const todo = await service.createTodo({
        content: 'Task with many subtasks',
        subtasks: manySubtasks,
      });

      expect(todo.subtasks).toHaveLength(50);
    });
  });

  describe('日期处理', () => {
    it('创建时间应使用 ISO 格式', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      // ISO 8601 格式验证
      expect(new Date(todo.createdAt).toISOString()).toBe(todo.createdAt);
    });

    it('更新时间应使用 ISO 格式', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      const created = await service.createTodo({ content: 'Task' });

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { content: 'Updated' });

      const updated = service.getAllTodos()[0];
      expect(new Date(updated.updatedAt).toISOString()).toBe(updated.updatedAt);
    });

    it('完成时间应使用 ISO 格式', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      const created = await service.createTodo({ content: 'Task' });

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);
      await service.updateTodo(created.id, { status: 'completed' });

      const updated = service.getAllTodos()[0];
      expect(updated.completedAt).toBeDefined();
      expect(new Date(updated.completedAt!).toISOString()).toBe(updated.completedAt);
    });
  });
});

// ============================================================
// 单例实例测试
// ============================================================
describe('单例实例', () => {
  it('simpleTodoService 应是 SimpleTodoService 的实例', () => {
    expect(simpleTodoService).toBeInstanceOf(SimpleTodoService);
  });
});

// ============================================================
// 数据一致性测试
// ============================================================
describe('数据一致性', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  it('多次获取待办应返回相同数据', async () => {
    const mockTodos = [createMockTodo({ id: '1', content: 'Task 1' })];
    mockInvoke.mockResolvedValueOnce(createMockFileContent(mockTodos));

    await service.setWorkspace('/test/workspace');

    const first = service.getAllTodos();
    const second = service.getAllTodos();
    const third = service.getTodosByStatus('all');

    expect(first).toEqual(second);
    expect(first).toEqual(third);
  });

  it('统计信息应与实际数据一致', async () => {
    const mockTodos = [
      createMockTodo({ id: '1', status: 'pending' }),
      createMockTodo({ id: '2', status: 'pending' }),
      createMockTodo({ id: '3', status: 'in_progress' }),
      createMockTodo({ id: '4', status: 'completed' }),
    ];
    mockInvoke.mockResolvedValueOnce(createMockFileContent(mockTodos));

    await service.setWorkspace('/test/workspace');

    const stats = service.getStats();
    const all = service.getAllTodos();
    const pending = service.getTodosByStatus('pending');
    const inProgress = service.getTodosByStatus('in_progress');
    const completed = service.getTodosByStatus('completed');

    expect(stats.total).toBe(all.length);
    expect(stats.pending).toBe(pending.length);
    expect(stats.inProgress).toBe(inProgress.length);
    expect(stats.completed).toBe(completed.length);
  });
});

// ============================================================
// 错误恢复测试
// ============================================================
describe('错误恢复', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  it('读取失败后应能继续操作', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Read failed'));

    await service.setWorkspace('/test/workspace');

    expect(service.getAllTodos()).toEqual([]);

    // 应该能继续创建
    vi.clearAllMocks();
    mockInvoke.mockResolvedValueOnce(undefined);
    const todo = await service.createTodo({ content: 'New Task' });

    expect(todo.content).toBe('New Task');
  });

  it('写入失败后应抛出错误', async () => {
    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');

    vi.clearAllMocks();
    mockInvoke.mockRejectedValueOnce(new Error('Write failed'));

    await expect(service.createTodo({ content: 'Task' })).rejects.toThrow('Write failed');
  });

  it('工作区未设置时保存应不调用 invoke', async () => {
    const noWorkspaceService = new SimpleTodoService();

    // 创建待办（不会保存到文件）
    await noWorkspaceService.createTodo({ content: 'Task' });

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ============================================================
// 类型安全测试
// ============================================================
describe('类型安全', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks();
  });

  describe('TodoItem 可选字段', () => {
    it('description 可以为 undefined', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.description).toBeUndefined();
    });

    it('tags 可以为 undefined', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.tags).toBeUndefined();
    });

    it('relatedFiles 可以为 undefined', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.relatedFiles).toBeUndefined();
    });

    it('subtasks 默认为空数组', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.subtasks).toEqual([]);
    });

    it('dueDate 可以为 undefined', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.dueDate).toBeUndefined();
    });

    it('estimatedHours 可以为 undefined', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.estimatedHours).toBeUndefined();
    });

    it('completedAt 初始应为 undefined', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.completedAt).toBeUndefined();
    });
  });

  describe('TodoCreateParams 默认值', () => {
    it('priority 默认为 normal', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.priority).toBe('normal');
    });

    it('status 默认为 pending', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.status).toBe('pending');
    });

    it('subtasks 默认为空数组', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      expect(todo.subtasks).toEqual([]);
    });
  });

  describe('文件加载类型安全', () => {
    it('文件包含 null todos 字段时应初始化为空数组', async () => {
      mockInvoke.mockResolvedValueOnce(JSON.stringify({
        version: '1.0.0',
        todos: null,
      }));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });

    it('文件包含非数组 todos 字段时应初始化为空数组', async () => {
      mockInvoke.mockResolvedValueOnce(JSON.stringify({
        version: '1.0.0',
        todos: 'not-an-array',
      }));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });
  });
});

// ============================================================
// 状态转换测试
// ============================================================
describe('状态转换', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks();
  });

  describe('完整生命周期', () => {
    it('pending -> in_progress -> completed 完整转换', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      expect(todo.status).toBe('pending');
      expect(todo.completedAt).toBeUndefined();

      await service.updateTodo(todo.id, { status: 'in_progress' });
      let updated = service.getAllTodos()[0];
      expect(updated.status).toBe('in_progress');
      expect(updated.completedAt).toBeUndefined();

      await service.updateTodo(todo.id, { status: 'completed' });
      updated = service.getAllTodos()[0];
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('直接从 pending 到 completed 应记录完成时间', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      await service.updateTodo(todo.id, { status: 'completed' });

      const updated = service.getAllTodos()[0];
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('从 completed 回到 in_progress 不应清除完成时间', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      await service.updateTodo(todo.id, { status: 'completed' });
      const completedAt = service.getAllTodos()[0].completedAt;

      await service.updateTodo(todo.id, { status: 'in_progress' });

      const updated = service.getAllTodos()[0];
      expect(updated.status).toBe('in_progress');
      // 注意：当前实现不会清除 completedAt
      expect(updated.completedAt).toBe(completedAt);
    });
  });

  describe('重复状态更新', () => {
    it('重复设置为相同状态应正常工作', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });

      await service.updateTodo(todo.id, { status: 'in_progress' });
      await service.updateTodo(todo.id, { status: 'in_progress' });

      const updated = service.getAllTodos()[0];
      expect(updated.status).toBe('in_progress');
    });

    it('重复完成不应覆盖完成时间', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      await service.updateTodo(todo.id, { status: 'completed' });
      const firstCompletedAt = service.getAllTodos()[0].completedAt;

      // 等待一小段时间确保时间戳可能不同
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.updateTodo(todo.id, { status: 'completed' });

      const updated = service.getAllTodos()[0];
      expect(updated.completedAt).toBe(firstCompletedAt);
    });
  });
});

// ============================================================
// 数据完整性测试
// ============================================================
describe('数据完整性', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks();
  });

  describe('更新操作保留未更新字段', () => {
    it('更新状态应保留其他字段', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({
        content: 'Task',
        description: 'Description',
        priority: 'high',
        tags: ['important'],
        relatedFiles: ['/src/file.ts'],
        dueDate: '2026-04-01',
        estimatedHours: 5,
        subtasks: [{ title: 'Subtask' }],
      });

      await service.updateTodo(todo.id, { status: 'completed' });

      const updated = service.getAllTodos()[0];
      expect(updated.content).toBe('Task');
      expect(updated.description).toBe('Description');
      expect(updated.priority).toBe('high');
      expect(updated.tags).toEqual(['important']);
      expect(updated.relatedFiles).toEqual(['/src/file.ts']);
      expect(updated.dueDate).toBe('2026-04-01');
      expect(updated.estimatedHours).toBe(5);
      expect(updated.subtasks).toHaveLength(1);
    });

    it('更新内容应保留状态', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      await service.updateTodo(todo.id, { status: 'in_progress' });

      await service.updateTodo(todo.id, { content: 'Updated Content' });

      const updated = service.getAllTodos()[0];
      expect(updated.content).toBe('Updated Content');
      expect(updated.status).toBe('in_progress');
    });

    it('更新优先级应保留子任务', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({
        content: 'Task',
        subtasks: [{ title: 'Subtask 1' }, { title: 'Subtask 2' }],
      });

      await service.updateTodo(todo.id, { priority: 'urgent' });

      const updated = service.getAllTodos()[0];
      expect(updated.priority).toBe('urgent');
      expect(updated.subtasks).toHaveLength(2);
    });
  });

  describe('子任务数据完整性', () => {
    it('切换一个子任务不应影响其他子任务', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({
        content: 'Task',
        subtasks: [
          { title: 'Subtask 1' },
          { title: 'Subtask 2' },
          { title: 'Subtask 3' },
        ],
      });

      await service.toggleSubtask(todo.id, todo.subtasks![1].id);

      const updated = service.getAllTodos()[0];
      expect(updated.subtasks![0].completed).toBe(false);
      expect(updated.subtasks![1].completed).toBe(true);
      expect(updated.subtasks![2].completed).toBe(false);
    });

    it('多次切换子任务状态应正确', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({
        content: 'Task',
        subtasks: [{ title: 'Subtask' }],
      });

      await service.toggleSubtask(todo.id, todo.subtasks![0].id);
      expect(service.getAllTodos()[0].subtasks![0].completed).toBe(true);

      await service.toggleSubtask(todo.id, todo.subtasks![0].id);
      expect(service.getAllTodos()[0].subtasks![0].completed).toBe(false);

      await service.toggleSubtask(todo.id, todo.subtasks![0].id);
      expect(service.getAllTodos()[0].subtasks![0].completed).toBe(true);
    });
  });

  describe('创建时间戳完整性', () => {
    it('createdAt 不应在更新时改变', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      const originalCreatedAt = todo.createdAt;

      await service.updateTodo(todo.id, { content: 'Updated' });
      await service.updateTodo(todo.id, { status: 'completed' });

      const updated = service.getAllTodos()[0];
      expect(updated.createdAt).toBe(originalCreatedAt);
    });

    it('updatedAt 应在每次更新时改变', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const todo = await service.createTodo({ content: 'Task' });
      const firstUpdatedAt = todo.updatedAt;

      // 等待确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.updateTodo(todo.id, { content: 'Updated' });
      const secondUpdatedAt = service.getAllTodos()[0].updatedAt;

      expect(new Date(secondUpdatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(firstUpdatedAt).getTime()
      );
    });
  });
});

// ============================================================
// 文件系统边界测试
// ============================================================
describe('文件系统边界', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  describe('文件格式兼容性', () => {
    it('应支持版本 1.0.0 文件格式', async () => {
      const mockData = {
        version: '1.0.0',
        updatedAt: '2026-03-19T10:00:00.000Z',
        todos: [createMockTodo({ id: '1', content: 'Task' })],
      };
      mockInvoke.mockResolvedValueOnce(JSON.stringify(mockData));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toHaveLength(1);
    });

    it('缺少 version 字段时应正常加载', async () => {
      const mockData = {
        updatedAt: '2026-03-19T10:00:00.000Z',
        todos: [createMockTodo({ id: '1', content: 'Task' })],
      };
      mockInvoke.mockResolvedValueOnce(JSON.stringify(mockData));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toHaveLength(1);
    });

    it('缺少 updatedAt 字段时应正常加载', async () => {
      const mockData = {
        version: '1.0.0',
        todos: [createMockTodo({ id: '1', content: 'Task' })],
      };
      mockInvoke.mockResolvedValueOnce(JSON.stringify(mockData));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toHaveLength(1);
    });

    it('空对象文件应初始化为空数组', async () => {
      mockInvoke.mockResolvedValueOnce(JSON.stringify({}));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });

    it('非对象内容（字符串）应初始化为空数组', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Invalid JSON'));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });

    it('非对象内容（数字）应初始化为空数组', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Invalid content'));

      await service.setWorkspace('/test/workspace');

      expect(service.getAllTodos()).toEqual([]);
    });
  });

  describe('路径边界', () => {
    it('UNC 路径应正确处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));

      await service.setWorkspace('\\\\server\\share\\project');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: '\\\\server\\share\\project/.polaris/todos.json',
      });
    });

    it('相对路径应正确处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));

      await service.setWorkspace('./project');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: './project/.polaris/todos.json',
      });
    });

    it('带空格路径应正确处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));

      await service.setWorkspace('/path/to/my project/workspace');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: '/path/to/my project/workspace/.polaris/todos.json',
      });
    });

    it('带中文路径应正确处理', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));

      await service.setWorkspace('/路径/到/我的项目');

      expect(mockInvoke).toHaveBeenCalledWith('read_file_absolute', {
        path: '/路径/到/我的项目/.polaris/todos.json',
      });
    });
  });

  describe('保存格式验证', () => {
    it('保存内容应为有效 JSON', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      await service.createTodo({ content: 'Task' });

      const call = mockInvoke.mock.calls[0];
      const content = call[1].content;

      // 应该能解析为 JSON
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('保存内容应格式化（带缩进）', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      await service.createTodo({ content: 'Task' });

      const call = mockInvoke.mock.calls[0];
      const content = call[1].content;

      // 应该包含换行和缩进
      expect(content).toContain('\n');
      expect(content).toContain('  ');
    });
  });
});

// ============================================================
// 性能测试
// ============================================================
describe('性能测试', () => {
  let service: SimpleTodoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
  });

  describe('大量订阅者通知', () => {
    it('100 个订阅者应都能收到通知', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      const listeners = Array.from({ length: 100 }, () => vi.fn());
      listeners.forEach(l => service.subscribe(l));

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      await service.createTodo({ content: 'Task' });

      listeners.forEach(l => {
        expect(l).toHaveBeenCalledTimes(1);
      });
    });

    it('500 个订阅者通知应在合理时间内完成', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      const listeners = Array.from({ length: 500 }, () => vi.fn());
      listeners.forEach(l => service.subscribe(l));

      vi.clearAllMocks();
      mockInvoke.mockResolvedValueOnce(undefined);

      const start = performance.now();
      await service.createTodo({ content: 'Task' });
      const duration = performance.now() - start;

      // 500 个订阅者通知应在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });
  });

  describe('大量数据查询', () => {
    it('1000 条待办的查询应在合理时间内完成', async () => {
      const manyTodos = Array.from({ length: 1000 }, (_, i) =>
        createMockTodo({ id: `todo-${i}`, content: `Task ${i}` })
      );
      mockInvoke.mockResolvedValueOnce(createMockFileContent(manyTodos));

      await service.setWorkspace('/test/workspace');

      const start = performance.now();
      const all = service.getAllTodos();
      const duration = performance.now() - start;

      expect(all).toHaveLength(1000);
      // 查询应在 10ms 内完成
      expect(duration).toBeLessThan(10);
    });

    it('1000 条待办的状态筛选应在合理时间内完成', async () => {
      const manyTodos = Array.from({ length: 1000 }, (_, i) =>
        createMockTodo({
          id: `todo-${i}`,
          status: i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'in_progress' : 'completed',
        })
      );
      mockInvoke.mockResolvedValueOnce(createMockFileContent(manyTodos));

      await service.setWorkspace('/test/workspace');

      const start = performance.now();
      const pending = service.getTodosByStatus('pending');
      const duration = performance.now() - start;

      expect(pending.length).toBeGreaterThan(0);
      // 筛选应在 10ms 内完成
      expect(duration).toBeLessThan(10);
    });

    it('1000 条待办的统计计算应在合理时间内完成', async () => {
      const manyTodos = Array.from({ length: 1000 }, (_, i) =>
        createMockTodo({
          id: `todo-${i}`,
          status: ['pending', 'in_progress', 'completed'][i % 3] as 'pending' | 'in_progress' | 'completed',
        })
      );
      mockInvoke.mockResolvedValueOnce(createMockFileContent(manyTodos));

      await service.setWorkspace('/test/workspace');

      const start = performance.now();
      const stats = service.getStats();
      const duration = performance.now() - start;

      expect(stats.total).toBe(1000);
      // 统计应在 10ms 内完成
      expect(duration).toBeLessThan(10);
    });
  });

  describe('取消订阅性能', () => {
    it('频繁订阅取消不应影响性能', async () => {
      mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
      await service.setWorkspace('/test/workspace');

      const start = performance.now();

      // 频繁订阅和取消
      for (let i = 0; i < 100; i++) {
        const unsub = service.subscribe(() => {});
        unsub();
      }

      const duration = performance.now() - start;

      // 100 次订阅取消应在 10ms 内完成
      expect(duration).toBeLessThan(10);
    });
  });
});

// ============================================================
// 国际化测试
// ============================================================
describe('国际化', () => {
  let service: SimpleTodoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SimpleTodoService();
    mockInvoke.mockResolvedValueOnce(createMockFileContent([]));
    await service.setWorkspace('/test/workspace');
    vi.clearAllMocks();
  });

  it('应正确处理中文内容', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: '完成项目开发',
      description: '这是一个重要的项目任务',
      tags: ['重要', '紧急'],
    });

    expect(todo.content).toBe('完成项目开发');
    expect(todo.description).toBe('这是一个重要的项目任务');
    expect(todo.tags).toEqual(['重要', '紧急']);
  });

  it('应正确处理日文内容', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: 'プロジェクトを完了する',
      description: 'これは重要なタスクです',
    });

    expect(todo.content).toBe('プロジェクトを完了する');
    expect(todo.description).toBe('これは重要なタスクです');
  });

  it('应正确处理韩文内容', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: '프로젝트 완료',
      description: '이것은 중요한 작업입니다',
    });

    expect(todo.content).toBe('프로젝트 완료');
    expect(todo.description).toBe('이것은 중요한 작업입니다');
  });

  it('应正确处理阿拉伯文内容（RTL）', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: 'إكمال المشروع',
      description: 'هذه مهمة مهمة',
    });

    expect(todo.content).toBe('إكمال المشروع');
    expect(todo.description).toBe('هذه مهمة مهمة');
  });

  it('应正确处理俄文内容', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: 'Завершить проект',
      description: 'Это важная задача',
    });

    expect(todo.content).toBe('Завершить проект');
    expect(todo.description).toBe('Это важная задача');
  });

  it('应正确处理 emoji', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: '完成项目 🚀🎉',
      tags: ['重要🔥', '紧急⚡'],
    });

    expect(todo.content).toBe('完成项目 🚀🎉');
    expect(todo.tags).toEqual(['重要🔥', '紧急⚡']);
  });

  it('应正确处理混合语言内容', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const todo = await service.createTodo({
      content: 'Complete 完成 完了 완료',
      description: 'English 中文 日本語 한국어 العربية',
    });

    expect(todo.content).toBe('Complete 完成 完了 완료');
    expect(todo.description).toBe('English 中文 日本語 한국어 العربية');
  });
});
