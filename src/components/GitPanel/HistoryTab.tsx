/**
 * 提交历史组件
 *
 * 显示 Git 提交历史列表，支持滚动加载更多
 * 初始加载20条，滚动到底部时自动加载更多
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommit, User, Clock, RefreshCw, ChevronRight, Loader2, ChevronDown } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore/index'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { GitCommit as GitCommitType } from '@/types/git'

const PAGE_SIZE = 20

interface HistoryTabProps {
  targetCommitSha?: string | null
  onCommitSelected?: () => void
}

export function HistoryTab({ targetCommitSha, onCommitSelected }: HistoryTabProps) {
  const { t } = useTranslation('git')
  const [commits, setCommits] = useState<GitCommitType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<GitCommitType | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const getLog = useGitStore((s) => s.getLog)
  const currentWorkspace = useWorkspaceStore((s) => {
    const { workspaces, currentWorkspaceId } = s
    return workspaces.find(w => w.id === currentWorkspaceId) || null
  })

  // 加载提交历史（初始）
  const loadCommits = useCallback(async () => {
    if (!currentWorkspace) {
      setError(t('errors.noWorkspace'))
      return
    }

    setIsLoading(true)
    setError(null)
    setHasMore(true)

    try {
      console.log('[HistoryTab] Loading commits from:', currentWorkspace.path)
      const result = await getLog(currentWorkspace.path, PAGE_SIZE, 0)
      console.log('[HistoryTab] Loaded commits:', result.length)

      if (result.length === 0) {
        setCommits([])
        setHasMore(false)
        setTotalCount(0)
      } else {
        setCommits(result)
        // 如果返回数量小于请求数量，说明没有更多了
        setHasMore(result.length === PAGE_SIZE)
        setTotalCount(result.length)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      console.error('[HistoryTab] Failed to load commits:', errorMsg)
    } finally {
      setIsLoading(false)
    }
  }, [currentWorkspace, getLog, t])

  // 加载更多提交
  const loadMoreCommits = useCallback(async () => {
    if (!currentWorkspace || isLoadingMore || !hasMore) return

    setIsLoadingMore(true)

    try {
      const skip = commits.length
      const result = await getLog(currentWorkspace.path, PAGE_SIZE, skip)

      if (result.length === 0) {
        setHasMore(false)
      } else {
        setCommits(prev => [...prev, ...result])
        setTotalCount(prev => prev + result.length)
        // 如果返回数量小于请求数量，说明没有更多了
        setHasMore(result.length === PAGE_SIZE)
      }
    } catch (err) {
      console.error('[HistoryTab] Failed to load more commits:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [currentWorkspace, commits.length, isLoadingMore, hasMore, getLog])

  // 滚动加载更多
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || isLoadingMore || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = container
    // 距离底部100px时加载更多
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMoreCommits()
    }
  }, [isLoadingMore, hasMore, loadMoreCommits])

  // 初始加载
  useEffect(() => {
    loadCommits()
  }, [loadCommits])

  // 处理从 Blame 跳转
  useEffect(() => {
    if (targetCommitSha && commits.length > 0) {
      const targetCommit = commits.find(c => c.sha === targetCommitSha || c.sha.startsWith(targetCommitSha))
      if (targetCommit) {
        setSelectedCommit(targetCommit)
        onCommitSelected?.()
      }
    }
  }, [targetCommitSha, commits, onCommitSelected])

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('history.justNow')
    if (diffMins < 60) return t('history.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('history.hoursAgo', { count: diffHours })
    if (diffDays < 7) return t('history.daysAgo', { count: diffDays })
    return date.toLocaleDateString()
  }

  // 手动刷新
  const handleRefresh = useCallback(() => {
    loadCommits()
  }, [loadCommits])

  return (
    <div className="flex flex-col min-h-0">
      {/* 标题栏 */}
      <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {t('history.title')}
          {totalCount > 0 && (
            <span className="ml-2 text-xs text-text-tertiary">({totalCount}+)</span>
          )}
        </span>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-background-hover rounded transition-colors disabled:opacity-50"
          title={t('refresh', { ns: 'common' })}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 text-xs text-danger bg-danger/10 border-b border-danger/20">
          {error}
        </div>
      )}

      {/* 提交列表 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <GitCommit size={24} className="mb-2 opacity-50" />
            <span className="text-sm">{t('history.noCommits')}</span>
          </div>
        ) : (
          <>
            {commits.map((commit) => (
              <div
                key={commit.sha}
                onClick={() => setSelectedCommit(commit)}
                className={`px-4 py-3 cursor-pointer hover:bg-background-hover transition-colors border-b border-border-subtle ${
                  selectedCommit?.sha === commit.sha ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <GitCommit size={12} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-text-tertiary bg-background-surface px-1.5 py-0.5 rounded">
                        {commit.shortSha}
                      </span>
                    </div>
                    <div className="text-sm text-text-primary font-medium truncate mb-1">
                      {commit.message.split('\n')[0]}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-tertiary">
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {commit.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatTime(commit.timestamp)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-text-tertiary flex-shrink-0" />
                </div>
              </div>
            ))}

            {/* 加载更多提示 */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-3 text-text-tertiary">
                <Loader2 size={14} className="animate-spin mr-2" />
                <span className="text-xs">加载更多...</span>
              </div>
            )}

            {hasMore && !isLoadingMore && (
              <div className="flex items-center justify-center py-3 text-text-tertiary">
                <ChevronDown className="w-4 h-4 animate-bounce mr-2" />
                <span className="text-xs">向下滚动加载更多</span>
              </div>
            )}

            {!hasMore && commits.length > 0 && (
              <div className="flex items-center justify-center py-3 text-text-tertiary">
                <span className="text-xs">已加载全部 {commits.length} 条提交</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 选中提交的详情 */}
      {selectedCommit && (
        <div className="border-t border-border-subtle p-4 bg-background-surface">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-text-tertiary">
              {selectedCommit.shortSha}
            </span>
            <button
              onClick={() => setSelectedCommit(null)}
              className="text-xs text-text-tertiary hover:text-text-primary"
            >
              {t('close', { ns: 'common' })}
            </button>
          </div>
          <div className="text-sm text-text-primary whitespace-pre-wrap">
            {selectedCommit.message}
          </div>
          <div className="mt-2 text-xs text-text-tertiary">
            {selectedCommit.author} · {formatTime(selectedCommit.timestamp)}
          </div>
        </div>
      )}
    </div>
  )
}
