/**
 * Intelligence Agents Module
 *
 * Provides intelligent automation capabilities built on IntelligenceSDK.
 */

export * from './agent-channels'
export * from './agent-manager'
// Re-export main singletons for convenience
export { agentManager } from './agent-manager'
export * from './agent-registry'

export { agentRegistry } from './agent-registry'
// Built-in Agents
export {
  registerBuiltinAgents,
  registerDataAgent,
  registerFileAgent,
  registerSearchAgent,
  registerWorkflowAgent
} from './builtin'
// Memory & Context
export * from './memory'

export * from './tool-registry'

export { toolRegistry } from './tool-registry'

// Tools
export { registerBuiltinTools } from './tools'
