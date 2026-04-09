/**
 * 文件快速搜索模态框 — Shift+Ctrl+R 触发
 *
 * 功能：
 * - 模态搜索框，输入文件名即时过滤
 * - 键盘导航（↑↓ 选择，Enter 打开，Escape 关闭）
 * - 基于已加载文件树的快速过滤 + 可选深度搜索
 * - 选中文件后打开编辑器 Tab 并定位
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { FileIcon } from '../FileExplorer/FileIcon';
import { useFileExplorerStore, useFileEditorStore } from '../../stores';
import { Search, Loader2 } from 'lucide-react';
import type { FileInfo } from '../../types';

interface FileSearchModalProps {
  onClose: () => void;
}

/** 递归收集已加载文件树中的所有文件 */
function collectAllFiles(nodes: FileInfo[]): FileInfo[] {
  const results: FileInfo[] = [];
  for (const node of nodes) {
    if (!node.is_dir) {
      results.push(node);
    }
    if (node.children) {
      results.push(...collectAllFiles(node.children));
    }
  }
  return results;
}

/** 获取相对于工作区根的路径 */
function getRelativePath(fullPath: string, basePath: string): string {
  const normalizedBase = basePath.replace(/\\/g, '/');
  const normalizedFull = fullPath.replace(/\\/g, '/');
  if (normalizedFull.startsWith(normalizedBase + '/')) {
    return normalizedFull.slice(normalizedBase.length + 1);
  }
  if (normalizedFull.startsWith(normalizedBase)) {
    return normalizedFull.slice(normalizedBase.length);
  }
  return fullPath;
}

/** 提取目录部分 */
function getDirectoryPath(relativePath: string): string {
  const lastSep = relativePath.lastIndexOf('/');
  return lastSep >= 0 ? relativePath.substring(0, lastSep) : '';
}

/** 计算匹配得分（用于排序） */
function matchScore(name: string, query: string): number {
  const lower = name.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 4;          // 完全匹配
  if (lower.startsWith(q)) return 3;  // 前缀匹配
  if (lower.endsWith(q)) return 2;    // 后缀匹配
  // 检查驼峰/下划线/短横线首字母匹配
  const parts = lower.split(/[._\-]/);
  if (parts.some(p => p.startsWith(q))) return 1;
  return 0;                           // 包含匹配
}

/** 高亮匹配文本 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const MAX_RESULTS = 50;

export function FileSearchModal({ onClose }: FileSearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deepResults, setDeepResults] = useState<FileInfo[] | null>(null);
  const [isDeepSearching, setIsDeepSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const deepSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deepSearchAbort = useRef<AbortController | null>(null);

  const { file_tree, current_path, deep_search } = useFileExplorerStore();
  const openFile = useFileEditorStore(s => s.openFile);

  // 从已加载的文件树中收集所有文件
  const loadedFiles = useMemo(
    () => collectAllFiles(file_tree),
    [file_tree]
  );

  // 过滤并排序结果
  const results = useMemo(() => {
    const source = deepResults ?? loadedFiles;
    if (!query.trim()) return source.slice(0, MAX_RESULTS);

    const q = query.toLowerCase().trim();
    return source
      .filter(f => f.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const scoreA = matchScore(a.name, q);
        const scoreB = matchScore(b.name, q);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_RESULTS);
  }, [loadedFiles, deepResults, query]);

  // 查询变更时重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  // 自动聚焦输入框
  useEffect(() => {
    // 延迟一帧以确保 DOM 已挂载
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  // 滚动选中项到可见区域
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-file-item]');
    const selected = items[selectedIndex] as HTMLElement;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // 深度搜索：输入停止 300ms 后始终触发（覆盖未展开目录中的文件）
  useEffect(() => {
    clearTimeout(deepSearchTimer.current);
    deepSearchAbort.current?.abort();
    deepSearchAbort.current = null;

    const q = query.trim();
    if (!q) {
      setDeepResults(null);
      setIsDeepSearching(false);
      return;
    }

    deepSearchTimer.current = setTimeout(async () => {
      setIsDeepSearching(true);
      const abort = new AbortController();
      deepSearchAbort.current = abort;

      try {
        const results = await deep_search(q);
        if (!abort.signal.aborted) {
          setDeepResults(results);
        }
      } catch {
        // 搜索被取消或失败，忽略
      } finally {
        if (!abort.signal.aborted) {
          setIsDeepSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(deepSearchTimer.current);
    };
  }, [query, deep_search]);

  // 选中文件：打开编辑器并关闭模态框
  const handleSelect = useCallback((file: FileInfo) => {
    openFile(file.path, file.name);
    onClose();
  }, [openFile, onClose]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, handleSelect, onClose]);

  // 点击背景关闭
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[12vh]"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-background-elevated rounded-xl w-full max-w-lg border border-border shadow-glow overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索文件名..."
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary focus:outline-none text-sm"
            spellCheck={false}
          />
          {isDeepSearching && (
            <Loader2 className="w-4 h-4 text-text-tertiary animate-spin flex-shrink-0" />
          )}
          <kbd className="text-[10px] text-text-tertiary bg-background-surface px-1.5 py-0.5 rounded border border-border font-mono">
            Esc
          </kbd>
        </div>

        {/* 结果列表 */}
        <div ref={listRef} className="max-h-[40vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
              <Search className="w-6 h-6 mb-2 opacity-50" />
              <div className="text-sm">
                {query.trim() ? '未找到匹配的文件' : '工作区无文件'}
              </div>
            </div>
          ) : (
            results.map((file, index) => {
              const relPath = getRelativePath(file.path, current_path);
              const dirPath = getDirectoryPath(relPath);
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={file.path}
                  data-file-item
                  className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-text-primary'
                      : 'text-text-primary hover:bg-background-hover'
                  }`}
                  onClick={() => handleSelect(file)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <FileIcon file={file} className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-sm truncate">
                      <HighlightMatch text={file.name} query={query} />
                    </span>
                    {dirPath && (
                      <span className="text-xs text-text-tertiary truncate flex-shrink min-w-0">
                        {dirPath}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-1.5 border-t border-border text-[10px] text-text-tertiary flex items-center gap-3">
          <span>↑↓ 导航</span>
          <span>↵ 打开</span>
          <span>Esc 关闭</span>
          {deepResults !== null && (
            <span className="ml-auto">深度搜索: {deepResults.length} 个结果</span>
          )}
        </div>
      </div>
    </div>
  );
}
