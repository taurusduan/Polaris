/**
 * MCP 管理器状态管理
 *
 * 管理 MCP 服务器列表、健康检查和 UI 状态
 */

import { create } from 'zustand'
import type {
  McpServerAggregate,
  McpStatusFilter,
  McpScope,
  McpTransport,
} from '../types/mcp'
import * as mcpService from '../services/mcpService'
import { createLogger } from '../utils/logger'
import { useToastStore } from './toastStore'

const log = createLogger('McpStore')

interface McpState {
  /** MCP 服务器聚合列表 */
  servers: McpServerAggregate[]
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null
  /** 是否已初始化 */
  initialized: boolean
  /** 上次健康检查时间 */
  lastHealthCheck: string | null
  /** 状态过滤 */
  statusFilter: McpStatusFilter
  /** 展开的服务器名称 */
  expandedServer: string | null
  /** 操作中的服务器名称 */
  operatingServer: string | null

  // Actions

  /** 首次加载 */
  init: (workspacePath: string) => Promise<void>
  /** 完整刷新 */
  refreshAll: (workspacePath: string) => Promise<void>
  /** 仅刷新健康状态 */
  healthCheck: () => Promise<void>
  /** 获取单个服务器详情 */
  getServerDetail: (name: string, workspacePath: string) => Promise<void>
  /** 设置状态过滤 */
  setStatusFilter: (filter: McpStatusFilter) => void
  /** 展开/折叠服务器卡片 */
  toggleExpand: (name: string) => void
  /** 清除错误 */
  clearError: () => void

  // 写操作
  /** 添加服务器 */
  addServer: (name: string, command: string, args: string[], transport: McpTransport, scope: McpScope, workspacePath: string) => Promise<boolean>
  /** 移除服务器 */
  removeServer: (name: string, scope?: string, workspacePath?: string) => Promise<boolean>
  /** 启动认证 */
  startAuth: (name: string, url: string, scope: string) => Promise<boolean>
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  initialized: false,
  lastHealthCheck: null,
  statusFilter: 'all',
  expandedServer: null,
  operatingServer: null,

  init: async (workspacePath: string) => {
    const { initialized } = get()
    if (initialized) return

    try {
      set({ loading: true, error: null })
      const servers = await mcpService.mcpListServers(workspacePath)
      set({ servers, loading: false, initialized: true })
    } catch (err) {
      log.error('初始化 MCP 数据失败', err instanceof Error ? err : new Error(String(err)))
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  refreshAll: async (workspacePath: string) => {
    try {
      set({ loading: true, error: null })
      const servers = await mcpService.mcpListServers(workspacePath)
      set({ servers, loading: false, initialized: true })
    } catch (err) {
      log.error('刷新 MCP 数据失败', err instanceof Error ? err : new Error(String(err)))
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  healthCheck: async () => {
    try {
      set({ error: null })
      const healthList = await mcpService.mcpHealthCheck()
      const healthMap = new Map(healthList.map((h) => [h.name, h]))

      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          health: healthMap.get(server.name) ?? server.health,
        })),
        lastHealthCheck: new Date().toISOString(),
      }))
    } catch (err) {
      log.error('MCP 健康检查失败', err instanceof Error ? err : new Error(String(err)))
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  getServerDetail: async (name: string, workspacePath: string) => {
    try {
      set({ error: null })
      const detail = await mcpService.mcpGetServer(name, workspacePath)
      set((state) => ({
        servers: state.servers.map((server) =>
          server.name === name ? detail : server
        ),
      }))
    } catch (err) {
      log.error('获取 MCP 服务器详情失败', err instanceof Error ? err : new Error(String(err)))
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  setStatusFilter: (filter: McpStatusFilter) => {
    set({ statusFilter: filter })
  },

  toggleExpand: (name: string) => {
    set((state) => ({
      expandedServer: state.expandedServer === name ? null : name,
    }))
  },

  clearError: () => {
    set({ error: null })
  },

  addServer: async (name: string, command: string, args: string[], transport: McpTransport, scope: McpScope, workspacePath: string) => {
    const toast = useToastStore.getState()
    try {
      set({ operatingServer: name, error: null })
      await mcpService.mcpAddServer(name, command, args, transport, scope)
      await get().refreshAll(workspacePath)
      toast.success(`MCP 服务器 "${name}" 添加成功`)
      set({ operatingServer: null })
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('添加 MCP 服务器失败', err instanceof Error ? err : new Error(msg))
      toast.error(`添加失败: ${msg}`)
      set({ error: msg, operatingServer: null })
      return false
    }
  },

  removeServer: async (name: string, scope?: string, workspacePath?: string) => {
    const toast = useToastStore.getState()
    try {
      set({ operatingServer: name, error: null })
      await mcpService.mcpRemoveServer(name, scope)
      if (workspacePath) {
        await get().refreshAll(workspacePath)
      }
      toast.success(`MCP 服务器 "${name}" 已移除`)
      set({ operatingServer: null, expandedServer: null })
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('移除 MCP 服务器失败', err instanceof Error ? err : new Error(msg))
      toast.error(`移除失败: ${msg}`)
      set({ error: msg, operatingServer: null })
      return false
    }
  },

  startAuth: async (name: string, url: string, scope: string) => {
    const toast = useToastStore.getState()
    try {
      set({ operatingServer: name, error: null })
      await mcpService.mcpStartAuth(name, url, scope)
      toast.success(`认证流程已启动，请在浏览器中完成`)
      set({ operatingServer: null })
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('启动认证失败', err instanceof Error ? err : new Error(msg))
      toast.error(`认证启动失败: ${msg}`)
      set({ error: msg, operatingServer: null })
      return false
    }
  },
}))
