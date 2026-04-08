/**
 * Diff 差异计算服务
 * 用于计算文件修改前后的差异
 */

import { diffLines } from 'diff';

/**
 * 差异行信息
 */
export interface DiffLine {
  /** 行号 (原始文件) */
  oldLineNumber: number | null;
  /** 行号 (修改后文件) */
  newLineNumber: number | null;
  /** 行类型 */
  type: 'context' | 'added' | 'removed';
  /** 行内容 */
  content: string;
}

/**
 * 文件差异信息
 */
export interface FileDiff {
  /** 原始内容 */
  oldContent: string;
  /** 修改后内容 */
  newContent: string;
  /** 差异行列表 */
  lines: DiffLine[];
  /** 添加的行数 */
  addedCount: number;
  /** 删除的行数 */
  removedCount: number;
  /** 是否被裁剪（行数超过 maxLines） */
  truncated?: boolean;
  /** 裁剪前的总行数 */
  totalLines?: number;
}

/** 默认上下文行数（变更行前后保留的行数） */
const CONTEXT_LINES = 3;

/** 默认最大显示行数 */
const DEFAULT_MAX_LINES = 500;

/**
 * 计算两个字符串的差异
 * @param oldContent 原始内容
 * @param newContent 修改后内容
 * @param maxLines 最大显示行数，超出时仅保留变更附近上下文（默认 500）
 * @returns 差异信息
 */
export function computeDiff(oldContent: string, newContent: string, maxLines: number = DEFAULT_MAX_LINES): FileDiff {
  // 使用 diff 库计算行级差异
  const changes = diffLines(oldContent, newContent);

  const lines: DiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let addedCount = 0;
  let removedCount = 0;

  for (const change of changes) {
    const changeLines = change.value.split('\n');
    // 移除最后一个空行（split 会多出一个）
    if (changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    if (change.added) {
      // 添加的行
      for (const line of changeLines) {
        lines.push({
          oldLineNumber: null,
          newLineNumber: newLineNumber++,
          type: 'added',
          content: line,
        });
        addedCount++;
      }
    } else if (change.removed) {
      // 删除的行
      for (const line of changeLines) {
        lines.push({
          oldLineNumber: oldLineNumber++,
          newLineNumber: null,
          type: 'removed',
          content: line,
        });
        removedCount++;
      }
    } else {
      // 上下文行
      for (const line of changeLines) {
        lines.push({
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
          type: 'context',
          content: line,
        });
      }
    }
  }

  // 大文件裁剪：仅保留变更行附近上下文
  const trimmed = trimToChanges(lines, maxLines, addedCount + removedCount);

  return {
    oldContent,
    newContent,
    lines: trimmed.lines,
    addedCount,
    removedCount,
    truncated: trimmed.truncated,
    totalLines: lines.length,
  };
}

/**
 * 裁剪 diff 行列表，仅保留变更行附近的上下文
 */
function trimToChanges(lines: DiffLine[], maxLines: number, changeCount: number): { lines: DiffLine[]; truncated: boolean } {
  if (lines.length <= maxLines || changeCount === 0) {
    return { lines, truncated: false };
  }

  // 标记变更行索引
  const changeIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') {
      changeIndices.push(i);
    }
  }

  // 计算需要保留的索引范围（变更行前后各 CONTEXT_LINES 行）
  const keepRanges: [number, number][] = [];
  for (const idx of changeIndices) {
    const start = Math.max(0, idx - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, idx + CONTEXT_LINES);
    // 合并重叠范围
    if (keepRanges.length > 0 && start <= keepRanges[keepRanges.length - 1][1] + 1) {
      keepRanges[keepRanges.length - 1][1] = end;
    } else {
      keepRanges.push([start, end]);
    }
  }

  // 构建裁剪后的行列表，在范围间隙插入折叠标记
  const result: DiffLine[] = [];
  let lastEnd = -1;
  for (const [start, end] of keepRanges) {
    if (start > lastEnd + 1) {
      // 插入折叠标记（表示被省略的行数）
      const skipped = start - lastEnd - 1;
      result.push({
        oldLineNumber: null,
        newLineNumber: null,
        type: 'context',
        content: `⋯ ${skipped} lines folded ⋯`,
      });
    }
    for (let i = start; i <= end; i++) {
      result.push(lines[i]);
    }
    lastEnd = end;
  }
  // 尾部省略
  if (lastEnd < lines.length - 1) {
    result.push({
      oldLineNumber: null,
      newLineNumber: null,
      type: 'context',
      content: `⋯ ${lines.length - 1 - lastEnd} lines folded ⋯`,
    });
  }

  return { lines: result, truncated: true };
}

/**
 * 检查是否有差异
 */
export function hasChanges(diff: FileDiff): boolean {
  return diff.addedCount > 0 || diff.removedCount > 0;
}

/**
 * 获取差异摘要
 */
export function getDiffSummary(diff: FileDiff): string {
  const parts: string[] = [];
  if (diff.addedCount > 0) {
    parts.push(`+${diff.addedCount}`);
  }
  if (diff.removedCount > 0) {
    parts.push(`-${diff.removedCount}`);
  }
  if (parts.length === 0) {
    return '无变化';
  }
  return parts.join(' ');
}
