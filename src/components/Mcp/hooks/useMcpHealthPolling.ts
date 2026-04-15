/**
 * MCP 健康检查轮询 Hook
 *
 * 仅在面板可见且类型为 mcp 时启动轮询
 * 默认 30 秒间隔调用 healthCheck
 */

import { useEffect, useRef } from 'react';
import { useMcpStore } from '../../../stores/mcpStore';

const POLL_INTERVAL_MS = 30_000;

export function useMcpHealthPolling(isVisible: boolean, panelType: string): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 仅在面板可见且类型为 mcp 时轮询
    const shouldPoll = isVisible && panelType === 'mcp';

    if (shouldPoll) {
      // 立即执行一次
      useMcpStore.getState().healthCheck();

      intervalRef.current = setInterval(() => {
        useMcpStore.getState().healthCheck();
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isVisible, panelType]);
}
