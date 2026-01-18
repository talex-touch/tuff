/**
 * Intelligence Agents Module
 *
 * Provides intelligent automation capabilities built on IntelligenceSDK.
 */

export * from './agent-channels'
export * from './agent-executor'
export { agentExecutor } from './agent-executor'
export * from './agent-manager'
// Re-export main singletons for convenience
export { agentManager } from './agent-manager'
export * from './agent-registry'

export { agentRegistry } from './agent-registry'
export * from './agent-scheduler'
export { agentScheduler } from './agent-scheduler'
// Built-in Agents
export {
  registerBuiltinAgents,
  registerDataAgent,
  registerFileAgent,
  registerSearchAgent,
  registerWorkflowAgent
} from './builtin'
export * from './tool-registry'

export { toolRegistry } from './tool-registry'

// Tools
export { registerBuiltinTools } from './tools'

// Memory & Context
export * from './memory'
