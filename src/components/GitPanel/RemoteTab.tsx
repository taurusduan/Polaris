/**
 * 远程仓库列表组件
 *
 * 显示远程仓库信息，支持刷新
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe,
  RefreshCw,
  Loader2,
  Cloud,
  CloudOff,
  ExternalLink,
  Copy,
} from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useToastStore } from '@/stores/toastStore'
import type { GitRemote } from '@/types/git'

export function RemoteTab() {
  const { t } = useTranslation('git')
  const [remotes, setRemotes] = useState<GitRemote[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getRemotes = useGitStore((s) => s.getRemotes)
  const branches = useGitStore((s) => s.branches)
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())
  const toast = useToastStore()

  const loadRemotes = useCallback(async () => {
    if (!currentWorkspace) return

    setIsLoading(true)
    setError(null)
    try {
      await getRemotes(currentWorkspace.path)
      // 从 store 获取更新后的 remotes
      const storeRemotes = useGitStore.getState().remotes
      setRemotes(storeRemotes)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      toast.error(t('errors.getRemotesFailed'), errorMsg)
    } finally {
      setIsLoading(false)
    }
  }, [currentWorkspace, getRemotes, toast])

  useEffect(() => {
    loadRemotes()
  }, [loadRemotes])

  // 计算每个远程仓库的分支数
  const getRemoteBranchCount = (remoteName: string) => {
    return branches.filter((b) => b.isRemote && b.name.startsWith(`${remoteName}/`)).length
  }

  // 提取域名用于显示图标
  const getHostFromUrl = (url?: string) => {
    if (!url) return null
    try {
      // 处理 SSH URL (git@github.com:user/repo.git)
      if (url.startsWith('git@')) {
        const match = url.match(/git@([^:]+):/)
        return match ? match[1] : null
      }
      // 处理 HTTPS URL
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return null
    }
  }

  // 复制 URL 到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('remote.copied'))
    } catch {
      toast.error(t('errors.copyFailed'))
    }
  }

  // 在浏览器中打开远程仓库
  const openRemoteUrl = (url?: string) => {
    if (!url) return
    let openUrl = url
    // 转换 SSH URL 为 HTTPS
    if (url.startsWith('git@')) {
      openUrl = url.replace('git@', 'https://').replace(':', '/').replace('.git', '')
    }
    // 移除 .git 后缀
    openUrl = openUrl.replace(/\.git$/, '')
    window.open(openUrl, '_blank')
  }

  const renderRemoteItem = (remote: GitRemote) => {
    const host = getHostFromUrl(remote.fetchUrl || remote.pushUrl)
    const branchCount = getRemoteBranchCount(remote.name)
    const displayUrl = remote.fetchUrl || remote.pushUrl || t('remote.noUrl')

    return (
      <div
        key={remote.name}
        className="w-full px-4 py-3 hover:bg-background-hover transition-colors border-b border-border-subtle group"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
            {host ? (
              <Cloud size={16} className="text-primary" />
            ) : (
              <Globe size={16} className="text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-text-primary">
                {remote.name}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-info/20 text-info rounded">
                {t('remote.remote')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-tertiary mb-1">
              <span className="font-mono truncate max-w-[200px]" title={displayUrl}>
                {displayUrl}
              </span>
              {remote.fetchUrl && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => copyToClipboard(remote.fetchUrl!)}
                    className="p-0.5 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-colors"
                    title={t('remote.copyUrl')}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => openRemoteUrl(remote.fetchUrl)}
                    className="p-0.5 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-colors"
                    title={t('remote.openInBrowser')}
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-text-tertiary">
              {branchCount > 0 && (
                <span className="flex items-center gap-1">
                  <Globe size={10} />
                  <span>{t('remote.branchCount', { count: branchCount })}</span>
                </span>
              )}
              {remote.pushUrl && remote.pushUrl !== remote.fetchUrl && (
                <span className="text-text-tertiary">
                  {t('remote.pushUrl')}: {remote.pushUrl}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {t('remote.title')}
          {remotes.length > 0 && (
            <span className="ml-2 text-xs text-text-tertiary">
              ({remotes.length})
            </span>
          )}
        </span>
        <button
          onClick={loadRemotes}
          disabled={isLoading}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-background-hover rounded transition-colors disabled:opacity-50"
          title={t('refresh', { ns: 'common' })}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-danger bg-danger/10 border-b border-danger/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && remotes.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : remotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <CloudOff size={24} className="mb-2 opacity-50" />
            <span className="text-sm">{t('remote.empty')}</span>
            <span className="text-xs mt-1 text-text-tertiary">{t('remote.emptyHint')}</span>
          </div>
        ) : (
          remotes.map((remote) => renderRemoteItem(remote))
        )}
      </div>
    </div>
  )
}
