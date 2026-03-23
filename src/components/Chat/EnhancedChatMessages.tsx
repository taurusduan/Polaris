/**
 * 增强版聊天消息列表组件 - 支持内容块架构
 *
 * 核心特性：
 * - Assistant 消息包含 blocks 数组
 * - 工具调用穿插在文本中间显示
 * - 支持流式更新内容块
 * - TodoWrite 专用渲染
 * - Grep 关键词高亮
 * - Bash ANSI 码清理
 * - Edit 工具优化显示
 */

import { useMemo, memo, useState, useCallback, useRef, useDeferredValue, useEffect } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { clsx } from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import type { ChatMessage, UserChatMessage, AssistantChatMessage, ContentBlock, TextBlock, ThinkingBlock, ToolCallBlock, QuestionBlock, PlanModeBlock, PlanStageBlock, AgentRunBlock } from '../../types';
import { useEventChatStore, useGitStore, useWorkspaceStore, useTabStore } from '../../stores';
import { getToolConfig, extractToolKeyInfo } from '../../utils/toolConfig';
import { markdownCache } from '../../utils/cache';
import { useThrottle } from '../../hooks/useThrottle';
import {
  formatDuration,
  calculateDuration,
  generateOutputSummary,
  parseGrepMatches,
  stripAnsiCodes,
  escapeRegExp,
  type GrepMatch,
  type GrepOutputData
} from '../../utils/toolSummary';
import { Check, XCircle, Loader2, AlertTriangle, Play, ChevronDown, ChevronRight, Circle, FileSearch, FolderOpen, Code, FileDiff, RotateCcw, Copy, GitPullRequest, Brain, HelpCircle, CheckCircle, ClipboardList, ThumbsUp, ThumbsDown, X, Clock, ListChecks } from 'lucide-react';
import { ChatNavigator } from './ChatNavigator';
import { groupConversationRounds } from '../../utils/conversationRounds';
import { splitMarkdownWithMermaid } from '../../utils/markdown';
import { MermaidDiagram } from './MermaidDiagram';
import { DiffViewer } from '../Diff/DiffViewer';
import { isEditTool } from '../../utils/diffExtractor';
import { Button } from '../Common/Button';
import { calculateRenderMode, type MessageRenderMode, DEFAULT_LAYER_CONFIG } from '../../utils/messageLayer';

/** Markdown 渲染器（使用缓存优化） */
function formatContent(content: string): string {
  return markdownCache.render(content);
}

/** 用户消息组件 */
const UserBubble = memo(function UserBubble({ message }: { message: UserChatMessage }) {
  return (
    <div className="flex justify-end my-2">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl
                  bg-gradient-to-br from-primary to-primary-600
                  text-white shadow-glow">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
});

/** 文本内容块组件（支持 Mermaid 渲染 + 代码高亮）
 *
 * 性能优化策略：
 * 1. 流式输出时使用节流（而非防抖），确保固定间隔渲染，提供更好的实时性
 * 2. 流式阶段显示简化版内容（纯文本），避免复杂 markdown 渲染
 * 3. 使用 useDeferredValue 降低渲染优先级，保持 UI 响应
 * 4. 流式结束后显示完整渲染结果
 * 5. 分层渲染：preview/archive 模式使用简化渲染
 */
const TextBlockRenderer = memo(function TextBlockRenderer({
  block,
  isStreaming = false,
  renderMode = 'full'
}: {
  block: TextBlock;
  isStreaming?: boolean;
  renderMode?: MessageRenderMode;
}) {
  // 流式输出时使用节流（200ms 间隔），确保固定频率渲染
  // 节流比防抖更适合流式场景：用户能看到内容持续更新，而不是等待结束后才显示
  const throttledContent = useThrottle(block.content, isStreaming ? 200 : 0);

  // 使用 useDeferredValue 延迟渲染复杂内容，保持 UI 响应
  const deferredContent = useDeferredValue(throttledContent);

  // 流式阶段使用节流内容，非流式使用原始内容
  const contentToRender = isStreaming ? deferredContent : block.content;

  // 非流式阶段：完整渲染（useMemo 必须在条件判断之前调用，遵守 React Hooks 规则）
  const parts = useMemo(() => splitMarkdownWithMermaid(block.content), [block.content]);

  // 流式阶段：显示简化版内容（纯文本），避免复杂渲染
  // 性能关键：直接返回，不执行任何 markdown 解析或正则处理
  if (isStreaming) {
    return (
      <div className="prose prose-invert prose-sm max-w-none">
        <StreamingTextContent content={contentToRender} />
      </div>
    );
  }

  // 归档模式：仅显示摘要（截取前 200 字符）
  if (renderMode === 'archive') {
    const summaryContent = block.content.length > 200
      ? block.content.slice(0, 200) + '...'
      : block.content;
    return (
      <div className="prose prose-invert prose-sm max-w-none text-text-secondary">
        <span className="whitespace-pre-wrap">{summaryContent}</span>
      </div>
    );
  }

  // 预览模式：简化渲染（不渲染 Mermaid，不渲染复杂代码高亮）
  if (renderMode === 'preview') {
    return (
      <div className="prose prose-invert prose-sm max-w-none">
        <PreviewTextContent content={block.content} />
      </div>
    );
  }

  // 完整模式：完整渲染
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {parts.map((part, partIndex) => {
        if (part.type === 'text') {
          return <TextPartRenderer key={`text-${partIndex}`} content={part.content} />;
        } else {
          return (
            <MermaidDiagram
              key={`mermaid-${partIndex}`}
              code={part.content}
              id={part.id || `mermaid-${partIndex}`}
            />
          );
        }
      })}
    </div>
  );
});

/**
 * 预览模式文本渲染器 - 简化版，避免 Mermaid 和复杂代码高亮
 */
const PreviewTextContent = memo(function PreviewTextContent({ content }: { content: string }) {
  const formattedHTML = useMemo(() => formatContent(content), [content]);

  return (
    <div
      className="break-words"
      dangerouslySetInnerHTML={{ __html: formattedHTML }}
    />
  );
});

/**
 * 流式文本内容渲染器 - 极简版，最大化性能
 * 
 * 优化策略：
 * 1. 单节点渲染：不按行分割，直接渲染整个文本
 * 2. 使用 CSS white-space: pre-wrap 保持换行格式
 * 3. 仅做最小化的代码块标识符高亮
 * 4. 避免所有不必要的 useMemo/map 操作
 * 
 * 性能关键（2026-03-09 更新）：
 * - 不使用正则表达式（正则在长文本上性能差）
 * - 使用 lastIndexOf 从末尾搜索代码块标记（O(n) 但从末尾开始，流式场景更高效）
 * - 限制处理范围：只处理最后 2000 字符中的代码块标记
 * - 避免对整个长文本进行多次遍历
 */
const StreamingTextContent = memo(function StreamingTextContent({ content }: { content: string }) {
  // 如果内容为空，不渲染任何内容（避免与底部流式光标重复显示）
  if (!content) {
    return null;
  }

  // 性能优化：对于长文本，只处理最后 2000 字符
  // 因为流式输出中，代码块标记通常出现在最新内容中
  const SEARCH_WINDOW = 2000;
  const searchStart = Math.max(0, content.length - SEARCH_WINDOW);
  const searchRegion = content.slice(searchStart);
  
  // 快速检测：从末尾搜索代码块标记
  const lastCodeBlockInRegion = searchRegion.lastIndexOf('```');
  
  // 如果搜索区域内没有代码块标记，直接渲染纯文本（最快路径）
  if (lastCodeBlockInRegion === -1) {
    return (
      <span className="whitespace-pre-wrap break-words">
        {content}
      </span>
    );
  }

  // 将区域内的相对位置转换为全局位置
  const firstCodeBlock = searchStart + lastCodeBlockInRegion;

  // 构建渲染结果
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;
  const MAX_PARTS = 10; // 减少最大片段数，避免创建过多节点

  // 添加代码块标记之前的所有文本（作为一个整体）
  if (firstCodeBlock > 0) {
    parts.push(
      <span key={`text-${keyIndex++}`}>
        {content.slice(0, firstCodeBlock)}
      </span>
    );
  }

  // 处理代码块标记
  let remaining = content.slice(firstCodeBlock);
  
  while (remaining.length > 0 && keyIndex < MAX_PARTS) {
    const idx = remaining.indexOf('```');
    
    if (idx === -1) {
      parts.push(
        <span key={`text-${keyIndex++}`}>
          {remaining}
        </span>
      );
      break;
    }

    // 添加代码块标记之前的普通文本
    if (idx > 0) {
      parts.push(
        <span key={`text-${keyIndex++}`}>
          {remaining.slice(0, idx)}
        </span>
      );
    }

    // 找到代码块标记的结束位置（到下一个换行或行尾）
    let endOfMarker = 3;
    const afterMarker = remaining.slice(idx + 3);
    
    // 查找语言标识符结束位置
    for (let i = 0; i < afterMarker.length && i < 30; i++) {
      const char = afterMarker[i];
      if (char === '\n' || char === '\r') {
        endOfMarker = 3 + i + 1;
        break;
      }
      if (!/[a-zA-Z0-9_+-]/.test(char)) {
        endOfMarker = 3 + i;
        break;
      }
      endOfMarker = 3 + i + 1;
    }

    // 添加代码块标记（带样式）
    const marker = remaining.slice(idx, idx + endOfMarker);
    parts.push(
      <span key={`code-${keyIndex++}`} className="text-text-muted font-mono text-xs">
        {marker}
      </span>
    );

    remaining = remaining.slice(idx + endOfMarker);
  }

  // 添加剩余内容
  if (remaining.length > 0) {
    parts.push(
      <span key={`text-remaining`}>
        {remaining}
      </span>
    );
  }

  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
});

/**
 * 文本部分渲染器（支持代码高亮）
 */
const TextPartRenderer = memo(function TextPartRenderer({
  content
}: {
  content: string;
}) {
  const formattedHTML = useMemo(() => formatContent(content), [content]);

  return (
    <div
      className="break-words"
      dangerouslySetInnerHTML={{ __html: formattedHTML }}
    />
  );
});

/**
 * 状态图标配置
 */
