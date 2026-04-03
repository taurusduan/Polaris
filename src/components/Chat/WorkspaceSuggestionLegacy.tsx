/**
 * 旧版工作区建议组件 - 保留用于向后兼容
 */

import { useEffect, useRef } from 'react';
import type { Workspace } from '../../types';

export interface WorkspaceSuggestionProps {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  selectedIndex: number;
  onSelect: (workspace: Workspace) => void;
  onHover: (index: number) => void;
  position: { top: number; left: number };
}

export function WorkspaceSuggestion({
  workspaces,
  currentWorkspaceId,
  selectedIndex,
  onSelect,
  onHover,
  position,
}: WorkspaceSuggestionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const selectedEl = containerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 bg-background-surface border border-border rounded-lg shadow-lg max-h-60 overflow-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '250px',
        maxWidth: '350px',
      }}
    >
      <div className="px-3 py-2 text-xs text-text-tertiary border-b border-border">
        工作区
      </div>
      {workspaces.map((workspace, index) => {
        const isCurrent = workspace.id === currentWorkspaceId;

        return (
          <div
            key={workspace.id}
            className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-sm ${
              index === selectedIndex
                ? 'bg-primary/20 text-text-primary'
                : 'text-text-secondary hover:bg-background-hover'
            }`}
            onClick={() => onSelect(workspace)}
            onMouseEnter={() => onHover(index)}
          >
            {/* 工作区指示点 */}
            <span className="shrink-0">
              {isCurrent ? (
                <span className="w-2 h-2 rounded-full bg-primary" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-primary/50" />
              )}
            </span>

            {/* 工作区名 */}
            <span className="flex-1 truncate font-medium">
              {workspace.name}
            </span>

            {/* 当前工作区标签 */}
            {isCurrent && (
              <span className="text-xs text-text-tertiary bg-background-elevated px-1.5 py-0.5 rounded shrink-0">
                当前
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
