/**
 * IFlow Engine 导出
 *
 * IFlow CLI 的 AIEngine 实现。
 * 后端已统一处理事件转换，前端直接使用 AIEvent。
 */

export { IFlowEngine, createIFlowEngine, defaultIFlowEngine } from './engine'
export type { IFlowEngineConfig } from './engine'

export { IFlowSession, createIFlowSession } from './session'
export type { IFlowConfig } from './session'
