/**
 * Tab Store
 *
 * 管理 Tab 状态,用于中间编辑区的 Tab 切换
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GitDiffEntry } from '@/types/git'

/** Tab 类型 */
export type TabType = 'editor' | 'diff' | 'preview' | 'webview'

/** Tab 数据结构 */
export interface Tab {
  id: string
  type: TabType
  title: string
  closable: boolean
  // Editor Tab 数据
  filePath?: string
  // Diff Tab 数据
  diffData?: GitDiffEntry
  // Webview Tab 数据
  url?: string
  // 其他元数据
  metadata?: Record<string, any>
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
}

interface TabActions {
  // Tab 操作
  openEditorTab: (filePath: string, title?: string) => string
  openDiffTab: (diff: GitDiffEntry) => string
  openWebviewTab: (url: string, title?: string) => Promise<string>
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  closeAllTabs: () => void
  closeOtherTabs: (tabId: string) => void

  // 获取操作
  getActiveTab: () => Tab | null
  getTabById: (id: string) => Tab | undefined
}

export type TabStore = TabState & TabActions

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      // 初始状态
      tabs: [],
      activeTabId: null,

      // 打开 Editor Tab
      openEditorTab: (filePath: string, title?: string) => {
        const tabId = `editor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const newTab: Tab = {
          id: tabId,
          type: 'editor',
          title: title || filePath.split('/').pop() || filePath,
          closable: true,
          filePath,
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: tabId,
        }))

        return tabId
      },

      // 打开 Diff Tab
      openDiffTab: (diff: GitDiffEntry) => {
        // 检查是否已存在相同文件的 Diff Tab
        const existingTab = get().tabs.find(
          (tab) => tab.type === 'diff' && tab.diffData?.file_path === diff.file_path
        )

        if (existingTab) {
          // 如果已存在,更新 diffData 并切换到该 Tab
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === existingTab.id
                ? { ...tab, diffData: diff }
                : tab
            ),
            activeTabId: existingTab.id,
          }))
          return existingTab.id
        }

        // 否则创建新 Tab
        const tabId = `diff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const fileName = diff.file_path.split('/').pop() || diff.file_path
        const newTab: Tab = {
          id: tabId,
          type: 'diff',
          title: `${fileName} (Diff)`,
          closable: true,
          diffData: diff,
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: tabId,
        }))

        return tabId
      },

      // 打开 Webview Tab
      openWebviewTab: async (url: string, title?: string) => {
        // 检查是否已存在相同 URL 的 Webview Tab
        const existingTab = get().tabs.find(
          (tab) => tab.type === 'webview' && tab.url === url
        )

        if (existingTab) {
          // 如果已存在,切换到该 Tab
          set({ activeTabId: existingTab.id })
          return existingTab.id
        }

        // 否则创建新 Tab
        const tabId = `webview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

        // 提取标题
        const tabTitle = title || extractDomainTitle(url)

        const newTab: Tab = {
          id: tabId,
          type: 'webview',
          title: tabTitle,
          closable: true,
          url,
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: tabId,
        }))

        return tabId
      },

      // 关闭 Tab
      closeTab: (tabId: string) => {
        set((state) => {
          const newTabs = state.tabs.filter((tab) => tab.id !== tabId)

          // 如果关闭的是当前激活的 Tab,需要切换到另一个 Tab
          let newActiveTabId = state.activeTabId
          if (state.activeTabId === tabId) {
            if (newTabs.length > 0) {
              // 尝试切换到相邻的 Tab
              const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId)
              newActiveTabId =
                newTabs[closedIndex >= newTabs.length ? newTabs.length - 1 : closedIndex].id
            } else {
              newActiveTabId = null
            }
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          }
        })
      },

      // 切换 Tab
      switchTab: (tabId: string) => {
        set({ activeTabId: tabId })
      },

      // 关闭所有 Tab
      closeAllTabs: () => {
        set({
          tabs: [],
          activeTabId: null,
        })
      },

      // 关闭其他 Tab
      closeOtherTabs: (tabId: string) => {
        set((state) => ({
          tabs: state.tabs.filter((tab) => tab.id === tabId),
          activeTabId: tabId,
        }))
      },

      // 获取当前激活的 Tab
      getActiveTab: () => {
        const state = get()
        return state.tabs.find((tab) => tab.id === state.activeTabId) || null
      },

      // 根据 ID 获取 Tab
      getTabById: (id: string) => {
        return get().tabs.find((tab) => tab.id === id)
      },
    }),
    {
      name: 'tab-store',
      // 只持久化 Tab 列表,不持久化激活状态(每次打开可能不同)
      partialize: (state) => ({
        tabs: state.tabs,
      }),
    }
  )
)

/** 从 URL 提取标题 */
function extractDomainTitle(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    // 搜索引擎特殊处理
    if (host.includes('google.')) return 'Google 搜索'
    if (host.includes('baidu.')) return '百度搜索'
    if (host.includes('bing.')) return 'Bing 搜索'
    if (host.includes('github.')) return 'GitHub'
    if (host.includes('stackoverflow.')) return 'Stack Overflow'

    return host
  } catch {
    return '网页'
  }
}

/** Webview Tab 信息（与 Rust 端对应） */
export interface WebviewTabInfo {
  id: string
  url: string
  title: string
}
