/**
 * Markdown 编辑器组件
 * 支持编辑/预览/分屏模式切换，代码语法高亮，Mermaid 图表渲染
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { CodeMirrorEditor } from './Editor';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { MermaidDiagram } from '../Chat/MermaidDiagram';
import { splitMarkdownWithMermaid } from '../../utils/markdown';
import hljs from 'highlight.js';

interface MarkdownEditorProps {
  /** 编辑器内容 */
  value: string;
  /** 内容变化回调 */
  onChange: (value: string) => void;
  /** 保存回调 */
  onSave?: () => void;
  /** 只读模式 */
  readOnly?: boolean;
}

/** 视图模式 */
type ViewMode = 'edit' | 'preview' | 'split';

// 配置 marked
marked.setOptions({
  breaks: true,  // 支持 GFM 换行
  gfm: true,     // GitHub Flavored Markdown
});

/** Markdown 渲染（marked + DOMPurify） */
function formatContent(content: string): string {
  try {
    const raw = marked.parse(content) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
        'hr', 'img', 'input', 'del', 'sup', 'sub',
      ],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'align', 'src', 'alt', 'title', 'id', 'type', 'checked', 'disabled'],
    });
  } catch {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
}

export function MarkdownEditor({ value, onChange, onSave, readOnly = false }: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // 预览渲染
  const previewParts = useMemo(() => splitMarkdownWithMermaid(value), [value]);

  // 代码块语法高亮
  useEffect(() => {
    if (viewMode === 'edit' || !previewRef.current) return;
    previewRef.current.querySelectorAll('pre code').forEach((block) => {
      const el = block as HTMLElement;
      if (!el.dataset.highlighted) {
        hljs.highlightElement(el);
      }
    });
  }, [previewParts, viewMode]);

  // 分隔条拖拽
  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(0.75, Math.max(0.25, ratio)));
    };
    const handleMouseUp = () => {
      setIsDraggingSplit(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit]);

  const handleSplitDragStart = useCallback(() => {
    setIsDraggingSplit(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const showEditor = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle bg-background-elevated">
        <div className="flex items-center gap-0.5 bg-background-base rounded-md p-0.5">
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'split'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
            onClick={() => setViewMode('split')}
            title="分屏模式"
          >
            分屏
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'edit'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
            onClick={() => setViewMode('edit')}
            title="编辑模式"
          >
            编辑
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'preview'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
            onClick={() => setViewMode('preview')}
            title="预览模式"
          >
            预览
          </button>
        </div>

        <div className="flex-1" />
      </div>

      {/* 内容区域 */}
      <div ref={containerRef} className="flex-1 overflow-hidden flex">
        {/* 编辑面板 */}
        {showEditor && (
          <div
            className="overflow-hidden"
            style={viewMode === 'split' ? { width: `${splitRatio * 100}%` } : { flex: 1 }}
          >
            <CodeMirrorEditor
              value={value}
              language="markdown"
              onChange={onChange}
              onSave={onSave}
              readOnly={readOnly}
            />
          </div>
        )}

        {/* 分隔条 */}
        {viewMode === 'split' && (
          <div
            className={`w-[3px] cursor-col-resize flex-shrink-0 transition-colors ${
              isDraggingSplit ? 'bg-primary' : 'bg-border-subtle/40 hover:bg-primary/60'
            }`}
            onMouseDown={handleSplitDragStart}
          />
        )}

        {/* 预览面板 */}
        {showPreview && (
          <div
            ref={previewRef}
            className="overflow-auto bg-background-base"
            style={viewMode === 'split' ? { width: `${(1 - splitRatio) * 100}%` } : { flex: 1 }}
          >
            <div className="max-w-none px-6 py-4 prose prose-invert prose-sm">
              {previewParts.map((part: any, index: number) => {
                if (part.type === 'mermaid') {
                  return (
                    <div key={`mermaid-${part.id || index}`}>
                      <MermaidDiagram
                        code={part.content}
                        id={part.id || `mermaid-${index}`}
                      />
                    </div>
                  );
                }
                const html = formatContent(part.content);
                return (
                  <div
                    key={`text-${index}`}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
