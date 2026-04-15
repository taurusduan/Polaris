/**
 * MCP 管理器类型定义
 *
 * 与 Rust 后端 mcp_manager_service.rs 中的类型对齐
 */

/** MCP 服务器传输协议 */
export type McpTransport = 'stdio' | 'http'

/** MCP 配置作用域 (serde rename_all = "camelCase") */
export type McpScope = 'global' | 'project' | 'user'

/** 从配置文件中解析出的单个 MCP 服务器信息 */
export interface McpServerInfo {
  /** 服务器名称 */
  name: string
  /** 启动命令 (stdio) 或 URL (http)，对应 Rust 的 Option<String> */
  command: string | null
  /** 命令参数 */
  args: string[]
  /** 传输协议 */
  transport: McpTransport
  /** 配置来源作用域 */
  scope: McpScope
  /** 环境变量 */
  env: Record<string, string>
}

/** MCP 服务器健康状态 */
export interface McpHealthStatus {
  /** 服务器名称 */
  name: string
  /** 是否已连接 */
  connected: boolean
  /** 状态文本 (如 "Connected"、"Needs authentication") */
  status: string
  /** 传输协议 */
  transport: McpTransport | null
  /** 启动命令 */
  command: string | null
}

/** 聚合了配置信息和健康状态的完整服务器视图 */
export interface McpServerAggregate {
  /** 服务器名称 */
  name: string
  /** 配置来源列表 (可能出现在多个配置文件中) */
  configs: McpServerInfo[]
  /** 运行时健康状态 (如果已检查) */
  health: McpHealthStatus | null
}

/** MCP 状态过滤器 */
export type McpStatusFilter = 'all' | 'connected' | 'needsAuth' | 'disconnected'
