/**
 * Git Store
 *
 * Git 操作的状态管理
 *
 * @deprecated 请使用 gitStore/index.ts 中的模块化结构
 * 本文件保留用于向后兼容，重新导出 slice 模块
 */

// 重新导出 slice 模块
export { useGitStore, parseGitError } from './gitStore/index'
export type {
  GitState,
  StatusState,
  StatusActions,
  BranchState,
  BranchActions,
  RemoteState,
  RemoteActions,
  TagState,
  TagActions,
  CommitState,
  CommitActions,
  StashState,
  StashActions,
  AdvancedActions,
  PRState,
  PRActions,
  GitignoreActions,
  UtilityActions,
} from './gitStore/types'