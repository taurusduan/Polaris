/**
 * 服务模块索引
 *
 * 导出所有历史服务
 */

// Claude Code 历史服务
export {
  getClaudeCodeHistoryService,
  ClaudeCodeHistoryService,
  type ClaudeCodeSessionMeta,
  type ClaudeCodeMessage,
} from './claudeCodeHistoryService'

// IFlow 历史服务
export {
  getIFlowHistoryService,
  IFlowHistoryService,
  type IFlowSessionMeta,
  type IFlowHistoryMessage,
  type IFlowToolCall,
  type IFlowFileContext,
  type IFlowTokenStats,
} from './iflowHistoryService'

// Codex 历史服务
export {
  getCodexHistoryService,
  CodexHistoryService,
  type CodexSessionMeta,
  type CodexHistoryMessage,
  type CodexToolCall,
} from './codexHistoryService'

// 统一历史服务
export {
  getUnifiedHistoryService,
  UnifiedHistoryService,
  type ProviderType,
  type UnifiedSessionMeta,
  type ProviderStats,
} from './unifiedHistoryService'