const STATUS_CONFIG = {
  pending: { icon: Loader2, className: 'animate-spin text-yellow-500', labelKey: 'status.pending' },
  running: { icon: Play, className: 'text-blue-500 animate-pulse', labelKey: 'status.running' },
  completed: { icon: Check, className: 'text-green-500', labelKey: 'status.completed' },
  failed: { icon: XCircle, className: 'text-red-500', labelKey: 'status.failed' },
  partial: { icon: AlertTriangle, className: 'text-orange-500', labelKey: 'status.partial' },
} as const;

// ========================================
// Grep 输出渲染器
// ========================================

/**
 * 高亮文本组件 - 用于 Grep 结果
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  try {
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-500/30 text-text-primary px-0.5 rounded font-medium">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

/**
 * Grep 匹配项组件
 */
const GrepMatchItem = memo(function GrepMatchItem({
  match,
  query
}: {
  match: GrepMatch;
  query: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded bg-background-surface hover:bg-background-hover transition-colors">
      {/* 文件名 */}
      {match.file && (
        <div className="text-xs text-primary font-mono shrink-0">
          {match.file.split('/').pop() || match.file}
        </div>
      )}
      {/* 行号 */}
      {match.line > 0 && (
        <div className="text-xs text-text-muted font-mono shrink-0 w-8">
          :{match.line}
        </div>
      )}
      {/* 内容 */}
      <div className="flex-1 text-xs text-text-secondary font-mono break-all">
        <HighlightedText text={match.content} query={query} />
      </div>
    </div>
  );
});

/**
 * Grep 输出渲染器
 */
const GrepOutputRenderer = memo(function GrepOutputRenderer({
  data
}: {
  data: GrepOutputData;
}) {
  const { t } = useTranslation('chat');
  
  return (
    <div className="space-y-2">
      {/* 匹配项列表 */}
      <div className="space-y-0.5">
        {data.matches.slice(0, 20).map((match, idx) => (
          <GrepMatchItem key={idx} match={match} query={data.query} />
        ))}
      </div>
      {/* 超过20个提示 */}
      {data.total > 20 && (
        <div className="text-xs text-text-tertiary text-center py-1">
          {t('tool.moreMatches', { count: data.total - 20 })}
        </div>
      )}
    </div>
  );
});

// ========================================
// TodoWrite 渲染器
// ========================================

/**
 * TodoWrite 相关类型定义
 */
interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

interface TodoInputData {
  todos: TodoItem[];
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

/**
 * 判断是否为 TodoWrite 工具
 */
function isTodoWriteTool(block: ToolCallBlock): boolean {
  return block.name.toLowerCase() === 'todowrite';
}

/**
 * 判断是否为 Grep 工具
 */
function isGrepTool(block: ToolCallBlock): boolean {
  return block.name.toLowerCase().includes('grep');
}

/**
 * 解析 TodoWrite 输入数据
 */
function parseTodoInput(input: Record<string, unknown> | undefined): TodoInputData | null {
  if (!input) return null;
  const todos = input.todos as TodoItem[];
  if (!Array.isArray(todos)) return null;

  return {
    todos,
    total: todos.length,
    completed: todos.filter(t => t.status === 'completed').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    pending: todos.filter(t => t.status === 'pending').length,
  };
}

/**
 * TodoWrite 任务状态配置
 */
const TODO_STATUS_CONFIG = {
  completed: { icon: Check, color: 'text-green-500', bg: 'bg-green-500/10', labelKey: 'status.completed' },
  in_progress: { icon: Loader2, color: 'text-violet-500', bg: 'bg-violet-500/10', labelKey: 'status.running' },
  pending: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-500/10', labelKey: 'status.pending' },
} as const;

/**
 * TodoWrite 任务项组件
 */
const TodoItem = memo(function TodoItem({
  todo,
  index
}: {
  todo: TodoItem;
  index: number;
}) {
  const { t } = useTranslation('chat');
  const statusConfig = TODO_STATUS_CONFIG[todo.status] || TODO_STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex items-start gap-2 p-2 rounded bg-background-surface hover:bg-background-hover transition-colors">
      <div className={clsx('p-1 rounded', statusConfig.bg)}>
        <StatusIcon className={clsx('w-3.5 h-3.5', statusConfig.color,
          todo.status === 'in_progress' && 'animate-spin'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">{todo.content}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={clsx('text-xs', statusConfig.color)}>{t(statusConfig.labelKey)}</span>
          <span className="text-xs text-text-muted">#{index + 1}</span>
        </div>
      </div>
    </div>
  );
});

/**
 * TodoWrite 输入渲染器 - 展开状态
 */
const TodoWriteInputRenderer = memo(function TodoWriteInputRenderer({
  data
}: {
  data: TodoInputData;
}) {
  const percent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-background-base rounded-full h-2 overflow-hidden">
          <div
            className="bg-violet-500 h-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-text-tertiary">
          {data.completed}/{data.total} ({percent}%)
        </span>
      </div>

      {/* 任务列表 */}
      <div className="space-y-1">
        {data.todos.map((todo, index) => (
          <TodoItem key={index} todo={todo} index={index} />
        ))}
      </div>
    </div>
  );
});

/**
 * TodoWrite 任务状态图标（用于折叠状态）
 */
function getTodoStatusIcon(status: TodoItem['status']): React.ReactElement {
  const config = TODO_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Icon className={clsx('w-3 h-3', config.color,
      status === 'in_progress' && 'animate-spin'
    )} />
  );
}

// ========================================
// 思考过程块渲染器
// ========================================

/** 思考过程块组件 - 可折叠展示 */
const ThinkingBlockRenderer = memo(function ThinkingBlockRenderer({ block }: { block: ThinkingBlock }) {
  const [isCollapsed, setIsCollapsed] = useState(block.collapsed ?? true);

  return (
    <div className="my-2 rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden">
      {/* 头部 - 可点击折叠 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
      >
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-text-secondary">思考过程</span>
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-text-muted ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted ml-auto" />
        )}
      </button>

      {/* 内容 - 折叠时隐藏 */}
      {!isCollapsed && (
        <div className="px-3 py-2 border-t border-border-subtle">
          <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {block.content}
          </div>
        </div>
      )}
    </div>
  );
});

// ========================================
// 工具调用块渲染器
// ========================================

