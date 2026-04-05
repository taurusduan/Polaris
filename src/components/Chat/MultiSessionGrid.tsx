/**
 * MultiSessionGrid 组件 - 多会话窗口网格布局
 *
 * 功能：
 * - 自适应布局：1-4 个会话格子
 * - 共享输入框：点击格子切换活跃会话
 * - 会话管理：关闭格子
 *
 * 布局规则：
 * - 1 个会话：全屏显示
 * - 2 个会话：左右各 50%
 * - 3 个会话：左 2 右 1（左侧上下各 50%，右侧全高）
 * - 4 个会话：2x2 网格
 */

import { memo, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { LayoutGrid, Square } from 'lucide-react';
import { SessionCell } from './SessionCell';
import { useViewStore } from '../../stores';
import {
  useSessionMetadataList,
  useActiveSessionId,
} from '../../stores/conversationStore/sessionStoreManager';

/**
 * MultiSessionGrid 组件
 */
export const MultiSessionGrid = memo(function MultiSessionGrid() {
  const multiSessionIds = useViewStore(state => state.multiSessionIds);
  const multiSessionMode = useViewStore(state => state.multiSessionMode);
  const expandSessionId = useViewStore(state => state.expandSessionId);
  const setExpandSessionId = useViewStore(state => state.setExpandSessionId);
  const activeSessionId = useActiveSessionId();

  // 获取所有会话元数据
  const allSessionMetadata = useSessionMetadataList();

  // 过滤出多窗口中显示的会话
  const displaySessions = useMemo(() => {
    return multiSessionIds
      .map(id => allSessionMetadata.find(m => m.id === id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);
  }, [multiSessionIds, allSessionMetadata]);

  // 计算布局类名
  const layoutClass = useMemo(() => {
    const count = displaySessions.length;
    switch (count) {
      case 1:
        return 'grid-cols-1 grid-rows-1';
      case 2:
        return 'grid-cols-2 grid-rows-1';
      case 3:
        return 'grid-cols-2 grid-rows-2';
      case 4:
        return 'grid-cols-2 grid-rows-2';
      default:
        return 'grid-cols-2 grid-rows-2';
    }
  }, [displaySessions.length]);

  // 展开切换回调
  const handleToggleExpand = useCallback((sessionId: string) => {
    setExpandSessionId(expandSessionId === sessionId ? null : sessionId);
  }, [expandSessionId, setExpandSessionId]);

  // 如果未开启多会话模式，返回 null
  if (!multiSessionMode) {
    return null;
  }

  // 展开模式：只显示展开的会话
  if (expandSessionId) {
    const expandedSession = allSessionMetadata.find(m => m.id === expandSessionId);
    if (!expandedSession) {
      setExpandSessionId(null);
      return null;
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 p-1">
          <SessionCell
            sessionId={expandSessionId}
            isActive={true}
            isExpanded={true}
            onToggleExpand={() => setExpandSessionId(null)}
          />
        </div>
      </div>
    );
  }

  // 空状态：引导添加会话
  if (displaySessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <LayoutGrid className="w-12 h-12 text-text-muted mb-4" />
        <p className="text-text-secondary text-sm mb-4">多会话窗口模式</p>
        <p className="text-text-muted text-xs mb-4">使用状态栏上的按钮新建会话</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 网格区域 */}
      <div className={clsx('flex-1 grid gap-1 p-1', layoutClass)}>
        {displaySessions.map((session, index) => {
          // 3 个会话时，第三个格子跨两行
          const isThird = displaySessions.length === 3 && index === 2;
          const gridSpan = isThird ? 'row-span-2' : '';

          return (
            <div key={session.id} className={gridSpan}>
              <SessionCell
                sessionId={session.id}
                isActive={session.id === activeSessionId}
                onToggleExpand={() => handleToggleExpand(session.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * 多会话模式切换按钮
 */
export const MultiSessionToggle = memo(function MultiSessionToggle() {
  const multiSessionMode = useViewStore(state => state.multiSessionMode);
  const toggleMultiSessionMode = useViewStore(state => state.toggleMultiSessionMode);
  const setMultiSessionIds = useViewStore(state => state.setMultiSessionIds);
  const activeSessionId = useActiveSessionId();

  const handleToggle = useCallback(() => {
    if (!multiSessionMode && activeSessionId) {
      // 开启多会话模式时，将当前活跃会话添加到多窗口
      setMultiSessionIds([activeSessionId]);
    }
    toggleMultiSessionMode();
  }, [multiSessionMode, activeSessionId, toggleMultiSessionMode, setMultiSessionIds]);

  return (
    <button
      onClick={handleToggle}
      className={clsx(
        'p-1.5 rounded transition-colors',
        multiSessionMode
          ? 'bg-primary text-white'
          : 'text-text-muted hover:text-text-primary hover:bg-background-hover'
      )}
      title={multiSessionMode ? '切换单会话模式' : '切换多会话模式'}
    >
      <Square className="w-4 h-4" />
    </button>
  );
});
