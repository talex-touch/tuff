/**
 * Intelligence Agents Module
 *
 * Provides intelligent automation capabilities built on IntelligenceSDK.
 */

export * from './agent-registry'
export * from './agent-scheduler'
export * from './agent-executor'
export * from './agent-manager'
export * from './tool-registry'
export * from './agent-channels'

// Re-export main singletons for convenience
export { agentManager } from './agent-manager'
export { agentRegistry } from './agent-registry'
export { agentScheduler } from './agent-scheduler'
export { agentExecutor } from './agent-executor'
export { toolRegistry } from './tool-registry'

// Tools
export { registerBuiltinTools } from './tools'

// Built-in Agents
export { registerBuiltinAgents, registerDataAgent, registerFileAgent, registerSearchAgent } from './builtin'