/** 工具调用块组件 - 优化版本 */
const ToolCallBlockRenderer = memo(function ToolCallBlockRenderer({ block }: { block: ToolCallBlock }) {
  const { t } = useTranslation('chat');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [showToolDetails, setShowToolDetails] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // 获取 Store
  const gitStore = useGitStore();
  const workspaceStore = useWorkspaceStore();
  const tabStore = useTabStore();

  // 获取工具配置
  const toolConfig = useMemo(() => getToolConfig(block.name), [block.name]);

  // 状态图标
  const statusConfig = STATUS_CONFIG[block.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  // 计算耗时
  const duration = useMemo(() => {
    if (block.duration) return formatDuration(block.duration);
    const calculated = calculateDuration(block.startedAt, block.completedAt);
    return calculated ? formatDuration(calculated) : '';
  }, [block.duration, block.startedAt, block.completedAt]);

  // 提取关键信息
  const keyInfo = useMemo(() => extractToolKeyInfo(block.name, block.input), [block.name, block.input]);

  // 生成输出摘要
  const outputSummary = useMemo(() => {
    if (block.status === 'completed' && block.output) {
      return generateOutputSummary(block.name, block.output, block.status, block.input);
    }
    return null;
  }, [block.name, block.output, block.status, block.input]);

  // Edit 工具的简化输出提示
  const editOutputSummary = useMemo(() => {
    if (!isEditTool(block.name) || block.status !== 'completed') {
      return null;
    }

    if (block.output) {
      const output = block.output.toLowerCase();
      // 成功
      if (output.includes('has been updated') ||
          output.includes('successfully edited') ||
          output.includes('edited successfully')) {
        return {
          type: 'success',
          text: t('tool.fileUpdated')
        };
      }
      // 失败
      if (output.includes('failed') ||
          output.includes('error') ||
          output.includes('could not')) {
        return {
          type: 'error',
          text: t('tool.fileUpdateFailed')
        };
      }
    }

    return null;
  }, [block.name, block.status, block.output, block.error]);

  // 解析 TodoWrite 数据
  const todoData = useMemo(() => {
    if (isTodoWriteTool(block)) {
      return parseTodoInput(block.input);
    }
    return null;
  }, [block]);

  // 解析 Grep 数据
  const grepData = useMemo(() => {
    if (isGrepTool(block) && block.output) {
      return parseGrepMatches(block.output, block.input);
    }
    return null;
  }, [block]);

  // 判断输出是否需要展开功能（修复：基于实际长度而非 outputSummary）
  const outputNeedsExpand = (block.output?.length ?? 0) > 1000;

  // 格式化输入参数（非 TodoWrite 工具使用）
  const formatInput = (input: Record<string, unknown>): string => {
    const entries = Object.entries(input);
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  // 工具图标组件
  const ToolIcon = toolConfig.icon;

  // 是否可展开（有输入参数或有输出）
  const hasInput = block.input && Object.keys(block.input).length > 0;
  const hasOutput = block.output && block.output.length > 0;
  const hasError = block.status === 'failed' && block.error;
  const canExpand = hasInput || hasOutput || hasError;

  // 是否显示 Diff 按钮（Edit 工具且有 Diff 数据）
  const showDiffButton = useMemo(() => {
    const isEdit = isEditTool(block.name);
    const isCompleted = block.status === 'completed';
    const hasDiff = !!block.diffData;

    return isEdit && isCompleted && hasDiff;
  }, [block.name, block.status, block.diffData]);

  // 撤销操作处理 - 多级撤销策略
  const handleUndo = useCallback(async () => {
    if (!block.diffData) return;

    const workspace = workspaceStore.getCurrentWorkspace();
    if (!workspace || !workspace.path) {
      console.error('[ToolCallBlock] 无法获取当前工作区');
      return;
    }

    setIsUndoing(true);
    try {
      // Level 1: 使用 fullOldContent（精确撤销）
      if (block.diffData.fullOldContent && block.diffData.fullOldContent.length > 0) {
        await invoke('write_file_absolute', {
          path: block.diffData.filePath,
          content: block.diffData.fullOldContent
        });

        await gitStore.refreshStatus(workspace.path);

        console.log('[ToolCallBlock] 撤销成功（Level 1: fullOldContent）', {
          filePath: block.diffData.filePath,
          contentLength: block.diffData.fullOldContent.length,
        });
        return;
      }

      // Level 2: 使用 Git discard（降级方案）
      console.warn('[ToolCallBlock] 使用降级方案：Git discard');

      // 将绝对路径转换为相对路径
      let relativePath = block.diffData.filePath;
      if (relativePath.startsWith(workspace.path)) {
        relativePath = relativePath.substring(workspace.path.length);
        if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
          relativePath = relativePath.substring(1);
        }
        relativePath = relativePath.replace(/\\/g, '/');
      }

      await gitStore.discardChanges(workspace.path, relativePath);

      console.log('[ToolCallBlock] 撤销成功（Level 2: Git discard）', {
        filePath: block.diffData.filePath,
        relativePath,
      });
    } catch (err) {
      console.error('[ToolCallBlock] 撤销失败:', err);

      // 显示用户友好的错误提示
      if (err instanceof Error) {
        const errorMsg = err.message || '未知错误';
        console.error(`[ToolCallBlock] 错误详情: ${errorMsg}`);
      }
    } finally {
      setIsUndoing(false);
    }
  }, [block.diffData, gitStore, workspaceStore]);

  // 复制文件路径
  const handleCopyPath = useCallback(() => {
    if (!block.diffData) return;
    navigator.clipboard.writeText(block.diffData.filePath);
  }, [block.diffData]);

  // 在 Git 面板查看
  const handleOpenInGitPanel = useCallback(async () => {
    if (!block.diffData) return;

    const workspace = workspaceStore.getCurrentWorkspace();
    if (!workspace || !workspace.path) return;

    // 将绝对路径转换为相对路径
    let relativePath = block.diffData.filePath;
    if (relativePath.startsWith(workspace.path)) {
      relativePath = relativePath.substring(workspace.path.length);
      if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        relativePath = relativePath.substring(1);
      }
      relativePath = relativePath.replace(/\\/g, '/');
    }

    try {
      const diff = await gitStore.getWorktreeFileDiff(
        workspace.path,
        relativePath
      );
      tabStore.openDiffTab(diff);
    } catch (err) {
      console.error('[ToolCallBlock] 打开 Diff 失败:', err);
    }
  }, [block.diffData, gitStore, workspaceStore, tabStore]);

  // 是否使用专用输出渲染器
  const useCustomRenderer = grepData !== null;

  // 状态动画类
  const statusAnimationClass = useMemo(() => {
    switch (block.status) {
      case 'pending':
        return 'animate-pulse border-dashed';
      case 'running':
        return 'animate-pulse';
      case 'completed':
        return '';
      case 'failed':
        return 'animate-shake-once';
      case 'partial':
        return '';
      default:
        return '';
    }
  }, [block.status]);

  // Bash 工具需要清理 ANSI 码
  const displayOutput = useMemo(() => {
    if (!block.output) return '';
    const normalizedToolName = block.name.toLowerCase();
    if (
      normalizedToolName.includes('bash') ||
      normalizedToolName.includes('command') ||
      normalizedToolName.includes('execute')
    ) {
      return stripAnsiCodes(block.output);
    }
    return block.output;
  }, [block.name, block.output]);

  return (
    <div
      className={clsx(
        'my-2 rounded-lg overflow-hidden w-full transition-all duration-200',
        'border border-border',
        'bg-background-surface',
        statusAnimationClass
      )}
    >
      {/* 工具调用头部 - 左侧色条 */}
      <div
        className={clsx(
          'flex items-center gap-3 px-3 py-2',
          canExpand ? 'cursor-pointer hover:bg-background-hover' : 'cursor-default',
          'border-l-4',
          toolConfig.borderColor
        )}
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
      >
        {/* 工具类型图标 */}
        <div className={clsx('p-1.5 rounded-md', toolConfig.bgColor)}>
          <ToolIcon className={clsx('w-4 h-4', toolConfig.color)} />
        </div>

        {/* 操作描述 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">
              {block.status === 'running' ? t('tool.running') : t('tool.completed')}{toolConfig.label}
            </span>
            {keyInfo && (
              <span className={clsx('font-medium truncate', toolConfig.color)}>
                {keyInfo}
              </span>
            )}
          </div>
          {/* 输出摘要（折叠时显示） */}
          {!isExpanded && outputSummary && (
            <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
              {isGrepTool(block) && grepData ? (
                <>
                  <FileSearch className="w-3 h-3 shrink-0" />
                  <span>{outputSummary.summary}</span>
                </>
              ) : (
                <span>{outputSummary.summary}</span>
              )}
              {(outputSummary.expandable || outputNeedsExpand) && (
                <ChevronRight className="w-3 h-3 shrink-0" />
              )}
            </div>
          )}
          {/* TodoWrite 任务预览（折叠时显示前2个任务） */}
          {!isExpanded && todoData && todoData.total > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {todoData.todos.slice(0, 2).map((todo, idx) => (
                <div key={idx} className="text-xs text-text-tertiary flex items-center gap-1.5">
                  {getTodoStatusIcon(todo.status)}
                  <span className="truncate">{todo.content}</span>
                </div>
              ))}
              {todoData.total > 2 && (
                <div className="text-xs text-text-muted">
                  {t('tool.moreTasks', { count: todoData.total - 2 })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 状态与耗时 */}
        <div className="flex items-center gap-2 shrink-0">
          {duration && (
            <span className="text-xs text-text-tertiary">{duration}</span>
          )}
          <StatusIcon className={clsx('w-4 h-4', statusConfig.className)} />
        </div>

        {/* 展开/收起图标 */}
        {canExpand && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-text-muted transition-transform shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        )}
      </div>

      {/* 可展开的详情 */}
      {isExpanded && (
        <div className="px-4 py-3 bg-background-subtle border-t border-border">
          {/* 工具名称和时间 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-muted font-mono">{block.name}</span>
            <div className="text-xs text-text-tertiary flex gap-3">
              <span>{t('tool.startTime', { time: new Date(block.startedAt).toLocaleTimeString('zh-CN') })}</span>
              {block.completedAt && (
                <span>{t('tool.endTime', { time: new Date(block.completedAt).toLocaleTimeString('zh-CN') })}</span>
              )}
            </div>
          </div>

          {/* Edit 工具：直接显示 Diff */}
          {showDiffButton && block.diffData && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-2 flex items-center gap-1.5">
                <FileDiff className="w-3 h-3" />
                {t('tool.fileDiff')}
              </div>
              <DiffViewer
                oldContent={block.diffData.oldContent}
                newContent={block.diffData.newContent}
                changeType="modified"
                showStatusHint={false}
                maxHeight="300px"
              />
            </div>
          )}

          {/* Edit 工具：操作按钮组 */}
          {showDiffButton && block.diffData && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="danger"
                onClick={handleUndo}
                disabled={isUndoing}
              >
                {isUndoing ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    {t('tool.undoing')}
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {t('tool.undo')}
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyPath}
              >
                <Copy className="w-3 h-3 mr-1" />
                {t('tool.copyPath')}
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={handleOpenInGitPanel}
              >
                <GitPullRequest className="w-3 h-3 mr-1" />
                {t('tool.viewInGitPanel')}
              </Button>
            </div>
          )}

          {/* 非Edit工具或无Diff：显示输入参数 */}
          {!showDiffButton && hasInput && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {todoData ? t('tool.taskList') : t('tool.inputParams')}
              </div>
              {todoData ? (
                <TodoWriteInputRenderer data={todoData} />
              ) : (
                <pre className="text-xs text-text-secondary bg-background-surface rounded p-2.5 max-w-full overflow-x-auto font-mono">
                  {formatInput(block.input)}
                </pre>
              )}
            </div>
          )}

          {/* Edit 工具：简化输出提示 */}
          {editOutputSummary && (
            <div className="mb-3">
              <div className={clsx(
                'text-xs flex items-center gap-1.5',
                editOutputSummary.type === 'success' ? 'text-success' : 'text-error'
              )}>
                {editOutputSummary.type === 'success' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {editOutputSummary.text}
              </div>
            </div>
          )}

          {/* 非Edit工具：完整输出结果 */}
          {!isEditTool(block.name) && hasOutput && (
            <div className="mb-3">
              <div className="text-xs text-text-muted mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('tool.outputResult')}
                {outputNeedsExpand && !useCustomRenderer && (
                  <button
                    onClick={() => setShowFullOutput(!showFullOutput)}
                    className="ml-auto text-primary hover:text-primary-hover text-xs"
                  >
                    {showFullOutput ? t('tool.collapse') : t('tool.expandAll')}
                  </button>
                )}
              </div>
              {useCustomRenderer && grepData ? (
                <GrepOutputRenderer data={grepData} />
              ) : (
                <pre className={clsx(
                  'text-xs text-text-secondary bg-background-surface rounded p-2.5 overflow-x-auto font-mono',
                  showFullOutput ? 'max-h-96 overflow-y-auto' : 'max-h-48 overflow-y-auto'
                )}>
                  {showFullOutput
                    ? displayOutput
                    : (displayOutput.length > 1000
                      ? displayOutput.slice(0, 1000) + '\n... (' + t('tool.outputTruncated') + ')'
                      : displayOutput)}
                </pre>
              )}
            </div>
          )}

          {/* Edit 工具：工具详情折叠区域 */}
          {isEditTool(block.name) && (hasInput || hasOutput) && (
            <div className="mb-3">
              <div
                onClick={() => setShowToolDetails(!showToolDetails)}
                className="text-xs text-text-tertiary hover:text-text-primary cursor-pointer flex items-center gap-1 select-none"
              >
                <ChevronRight
                  className={clsx(
                    'w-3 h-3 transition-transform',
                    showToolDetails && 'rotate-90'
                  )}
                />
                {t('tool.toolDetails')}
              </div>
              {showToolDetails && (
                <div className="mt-2 space-y-2">
                  {hasInput && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">{t('tool.inputParams')}</div>
                      <pre className="text-xs text-text-secondary bg-background-surface rounded p-2.5 overflow-x-auto font-mono">
                        {formatInput(block.input)}
                      </pre>
                    </div>
                  )}
                  {hasOutput && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">{t('tool.outputResult')}</div>
                      <pre className="text-xs text-text-secondary bg-background-surface rounded p-2.5 overflow-x-auto font-mono max-h-48 overflow-y-auto">
                        {displayOutput}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 错误信息 */}
          {hasError && (
            <div className="mb-3">
              <div className="text-xs text-error mb-1.5 flex items-center gap-1.5">
                <XCircle className="w-3 h-3" />
                {t('tool.errorInfo')}
              </div>
              <pre className="text-xs text-error bg-error-faint rounded p-2.5 overflow-x-auto font-mono">
                {block.error}
              </pre>
            </div>
          )}

          {/* 状态标签 */}
          <div className="flex items-center gap-2">
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              toolConfig.bgColor,
              toolConfig.color
            )}>
              {t(statusConfig.labelKey)}
            </span>
            {duration && (
              <span className="text-xs text-text-tertiary">
                {t('tool.duration', { duration })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/** 内容块渲染器 */
function renderContentBlock(
  block: ContentBlock,
  isStreaming?: boolean,
  renderMode: MessageRenderMode = 'full'
): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <TextBlockRenderer key={`text-${block.content.slice(0, 20)}`} block={block} isStreaming={isStreaming} renderMode={renderMode} />;
    case 'thinking':
      // 归档模式下不渲染思考块
      if (renderMode === 'archive') return null;
      return <ThinkingBlockRenderer key={`thinking-${block.content.slice(0, 20)}`} block={block} />;
    case 'tool_call':
      // 归档模式下使用简化工具渲染
      if (renderMode === 'archive') {
        return <SimplifiedToolCallRenderer key={block.id} block={block} />;
      }
      return <ToolCallBlockRenderer key={block.id} block={block} />;
    case 'question':
      // 归档模式下使用简化问题渲染
      if (renderMode === 'archive') {
        return <SimplifiedQuestionRenderer key={block.id} block={block} />;
      }
      return <QuestionBlockRenderer key={block.id} block={block} />;
    case 'plan_mode':
      // 归档模式下使用简化计划渲染
      if (renderMode === 'archive') {
        return <SimplifiedPlanModeRenderer key={block.id} block={block} />;
      }
      return <PlanModeBlockRenderer key={block.id} block={block} />;
    case 'agent_run':
      // 归档模式下使用简化 Agent 渲染
      if (renderMode === 'archive') {
        return <SimplifiedAgentRunRenderer key={block.id} block={block} />;
      }
      return <AgentRunBlockRenderer key={block.id} block={block} />;
    default:
      return null;
  }
}

/**
 * 简化版工具调用渲染器 - 用于归档层
 */
const SimplifiedToolCallRenderer = memo(function SimplifiedToolCallRenderer({ block }: { block: ToolCallBlock }) {
  const toolConfig = getToolConfig(block.name);
  const ToolIcon = toolConfig.icon;

  return (
    <div className="my-1 flex items-center gap-2 text-xs text-text-tertiary">
      <ToolIcon className={clsx('w-3 h-3', toolConfig.color)} />
      <span>{toolConfig.label}</span>
      {block.status === 'completed' ? (
        <Check className="w-3 h-3 text-success" />
      ) : block.status === 'failed' ? (
        <XCircle className="w-3 h-3 text-error" />
      ) : null}
    </div>
  );
});

// ========================================
// 问题块渲染器
// ========================================

/** 问题块组件 - 用于 AskUserQuestion 工具 */
const QuestionBlockRenderer = memo(function QuestionBlockRenderer({ block }: { block: QuestionBlock }) {
  const { t } = useTranslation('chat');
  const [selectedOptions, setSelectedOptions] = useState<string[]>(block.answer?.selected || []);
  const [customInput, setCustomInput] = useState(block.answer?.customInput || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 键盘导航状态
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const conversationId = useEventChatStore(state => state.conversationId);
  const continueChat = useEventChatStore(state => state.continueChat);

  // 是否已回答
  const isAnswered = block.status === 'answered';
  const answer = block.answer;

  // 当前显示的选项
  const allOptions = block.options;
  const displayOptions = block.options.slice(0, 5);
  const hasMoreOptions = block.options.length > 5;
  const [showAllOptions, setShowAllOptions] = useState(false);
  const visibleOptions = showAllOptions ? allOptions : displayOptions;

  // 处理选项选择
  const handleOptionSelect = useCallback((value: string) => {
    if (isAnswered || isSubmitting) return;

    if (block.multiSelect) {
      setSelectedOptions(prev =>
        prev.includes(value)
          ? prev.filter(v => v !== value)
          : [...prev, value]
      );
    } else {
      setSelectedOptions([value]);
    }
  }, [block.multiSelect, isAnswered, isSubmitting]);

  // 构建答案 prompt 格式
  const buildAnswerPrompt = useCallback((answerData: { selected: string[]; customInput?: string }): string => {
    const parts: string[] = [`[交互回答] 问题: "${block.header}"`];

    if (answerData.selected.length > 0) {
      const selectedLabels = answerData.selected.map(value => {
        const option = block.options.find(o => o.value === value);
        return option?.label || value;
      });
      parts.push(`选择的选项: ${selectedLabels.join(', ')}`);
    }

    if (answerData.customInput) {
      parts.push(`自定义输入: ${answerData.customInput}`);
    }

    return parts.join('\n');
  }, [block.header, block.options]);

  // 提交答案
  const handleSubmit = useCallback(async () => {
    if (isAnswered || isSubmitting) return;
    if (selectedOptions.length === 0 && !customInput.trim()) return;

    setIsSubmitting(true);
    try {
      const answer = {
        selected: selectedOptions,
        customInput: customInput.trim() || undefined,
      };

      // 1. 调用后端命令提交答案，更新状态
      await invoke('answer_question', {
        sessionId: conversationId,
        callId: block.id,
        answer,
      });

      // 2. 构建答案 prompt 并发送给 CLI
      const answerPrompt = buildAnswerPrompt(answer);

      // 3. 调用 continueChat 将答案发送给 CLI
      if (conversationId) {
        await continueChat(answerPrompt);
      }
    } catch (error) {
      console.error('[QuestionBlock] 提交答案失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isAnswered, isSubmitting, selectedOptions, customInput, conversationId, block.id, buildAnswerPrompt, continueChat]);

  // 键盘导航处理
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (isAnswered || isSubmitting) return;

    const totalInteractiveItems = visibleOptions.length + (block.allowCustomInput ? 1 : 0);

    switch (event.key) {
      case 'ArrowDown':
      case 'Tab':
        if (!event.shiftKey) {
          event.preventDefault();
          setFocusedIndex(prev => (prev + 1) % totalInteractiveItems);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => (prev - 1 + totalInteractiveItems) % totalInteractiveItems);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < visibleOptions.length) {
          handleOptionSelect(visibleOptions[focusedIndex].value);
        } else if (focusedIndex === visibleOptions.length && block.allowCustomInput) {
          // 焦点在输入框，不做特殊处理
        }
        break;
      case 'Escape':
        event.preventDefault();
        setFocusedIndex(-1);
        setCustomInput('');
        break;
    }
  }, [isAnswered, isSubmitting, visibleOptions, block.allowCustomInput, focusedIndex, handleOptionSelect]);

  // 焦点管理
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < visibleOptions.length) {
      const optionElement = containerRef.current?.querySelector(`[data-option-index="${focusedIndex}"]`) as HTMLElement;
      optionElement?.focus();
    } else if (focusedIndex === visibleOptions.length && block.allowCustomInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focusedIndex, visibleOptions.length, block.allowCustomInput]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-labelledby={`question-header-${block.id}`}
      aria-describedby={block.multiSelect ? 'multi-select-hint' : undefined}
      onKeyDown={handleKeyDown}
      className={clsx(
        'my-2 rounded-lg border max-h-[300px] overflow-hidden flex flex-col',
        isAnswered
          ? 'bg-success-faint border-success/30'
          : 'bg-accent-faint border-accent/30'
      )}
    >
      {/* 头部 */}
      <div
        id={`question-header-${block.id}`}
        className="flex items-center gap-2 px-3 py-2 border-b border-inherit bg-inherit/50 shrink-0"
      >
        {isAnswered ? (
          <CheckCircle className="w-4 h-4 text-success" aria-hidden="true" />
        ) : (
          <HelpCircle className="w-4 h-4 text-accent" aria-hidden="true" />
        )}
        <span className="text-sm font-medium text-text-primary">
          {block.header}
        </span>
        {isAnswered && (
          <span className="ml-auto text-xs text-success">
            {t('question.answered')}
          </span>
        )}
        {block.multiSelect && !isAnswered && (
          <span id="multi-select-hint" className="ml-auto text-xs text-text-tertiary">
            {t('question.multiSelectHint')}
          </span>
        )}
      </div>

      {/* 内容区 - 可滚动 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* 选项列表 */}
        {displayOptions.length > 0 && (
          <div role="listbox" aria-multiselectable={block.multiSelect} className="space-y-1.5">
            {visibleOptions.map((option, index) => {
              const isSelected = (answer?.selected || selectedOptions).includes(option.value);
              const isFocused = focusedIndex === index;
              return (
                <button
                  key={index}
                  role="option"
                  data-option-index={index}
                  tabIndex={isFocused ? 0 : -1}
                  aria-selected={isSelected}
                  aria-checked={isSelected}
                  onClick={() => handleOptionSelect(option.value)}
                  disabled={isAnswered || isSubmitting}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                    'flex items-center gap-2',
                    'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
                    isAnswered
                      ? isSelected
                        ? 'bg-success/20 text-success border border-success/30'
                        : 'bg-bg-secondary/50 text-text-tertiary'
                      : isSelected
                        ? 'bg-accent/20 text-accent border border-accent/30'
                        : 'bg-bg-secondary hover:bg-bg-tertiary border border-transparent',
                    isFocused && !isAnswered && 'ring-2 ring-accent ring-offset-1',
                    !isAnswered && !isSubmitting && 'cursor-pointer'
                  )}
                >
                  <div
                    role="presentation"
                    aria-hidden="true"
                    className={clsx(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                    isSelected
                      ? isAnswered
                        ? 'border-success bg-success'
                        : 'border-accent bg-accent'
                      : 'border-border'
                  )}>
                    {isSelected && (
                      <Check className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                  <span>{option.label || option.value}</span>
                </button>
              );
            })}

            {/* 展开更多选项 */}
            {hasMoreOptions && !showAllOptions && !isAnswered && (
              <button
                onClick={() => setShowAllOptions(true)}
                className="w-full text-center text-xs text-accent hover:text-accent-dark py-1"
              >
                {t('question.showMore', { count: block.options.length - 5 })}
              </button>
            )}
          </div>
        )}

        {/* 自定义输入 */}
        {block.allowCustomInput && !isAnswered && (
          <div className="mt-2">
            <label htmlFor={`custom-input-${block.id}`} className="sr-only">
              {t('question.customInputLabel')}
            </label>
            <input
              ref={inputRef}
              id={`custom-input-${block.id}`}
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder={t('question.customInputPlaceholder')}
              disabled={isSubmitting}
              aria-label={t('question.customInputLabel')}
              onFocus={() => setFocusedIndex(visibleOptions.length)}
              className={clsx(
                'w-full px-3 py-2 rounded-md text-sm bg-bg-secondary border border-border',
                'focus:border-accent focus:ring-1 focus:ring-accent outline-none',
                'placeholder:text-text-tertiary disabled:opacity-50',
                focusedIndex === visibleOptions.length && 'ring-2 ring-accent'
              )}
            />
          </div>
        )}

        {/* 已回答时显示答案 */}
        {isAnswered && answer && (
          <div className="mt-2 pt-2 border-t border-inherit">
            <div className="text-xs text-text-secondary">
              {answer.selected.length > 0 && (
                <span>{t('question.selected')}: {answer.selected.join(', ')}</span>
              )}
              {answer.customInput && (
                <span className="ml-2">{t('question.input')}: {answer.customInput}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 - 固定底部 */}
      {!isAnswered && (
        <div className="shrink-0 px-3 py-2 border-t border-inherit bg-inherit/30">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={(selectedOptions.length === 0 && !customInput.trim()) || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t('question.submitting') : t('question.submit')}
          </Button>
        </div>
      )}
    </div>
  );
});

/** 简化版问题渲染器 - 用于归档层 */
const SimplifiedQuestionRenderer = memo(function SimplifiedQuestionRenderer({ block }: { block: QuestionBlock }) {
  return (
    <div className="my-1 flex items-center gap-2 text-xs text-text-tertiary">
      {block.status === 'answered' ? (
        <CheckCircle className="w-3 h-3 text-success" />
      ) : (
        <HelpCircle className="w-3 h-3 text-accent" />
      )}
      <span className="truncate">{block.header}</span>
      {block.answer && (
        <span className="text-text-secondary truncate max-w-[200px]">
          {block.answer.selected.join(', ') || block.answer.customInput}
        </span>
      )}
    </div>
  );
});

// ========================================
// PlanMode 渲染器
// ========================================

/** PlanMode 状态配置 */
const PLAN_STATUS_CONFIG = {
  drafting: { icon: Loader2, color: 'text-violet-500', bg: 'bg-violet-500/10', labelKey: 'plan.statusDrafting' },
  pending_approval: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', labelKey: 'plan.statusPendingApproval' },
  approved: { icon: ThumbsUp, color: 'text-green-500', bg: 'bg-green-500/10', labelKey: 'plan.statusApproved' },
  rejected: { icon: ThumbsDown, color: 'text-red-500', bg: 'bg-red-500/10', labelKey: 'plan.statusRejected' },
  executing: { icon: Play, color: 'text-blue-500', bg: 'bg-blue-500/10', labelKey: 'plan.statusExecuting' },
  completed: { icon: Check, color: 'text-success', bg: 'bg-success/10', labelKey: 'plan.statusCompleted' },
  canceled: { icon: X, color: 'text-gray-500', bg: 'bg-gray-500/10', labelKey: 'plan.statusCanceled' },
} as const;

/** PlanMode 任务状态配置 */
const PLAN_TASK_STATUS_CONFIG = {
  pending: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-500/10' },
  in_progress: { icon: Loader2, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  completed: { icon: Check, color: 'text-green-500', bg: 'bg-green-500/10' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  skipped: { icon: ChevronRight, color: 'text-gray-400', bg: 'bg-gray-500/10' },
} as const;

/** 计划阶段组件 */
const PlanStageRenderer = memo(function PlanStageRenderer({
  stage,
  isExpanded = false,
  onToggle
}: {
  stage: PlanStageBlock;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation('chat');
  const statusConfig = PLAN_TASK_STATUS_CONFIG[stage.status];
  const StatusIcon = statusConfig.icon;

  // 计算阶段进度
  const totalTasks = stage.tasks.length;
  const completedTasks = stage.tasks.filter(task => task.status === 'completed').length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // 键盘支持：Enter/Space 展开/折叠
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle?.();
    }
  }, [onToggle]);

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      {/* 阶段头部 */}
      <div
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={t('plan.stageAriaLabel', { name: stage.name, completed: completedTasks, total: totalTasks })}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-background-hover transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1',
          stage.status === 'in_progress' && 'bg-violet-500/5'
        )}
      >
        <div className={clsx('p-1 rounded', statusConfig.bg)}>
          <StatusIcon className={clsx('w-3.5 h-3.5', statusConfig.color, stage.status === 'in_progress' && 'animate-spin')} />
        </div>
        <span className="text-sm font-medium text-text-primary flex-1 truncate">{stage.name}</span>
        {totalTasks > 0 && (
          <span className="text-xs text-text-tertiary">{completedTasks}/{totalTasks}</span>
        )}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
      </div>

      {/* 阶段内容 */}
      {isExpanded && stage.tasks.length > 0 && (
        <div className="px-3 py-2 border-t border-border-subtle bg-background-subtle/30">
          {/* 进度条 */}
          {totalTasks > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-background-base rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-violet-500 h-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-text-tertiary">{progress}%</span>
              </div>
            </div>
          )}

          {/* 任务列表 */}
          <div className="space-y-1">
            {stage.tasks.map((task, idx) => {
              const taskConfig = PLAN_TASK_STATUS_CONFIG[task.status];
              const TaskIcon = taskConfig.icon;
              return (
                <div key={task.taskId || idx} className="flex items-start gap-2 p-1.5 rounded bg-background-surface/50">
                  <TaskIcon className={clsx('w-3.5 h-3.5 mt-0.5 shrink-0', taskConfig.color, task.status === 'in_progress' && 'animate-spin')} />
                  <span className={clsx('text-xs flex-1', task.status === 'completed' ? 'text-text-tertiary line-through' : 'text-text-secondary')}>
                    {task.description}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

/** PlanMode 块组件 - 用于计划模式 */
const PlanModeBlockRenderer = memo(function PlanModeBlockRenderer({ block }: { block: PlanModeBlock }) {
  const { t } = useTranslation('chat');
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  // 无障碍支持
  const containerRef = useRef<HTMLDivElement>(null);
  const feedbackInputRef = useRef<HTMLInputElement>(null);

  const conversationId = useEventChatStore(state => state.conversationId);
  const continueChat = useEventChatStore(state => state.continueChat);

  const statusConfig = PLAN_STATUS_CONFIG[block.status];
  const StatusIcon = statusConfig.icon;

  // 是否可交互
  const isInteractive = block.status === 'pending_approval' && block.isActive;

  // 键盘导航支持
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showFeedbackInput) {
        setShowFeedbackInput(false);
        setRejectFeedback('');
        e.preventDefault();
      }
    }
  }, [showFeedbackInput]);

  // 焦点管理：反馈输入框显示时自动聚焦
  useEffect(() => {
    if (showFeedbackInput && feedbackInputRef.current) {
      feedbackInputRef.current.focus();
    }
  }, [showFeedbackInput]);

  // 切换阶段展开状态
  const toggleStage = useCallback((stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  }, []);

  // 构建审批结果 prompt 格式
  const buildApprovalPrompt = useCallback((approved: boolean, feedback?: string): string => {
    const planTitle = block.title || t('plan.defaultTitle');
    const action = approved ? '批准' : '拒绝';
    const parts: string[] = [`[计划审批] 用户${action}了计划: "${planTitle}"`];

    if (!approved && feedback) {
      parts.push(`反馈意见: ${feedback}`);
    }

    return parts.join('\n');
  }, [block.title, t]);

  // 批准计划
  const handleApprove = useCallback(async () => {
    if (!isInteractive || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 1. 调用后端命令批准计划，更新状态
      await invoke('approve_plan', {
        sessionId: conversationId,
        planId: block.id,
      });

      // 2. 构建审批结果 prompt 并发送给 CLI
      const approvalPrompt = buildApprovalPrompt(true);

      // 3. 调用 continueChat 将结果发送给 CLI
      if (conversationId) {
        await continueChat(approvalPrompt);
      }
    } catch (error) {
      console.error('[PlanModeBlock] 批准计划失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isInteractive, isSubmitting, conversationId, block.id, buildApprovalPrompt, continueChat]);

  // 拒绝计划
  const handleReject = useCallback(async () => {
    if (!isInteractive || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 1. 调用后端命令拒绝计划，更新状态
      await invoke('reject_plan', {
        sessionId: conversationId,
        planId: block.id,
        feedback: rejectFeedback || undefined,
      });

      // 2. 构建审批结果 prompt 并发送给 CLI
      const rejectionPrompt = buildApprovalPrompt(false, rejectFeedback || undefined);

      // 3. 调用 continueChat 将结果发送给 CLI
      if (conversationId) {
        await continueChat(rejectionPrompt);
      }

      // 4. 重置反馈输入
      setRejectFeedback('');
      setShowFeedbackInput(false);
    } catch (error) {
      console.error('[PlanModeBlock] 拒绝计划失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isInteractive, isSubmitting, conversationId, block.id, rejectFeedback, buildApprovalPrompt, continueChat]);

  // 计算整体进度
  const totalTasks = block.stages.reduce((sum, s) => sum + s.tasks.length, 0);
  const completedTasks = block.stages.reduce((sum, s) => sum + s.tasks.filter(t => t.status === 'completed').length, 0);
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t('plan.planModeAriaLabel', { title: block.title || t('plan.defaultTitle') })}
      onKeyDown={handleKeyDown}
      className={clsx(
        'my-2 rounded-lg border overflow-hidden',
        block.isActive
          ? 'bg-violet-500/5 border-violet-500/30'
          : 'bg-background-surface border-border'
      )}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit bg-inherit/50">
        <div className={clsx('p-1.5 rounded', statusConfig.bg)}>
          <StatusIcon className={clsx('w-4 h-4', statusConfig.color, block.status === 'drafting' && 'animate-spin')} />
        </div>
        <ListChecks className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-medium text-text-primary">
          {block.title || t('plan.defaultTitle')}
        </span>
        <span className={clsx('ml-auto text-xs px-2 py-0.5 rounded-full', statusConfig.bg, statusConfig.color)}>
          {t(statusConfig.labelKey)}
        </span>
      </div>

      {/* 描述 */}
      {block.description && (
        <div className="px-3 py-2 text-xs text-text-secondary border-b border-inherit bg-inherit/30">
          {block.description}
        </div>
      )}

      {/* 整体进度 */}
      {totalTasks > 0 && (
        <div className="px-3 py-2 border-b border-inherit">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-background-base rounded-full h-2 overflow-hidden">
              <div
                className="bg-violet-500 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-text-tertiary">{completedTasks}/{totalTasks}</span>
          </div>
        </div>
      )}

      {/* 阶段列表 - 可滚动 */}
      <div className="max-h-[300px] overflow-y-auto p-3 space-y-2">
        {block.stages.map((stage) => (
          <PlanStageRenderer
            key={stage.stageId}
            stage={stage}
            isExpanded={expandedStages.has(stage.stageId)}
            onToggle={() => toggleStage(stage.stageId)}
          />
        ))}
      </div>

      {/* 反馈输入框 */}
      {isInteractive && showFeedbackInput && (
        <div className="px-3 py-2 border-t border-inherit bg-inherit/30">
          <label className="sr-only" htmlFor="plan-feedback-input">
            {t('plan.feedbackLabel')}
          </label>
          <input
            id="plan-feedback-input"
            ref={feedbackInputRef}
            type="text"
            value={rejectFeedback}
            onChange={(e) => setRejectFeedback(e.target.value)}
            placeholder={t('plan.feedbackPlaceholder')}
            aria-label={t('plan.feedbackLabel')}
            disabled={isSubmitting}
            className="w-full px-3 py-2 rounded-md text-sm bg-bg-secondary border border-border
                       focus:border-violet-500 focus:ring-2 focus:ring-violet-500 outline-none
                       placeholder:text-text-tertiary disabled:opacity-50"
          />
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFeedbackInput(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              {t('plan.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <ThumbsDown className="w-3 h-3 mr-1" />
              )}
              {t('plan.confirmReject')}
            </Button>
          </div>
        </div>
      )}

      {/* 审批按钮 */}
      {isInteractive && !showFeedbackInput && (
        <div
          role="group"
          aria-label={t('plan.approvalButtonsLabel')}
          className="flex items-center gap-2 px-3 py-2 border-t border-inherit bg-inherit/30"
        >
          <Button
            variant="primary"
            size="sm"
            onClick={handleApprove}
            disabled={isSubmitting}
            aria-label={t('plan.approveAriaLabel')}
            className="flex-1"
          >
            {isSubmitting ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <ThumbsUp className="w-3 h-3 mr-1" />
            )}
            {t('plan.approve')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowFeedbackInput(true)}
            disabled={isSubmitting}
            aria-label={t('plan.rejectAriaLabel')}
            className="flex-1"
          >
            <ThumbsDown className="w-3 h-3 mr-1" />
            {t('plan.reject')}
          </Button>
        </div>
      )}

      {/* 反馈信息 */}
      {block.feedback && (
        <div className="px-3 py-2 border-t border-inherit bg-red-500/5">
          <div className="text-xs text-red-400">{block.feedback}</div>
        </div>
      )}
    </div>
  );
});

/** 简化版计划渲染器 - 用于归档层 */
const SimplifiedPlanModeRenderer = memo(function SimplifiedPlanModeRenderer({ block }: { block: PlanModeBlock }) {
  const { t } = useTranslation('chat');
  const statusConfig = PLAN_STATUS_CONFIG[block.status];
  const StatusIcon = statusConfig.icon;

  const totalTasks = block.stages.reduce((sum, s) => sum + s.tasks.length, 0);
  const completedTasks = block.stages.reduce((sum, s) => sum + s.tasks.filter(t => t.status === 'completed').length, 0);

  return (
    <div className="my-1 flex items-center gap-2 text-xs text-text-tertiary">
      <StatusIcon className={clsx('w-3 h-3', statusConfig.color)} />
      <ClipboardList className="w-3 h-3 text-violet-500" />
      <span className="truncate">{block.title || t('plan.defaultTitle')}</span>
      {totalTasks > 0 && (
        <span className="text-text-secondary">{completedTasks}/{totalTasks}</span>
      )}
    </div>
  );
});

// ========================================
// AgentRun 渲染器
// ========================================

/** AgentRun 状态配置 */
const AGENT_STATUS_CONFIG = {
  pending: { icon: Loader2, className: 'animate-spin text-yellow-500', labelKey: 'status.pending' },
  running: { icon: Play, className: 'text-blue-500 animate-pulse', labelKey: 'status.running' },
  success: { icon: Check, className: 'text-green-500', labelKey: 'status.completed' },
  error: { icon: XCircle, className: 'text-red-500', labelKey: 'status.failed' },
  canceled: { icon: X, className: 'text-gray-500', labelKey: 'status.canceled' },
} as const;

/** 嵌套工具调用状态配置 */
const NESTED_TOOL_STATUS_CONFIG = {
  pending: { icon: Circle, color: 'text-gray-400' },
  running: { icon: Loader2, color: 'text-blue-500 animate-spin' },
  completed: { icon: Check, color: 'text-green-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
} as const;

/**
 * AgentRun 块组件 - 用于 Agent 任务聚合展示
 */
const AgentRunBlockRenderer = memo(function AgentRunBlockRenderer({ block }: { block: AgentRunBlock }) {
  const { t } = useTranslation('chat');
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const statusConfig = AGENT_STATUS_CONFIG[block.status];
  const StatusIcon = statusConfig.icon;

  // 计算耗时
  const duration = useMemo(() => {
    if (block.duration) return formatDuration(block.duration);
    const calculated = calculateDuration(block.startedAt, block.completedAt);
    return calculated ? formatDuration(calculated) : '';
  }, [block.duration, block.startedAt, block.completedAt]);

  // 工具调用统计
  const toolStats = useMemo(() => {
    const total = block.toolCalls.length;
    const completed = block.toolCalls.filter(tc => tc.status === 'completed').length;
    const failed = block.toolCalls.filter(tc => tc.status === 'failed').length;
    return { total, completed, failed };
  }, [block.toolCalls]);

  // 是否正在运行
  const isRunning = block.status === 'running';

  // 是否有嵌套工具
  const hasToolCalls = block.toolCalls.length > 0;

  // 键盘导航处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded(prev => !prev);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t('agent.agentRunAriaLabel', { type: block.agentType })}
      className={clsx(
        'my-2 rounded-lg border overflow-hidden',
        block.status === 'error'
          ? 'bg-error-faint border-error/30'
          : isRunning
            ? 'bg-primary-faint border-primary/30'
            : 'bg-success-faint border-success/30'
      )}
    >
      {/* 头部 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={t('agent.toggleDetails')}
        className={clsx(
          'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-inherit/50',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset',
          isRunning && 'animate-pulse-subtle'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={handleKeyDown}
      >
        {/* Agent 图标 */}
        <div className={clsx(
          'p-1.5 rounded-md',
          isRunning ? 'bg-primary/20' : block.status === 'error' ? 'bg-error/20' : 'bg-success/20'
        )}>
          <StatusIcon className={clsx('w-4 h-4', statusConfig.className)} />
        </div>

        {/* Agent 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-primary font-medium">{block.agentType}</span>
            <span className={clsx(
              'text-xs px-1.5 py-0.5 rounded',
              isRunning ? 'bg-primary/20 text-primary' :
              block.status === 'error' ? 'bg-error/20 text-error' : 'bg-success/20 text-success'
            )}>
              {t(statusConfig.labelKey)}
            </span>
          </div>
          {/* 进度信息 */}
          {isRunning && block.progressMessage && (
            <div className="text-xs text-text-tertiary mt-0.5 truncate">
              {block.progressMessage}
            </div>
          )}
          {/* 工具调用摘要 */}
          {hasToolCalls && !isExpanded && (
            <div className="text-xs text-text-tertiary mt-0.5">
              {t('agent.toolCount', { count: toolStats.total })}
              {toolStats.completed > 0 && ` (${toolStats.completed} ${t('agent.completed')})`}
            </div>
          )}
        </div>

        {/* 进度条 */}
        {isRunning && block.progressPercent !== undefined && (
          <div className="w-20 flex items-center gap-2">
            <div className="flex-1 bg-bg-secondary rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${block.progressPercent}%` }}
              />
            </div>
            <span className="text-xs text-text-tertiary">{block.progressPercent}%</span>
          </div>
        )}

        {/* 耗时 */}
        {duration && (
          <span className="text-xs text-text-tertiary shrink-0">{duration}</span>
        )}

        {/* 展开/收起 */}
        {hasToolCalls && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-text-muted transition-transform shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        )}
      </div>

      {/* 嵌套工具调用列表 */}
      {isExpanded && hasToolCalls && (
        <div className="px-4 py-2 bg-bg-secondary/30 border-t border-inherit">
          <div className="text-xs text-text-muted mb-2 flex items-center gap-1.5">
            <ListChecks className="w-3 h-3" />
            {t('agent.toolCalls')}
          </div>
          <div className="space-y-1">
            {block.toolCalls.map((toolCall) => {
              const toolConfig = NESTED_TOOL_STATUS_CONFIG[toolCall.status];
              const ToolIcon = toolConfig.icon;
              return (
                <div
                  key={toolCall.id}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-bg-secondary/50"
                >
                  <ToolIcon className={clsx('w-3 h-3', toolConfig.color)} />
                  <span className="text-text-secondary">{toolCall.name}</span>
                  {toolCall.summary && (
                    <span className="text-text-tertiary truncate flex-1">{toolCall.summary}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {block.status === 'error' && block.error && (
        <div className="px-3 py-2 border-t border-error/20 bg-error/5">
          <div className="text-xs text-error flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="break-all">{block.error}</span>
          </div>
        </div>
      )}

      {/* 输出内容 */}
      {block.output && isExpanded && (
        <div className="px-3 py-2 border-t border-inherit bg-inherit/30">
          <div className="text-xs text-text-muted mb-1">{t('agent.output')}</div>
          <pre className="text-xs text-text-secondary bg-bg-secondary rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
            {block.output}
          </pre>
        </div>
      )}
    </div>
  );
});

/** 简化版 AgentRun 渲染器 - 用于归档层 */
const SimplifiedAgentRunRenderer = memo(function SimplifiedAgentRunRenderer({ block }: { block: AgentRunBlock }) {
  const statusConfig = AGENT_STATUS_CONFIG[block.status];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="my-1 flex items-center gap-2 text-xs text-text-tertiary">
      <StatusIcon className={clsx('w-3 h-3', statusConfig.className)} />
      <Play className="w-3 h-3 text-primary" />
      <span className="truncate">{block.agentType}</span>
      {block.toolCalls.length > 0 && (
        <span className="text-text-secondary">{block.toolCalls.length}</span>
      )}
    </div>
  );
});

/** 助手消息组件 - 使用内容块架构 */
const AssistantBubble = memo(function AssistantBubble({
  message,
  renderMode = 'full'
}: {
  message: AssistantChatMessage;
  renderMode?: MessageRenderMode;
}) {
  const hasBlocks = message.blocks && message.blocks.length > 0;

  return (
    <div className="flex gap-3 my-2">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-600
                      flex items-center justify-center shadow-glow shrink-0">
        <span className="text-sm font-bold text-white">P</span>
      </div>

      {/* 内容 */}
      <div className="flex-1 space-y-1 min-w-0">
        {/* 头部信息 */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-text-primary">Claude</span>
          <span className="text-xs text-text-tertiary">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* 渲染内容块（支持工具聚合） */}
        {hasBlocks ? (
          <div className="space-y-1">
            {renderBlocksWithGrouping(message.blocks, message.isStreaming, renderMode)}
          </div>
        ) : message.content ? (
          // 兼容旧格式（content 字符串）
          <div
            className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
          />
        ) : null}

        {/* 流式光标 */}
        {message.isStreaming && (
          <span className="inline-flex ml-1">
            <span className="flex gap-0.5 items-end h-4">
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 优化重渲染：使用浅比较代替深度序列化
  // 比较关键属性：id、isStreaming、blocks 数量、最后一个块的内容长度
  const prevBlocks = prevProps.message.blocks;
  const nextBlocks = nextProps.message.blocks;

  // 基础属性比较
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.isStreaming !== nextProps.message.isStreaming) return false;

  // blocks 数量不同，需要更新
  if (prevBlocks.length !== nextBlocks.length) return false;

  // 对于流式消息，检查最后一个文本块的内容长度
  // 这比 JSON.stringify 快得多，且能捕获大部分更新
  if (nextProps.message.isStreaming && prevBlocks.length > 0) {
    const lastPrev = prevBlocks[prevBlocks.length - 1];
    const lastNext = nextBlocks[nextBlocks.length - 1];

    if (lastPrev.type === 'text' && lastNext.type === 'text') {
      // 内容长度变化需要更新
      if (lastPrev.content.length !== lastNext.content.length) return false;
    } else if (lastPrev.type !== lastNext.type) {
      return false;
    }

    // 检查工具调用块的状态变化
    for (let i = 0; i < prevBlocks.length; i++) {
      const pb = prevBlocks[i];
      const nb = nextBlocks[i];
      if (pb.type !== nb.type) return false;
      if (pb.type === 'tool_call' && nb.type === 'tool_call') {
        if (pb.status !== nb.status) return false;
        if (pb.output !== nb.output) return false;
      }
    }
  }

  // 非流式消息，认为没有变化
  return true;
});

/** 工具聚合配置 */
const TOOL_GROUP_CONFIG = {
  /** 最小工具数量（少于此数量不聚合） */
  minToolsForGroup: 2,
  /** 时间窗口（毫秒），超过此时间的工具不聚合 */
  timeWindowMs: 3000,
}

/**
 * 检测并聚合相邻的工具调用块
 * 返回渲染后的 React 节点数组
 */
function renderBlocksWithGrouping(
  blocks: ContentBlock[],
  isStreaming: boolean | undefined,
  renderMode: MessageRenderMode
): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    // 检测是否为工具调用块
    if (block.type === 'tool_call') {
      // 收集连续的工具调用块
      const toolBlocks: ToolCallBlock[] = [block]
      let j = i + 1

      while (j < blocks.length && blocks[j].type === 'tool_call') {
        // 检查时间窗口
        const currentTool = blocks[j] as ToolCallBlock
        const prevTool = toolBlocks[toolBlocks.length - 1]
        const prevTime = prevTool.startedAt ? new Date(prevTool.startedAt).getTime() : 0
        const currTime = currentTool.startedAt ? new Date(currentTool.startedAt).getTime() : Date.now()

        // 如果在时间窗口内，添加到组
        if (currTime - prevTime < TOOL_GROUP_CONFIG.timeWindowMs) {
          toolBlocks.push(currentTool)
          j++
        } else {
          break
        }
      }

      // 判断是否聚合
      if (toolBlocks.length >= TOOL_GROUP_CONFIG.minToolsForGroup) {
        // 渲染工具组
        result.push(
          <ToolGroupRenderer
            key={`tool-group-${i}`}
            tools={toolBlocks}
            renderMode={renderMode}
          />
        )
        i = j
      } else {
        // 单独渲染
        result.push(
          <div key={`block-${i}`}>
            {renderContentBlock(block, isStreaming, renderMode)}
          </div>
        )
        i++
      }
    } else {
      // 非工具块，正常渲染
      result.push(
        <div key={`block-${i}`}>
          {renderContentBlock(block, isStreaming, renderMode)}
        </div>
      )
      i++
    }
  }

  return result
}

/** 工具组渲染器 */
const ToolGroupRenderer = memo(function ToolGroupRenderer({
  tools,
  renderMode
}: {
  tools: ToolCallBlock[]
  renderMode: MessageRenderMode
}) {
  const { t } = useTranslation('chat')
  const [isExpanded, setIsExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsExpanded(prev => !prev)
    }
  }, [])

  // 计算组状态
  const groupStatus = useMemo(() => {
    const allCompleted = tools.every(t => t.status === 'completed')
    const anyFailed = tools.some(t => t.status === 'failed')
    const anyRunning = tools.some(t => t.status === 'running' || t.status === 'pending')

    if (allCompleted) return 'completed'
    if (anyFailed && !anyRunning) return 'failed'
    if (anyFailed) return 'partial'
    if (anyRunning) return 'running'
    return 'pending'
  }, [tools])

  // 统计各状态数量
  const stats = useMemo(() => {
    const completed = tools.filter(t => t.status === 'completed').length
    const failed = tools.filter(t => t.status === 'failed').length
    const running = tools.filter(t => t.status === 'running' || t.status === 'pending').length
    return { completed, failed, running }
  }, [tools])

  // 获取状态配置
  const statusConfig = useMemo(() => {
    const configs: Record<string, { icon: typeof Check; className: string; bgClass: string }> = {
      completed: { icon: Check, className: 'text-success', bgClass: 'bg-success-faint border-success/30' },
      failed: { icon: XCircle, className: 'text-error', bgClass: 'bg-error-faint border-error/30' },
      partial: { icon: AlertTriangle, className: 'text-warning', bgClass: 'bg-warning-faint border-warning/30' },
      running: { icon: Loader2, className: 'text-primary animate-spin', bgClass: 'bg-primary-faint border-primary/30' },
      pending: { icon: Circle, className: 'text-text-muted', bgClass: 'bg-bg-secondary border-border' },
    }
    return configs[groupStatus] || configs.pending
  }, [groupStatus])

  // 生成摘要
  const summary = useMemo(() => {
    const toolNames = [...new Set(tools.map(t => t.name))]
    if (toolNames.length === 1) {
      return `${toolNames[0]} ×${tools.length}`
    }
    return `${tools.length} ${t('toolGroup.tools')}`
  }, [tools, t])

  // 计算总时长
  const duration = useMemo(() => {
    const firstStart = tools[0]?.startedAt
    const lastEnd = tools.filter(t => t.completedAt).pop()?.completedAt
    if (firstStart && lastEnd) {
      const ms = new Date(lastEnd).getTime() - new Date(firstStart).getTime()
      return formatDuration(ms)
    }
    return null
  }, [tools])

  const StatusIcon = statusConfig.icon

  // 归档模式：简化渲染
  if (renderMode === 'archive') {
    return (
      <div className="my-1 flex items-center gap-2 text-xs text-text-tertiary">
        <StatusIcon className={clsx('w-3 h-3', statusConfig.className)} />
        <span className="truncate">{summary}</span>
        {stats.completed > 0 && <span className="text-success">{stats.completed}</span>}
        {stats.failed > 0 && <span className="text-error">{stats.failed}</span>}
      </div>
    )
  }

  // 默认最多显示 3 个工具
  const displayedTools = isExpanded ? tools : tools.slice(0, 3)
  const hasMoreTools = tools.length > 3

  return (
    <div
      ref={containerRef}
      className="my-2"
      role="region"
      aria-label={t('toolGroup.ariaLabel', { count: tools.length })}
    >
      {/* 工具组摘要 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={t('toolGroup.toggleLabel')}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all hover:shadow-medium',
          'focus:ring-2 focus:ring-primary focus:outline-none',
          statusConfig.bgClass
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={handleKeyDown}
      >
        {/* 状态图标 */}
        <StatusIcon className={clsx('w-4 h-4 shrink-0', statusConfig.className)} />

        {/* 摘要内容 */}
        <div className="flex-1">
          <span className={clsx(
            'text-sm',
            groupStatus === 'running' ? 'text-text-primary' : 'text-text-secondary'
          )}>
            {summary}
          </span>

          {/* 状态统计 */}
          <span className="ml-2 text-xs text-text-tertiary">
            {stats.completed > 0 && `${stats.completed} ${t('toolGroup.completed')} `}
            {stats.running > 0 && `${stats.running} ${t('toolGroup.running')} `}
            {stats.failed > 0 && `${stats.failed} ${t('toolGroup.failed')}`}
          </span>
        </div>

        {/* 时长 */}
        {duration && (
          <span className="text-xs text-text-tertiary">
            {duration}
          </span>
        )}

        {/* 展开/折叠图标 */}
        <div className="shrink-0 text-text-subtle">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* 展开后的工具列表 */}
      {isExpanded && tools.length > 0 && (
        <div className="mt-2 ml-4 space-y-1.5">
          {displayedTools.map((tool) => {
            const toolConfig = getToolConfig(tool.name)
            const ToolIcon = toolConfig.icon
            const toolStatusConfig = {
              completed: { icon: Check, className: 'text-success' },
              failed: { icon: XCircle, className: 'text-error' },
              partial: { icon: AlertTriangle, className: 'text-warning' },
              running: { icon: Loader2, className: 'text-primary animate-spin' },
              pending: { icon: Circle, className: 'text-text-muted' },
            }[tool.status] || { icon: Circle, className: 'text-text-muted' }
            const ToolStatusIcon = toolStatusConfig.icon

            return (
              <div
                key={tool.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-bg-secondary/50 border border-border-subtle"
              >
                <ToolIcon className={clsx('w-3.5 h-3.5 shrink-0', toolConfig.color)} />
                <span className="text-sm text-text-secondary flex-1 truncate">
                  {toolConfig.label}
                </span>
                <ToolStatusIcon className={clsx('w-3 h-3 shrink-0', toolStatusConfig.className)} />
              </div>
            )
          })}

          {/* 显示更多按钮 */}
          {hasMoreTools && !isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(true)
              }}
              className="w-full px-3 py-2 text-xs text-primary hover:text-primary-hover hover:bg-bg-hover rounded-md transition-colors"
            >
              {t('toolGroup.showAll', { count: tools.length })}
            </button>
          )}
        </div>
      )}
    </div>
  )
})

/** 系统消息组件 */
const SystemBubble = memo(function SystemBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-center my-2">
      <p className="text-sm text-text-muted italic">{content}</p>
    </div>
  );
});

/** 消息渲染器 */
function renderChatMessage(message: ChatMessage, renderMode: MessageRenderMode = 'full'): React.ReactNode {
  switch (message.type) {
    case 'user':
      return <UserBubble key={message.id} message={message} />;
    case 'assistant':
      return <AssistantBubble key={message.id} message={message} renderMode={renderMode} />;
    case 'system':
      return <SystemBubble key={message.id} content={(message as any).content} />;
    default:
      return null;
  }
}

/** 空状态组件 */
const EmptyState = memo(function EmptyState() {
  const { t } = useTranslation('chat');
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Logo 图标 */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-glow mb-6 hover:shadow-glow-lg transition-all">
        <span className="text-3xl font-bold text-white">P</span>
      </div>

      {/* 标题 */}
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        {t('welcome.title')}
      </h1>

      {/* 描述 */}
      <p className="text-text-secondary mb-8 max-w-md">
        {t('welcome.description')}
      </p>

      {/* 功能列表 */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-success-faint flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-success" />
          </div>
          <span className="text-xs text-text-tertiary">{t('welcome.featureFileManage')}</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-warning-faint flex items-center justify-center">
            <Code className="w-4 h-4 text-warning" />
          </div>
          <span className="text-xs text-text-tertiary">{t('welcome.featureCodeEdit')}</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-surface border border-border shadow-soft hover:shadow-medium hover:border-border-strong transition-all">
          <div className="w-8 h-8 rounded-lg bg-primary-faint flex items-center justify-center">
            <FileSearch className="w-4 h-4 text-primary" />
          </div>
          <span className="text-xs text-text-tertiary">{t('welcome.featureSmartAnalysis')}</span>
        </div>
      </div>

      {/* 提示 */}
      <p className="text-text-tertiary text-sm mt-8">
        {t('welcome.hint')}
      </p>
    </div>
  );
});

/**
 * 增强版聊天消息列表组件
 *
 * 使用内容块架构渲染消息，工具调用穿插在文本中间
 *
 * 性能优化：
 * - 流式阶段直接从 currentMessage 读取内容，不更新 messages 数组
 * - 避免 50ms 一次的整个消息列表重渲染
 */
export function EnhancedChatMessages() {
  const { messages, archivedMessages, loadMoreArchivedMessages, currentMessage, isStreaming } = useEventChatStore();

  // 性能优化：流式阶段合并 currentMessage 到消息列表
  // 这样就不需要频繁更新 messages 数组，避免整个列表重渲染
  // 使用 ref 缓存消息对象，避免每次 currentMessage 变化都创建新引用
  const prevDisplayMessagesRef = useRef<ChatMessage[]>([]);
  // 存储 lastContentRef 用于快速比较内容是否变化
  const lastContentRef = useRef<{ id: string; contentLen: number; blockCount: number } | null>(null);
  
  const displayMessages = useMemo(() => {
    if (!currentMessage || !isStreaming) {
      prevDisplayMessagesRef.current = messages;
      lastContentRef.current = null;
      return messages;
    }

    // 快速检查：如果 currentMessage 内容长度与上次相同，直接返回缓存
    const lastBlock = currentMessage.blocks[currentMessage.blocks.length - 1];
    const currentContentLen = lastBlock?.type === 'text' ? (lastBlock as any).content?.length || 0 : 0;
    const currentBlockCount = currentMessage.blocks.length;
    
    if (
      lastContentRef.current?.id === currentMessage.id &&
      lastContentRef.current?.contentLen === currentContentLen &&
      lastContentRef.current?.blockCount === currentBlockCount
    ) {
      // 内容长度相同，直接返回缓存（避免创建新数组）
      return prevDisplayMessagesRef.current;
    }

    // 更新缓存标记
    lastContentRef.current = { id: currentMessage.id, contentLen: currentContentLen, blockCount: currentBlockCount };

    // 检查 currentMessage 是否已在 messages 中
    const existingIndex = messages.findIndex(m => m.id === currentMessage.id);
    
    if (existingIndex >= 0) {
      // 内容变化，创建新的消息数组，但复用不变的消息对象
      const updated: ChatMessage[] = [
        ...messages.slice(0, existingIndex),
        {
          ...messages[existingIndex],
          blocks: currentMessage.blocks,
          isStreaming: true,
        } as AssistantChatMessage,
        ...messages.slice(existingIndex + 1),
      ];
      prevDisplayMessagesRef.current = updated;
      return updated;
    } else {
      // 添加到末尾
      const newMessages: ChatMessage[] = [...messages, {
        id: currentMessage.id,
        type: 'assistant' as const,
        blocks: currentMessage.blocks,
        timestamp: new Date().toISOString(),
        isStreaming: true,
      }];
      prevDisplayMessagesRef.current = newMessages;
      return newMessages;
    }
  }, [messages, currentMessage, isStreaming]);

  const isEmpty = displayMessages.length === 0;
  const hasArchive = archivedMessages.length > 0;

  // Virtuoso 引用，用于滚动控制
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // 智能自动滚动：用户在底部附近时自动滚动，离开底部时禁用
  const [autoScroll, setAutoScroll] = useState(true);

  // 当前可见的对话轮次索引
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);

  // 对话轮次分组（使用 displayMessages 包含流式消息）
  const conversationRounds = useMemo(() => {
    return groupConversationRounds(displayMessages);
  }, [displayMessages]);

  // 检测用户是否在底部附近（基于像素距离）
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAutoScroll(atBottom);
  }, []);

  // 监听可见范围变化，更新当前轮次索引
  const handleRangeChange = useCallback((range: { startIndex: number; endIndex: number }) => {
    const { startIndex, endIndex } = range;
    // 使用可见区域中心来找到最相关的轮次
    const centerIndex = Math.floor((startIndex + endIndex) / 2);

    // 找到包含中心索引的轮次
    const round = conversationRounds.findIndex(r =>
      r.messageIndices.some(idx => idx >= startIndex && idx <= endIndex) &&
      r.messageIndices.some(idx => idx > centerIndex)
    );

    // 如果没找到更合适的，使用第一个包含范围内消息的轮次
    const fallbackRound = conversationRounds.findIndex(r =>
      r.messageIndices.some(idx => idx >= startIndex && idx <= endIndex)
    );

    const targetRound = round >= 0 ? round : fallbackRound;
    if (targetRound >= 0) {
      setCurrentRoundIndex(targetRound);
    }
  }, [conversationRounds]);

  // 滚动到指定轮次
  const scrollToRound = useCallback((roundIndex: number) => {
    const round = conversationRounds[roundIndex];
    if (!round || !virtuosoRef.current) return;

    // 优先跳转到 AI 回复，如果没有则跳转到用户消息
    const targetIndex = round.assistantMessage
      ? round.messageIndices[1]  // AI 回复索引
      : round.messageIndices[0]; // 用户消息索引

    virtuosoRef.current.scrollToIndex({
      index: targetIndex,
      align: 'start',
      behavior: 'smooth',
    });

    setAutoScroll(false); // 禁用自动滚动
  }, [conversationRounds]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (!virtuosoRef.current) return;

    // 使用 scrollTo 替代 scrollToIndex，确保滚动到容器的物理底部
    virtuosoRef.current.scrollTo({
      top: Number.MAX_SAFE_INTEGER,
      behavior: 'smooth',
    });

    setAutoScroll(true); // 启用自动滚动
  }, []);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 归档消息提示 - 分批加载 */}
      {hasArchive && (
        <div className="flex justify-center py-2 bg-background-surface border-b border-border">
          <button
            onClick={() => loadMoreArchivedMessages(20)}
            className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-primary-faint"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            加载更早的消息 ({archivedMessages.length} 条)
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 min-h-0 relative">
        <div className="h-full">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={displayMessages}
              itemContent={(index, item) => {
                // 计算当前消息的渲染模式
                const renderMode = calculateRenderMode(index, displayMessages.length, DEFAULT_LAYER_CONFIG);
                return renderChatMessage(item, renderMode);
              }}
              components={{
                EmptyPlaceholder: () => null,
                Header: hasArchive ? (() => (
                  <div className="flex justify-center py-3">
                    <button
                      onClick={() => loadMoreArchivedMessages(20)}
                      className="text-xs text-text-tertiary hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <ChevronDown className="w-3 h-3" />
                      加载更早 20 条消息
                    </button>
                  </div>
                )) : undefined,
                Footer: () => <div style={{ height: '120px' }} />,
              }}
              followOutput={autoScroll ? (isStreaming ? true : 'smooth') : false}
              atBottomStateChange={handleAtBottomStateChange}
              atBottomThreshold={150}
              rangeChanged={handleRangeChange}
              increaseViewportBy={{ top: 100, bottom: 300 }}
              initialTopMostItemIndex={displayMessages.length - 1}
            />
          )}
        </div>

        {/* 聊天导航器 */}
        {!isEmpty && (
          <ChatNavigator
            rounds={conversationRounds}
            currentRoundIndex={currentRoundIndex}
            onScrollToBottom={scrollToBottom}
            onScrollToRound={scrollToRound}
          />
        )}
      </div>
    </div>
  );
}
