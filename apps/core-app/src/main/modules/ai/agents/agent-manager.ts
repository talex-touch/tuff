/**
 * Agent Manager
 *
 * Central manager for the Intelligence Agents system.
 * Coordinates registry, scheduler, executor, and tool management.
 */

import type {
  AgentDescriptor,
  AgentMessage,
  AgentPlan,
  AgentResult,
  AgentStatus,
  AgentTask,
  AgentTool,
  TaskProgress
} from '@talex-touch/utils'
import type { AgentExecutor, IntelligenceSDKInterface } from './agent-executor'
import type { AgentImpl, AgentRegistry } from './agent-registry'
import type { AgentScheduler } from './agent-scheduler'
import type { ToolExecutorFn, ToolRegistry } from './tool-registry'
import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { agentExecutor } from './agent-executor'
import { agentRegistry } from './agent-registry'
import { agentScheduler } from './agent-scheduler'
import { toolRegistry } from './tool-registry'

const TAG = chalk.hex('#9c27b0').bold('[AgentManager]')
const logInfo = (...args: unknown[]) => console.log(TAG, ...args)
const logWarn = (...args: unknown[]) =>
  console.warn(TAG, chalk.yellow(...args.map((arg) => String(arg))))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAgentMessage(value: unknown): value is AgentMessage {
  if (!isRecord(value)) return false

  const role = value.role
  const content = value.content

  return (
    (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') &&
    typeof content === 'string'
  )
}

/**
 * Agent Manager configuration
 */
export interface AgentManagerConfig {
  maxConcurrentTasks?: number
  defaultTimeout?: number
  enableTracing?: boolean
}

/**
 * Agent Manager - central coordination for the agent system
 */
export class AgentManager extends EventEmitter {
  private registry: AgentRegistry
  private scheduler: AgentScheduler
  private executor: AgentExecutor
  private tools: ToolRegistry
  private initialized = false

  constructor(config: AgentManagerConfig = {}) {
    super()

    // Use singleton instances
    this.registry = agentRegistry
    this.scheduler = agentScheduler
    this.executor = agentExecutor
    this.tools = toolRegistry

    // Configure scheduler
    if (config.maxConcurrentTasks) {
      this.scheduler.adjustConcurrency(config.maxConcurrentTasks)
    }

    // Set executor dependencies
    this.executor.setToolRegistry(this.tools)

    // Forward scheduler events
    this.setupEventForwarding()
  }

  /**
   * Initialize the agent manager
   */
  async init(intelligenceSDK: IntelligenceSDKInterface): Promise<void> {
    if (this.initialized) {
      logWarn('AgentManager already initialized')
      return
    }

    // Set IntelligenceSDK
    this.executor.setIntelligenceSDK(intelligenceSDK)

    // Set scheduler executor
    this.scheduler.setExecutor((task) => this.executor.executeTask(task))

    this.initialized = true
    logInfo('AgentManager initialized')
  }

  /**
   * Setup event forwarding from scheduler
   */
  private setupEventForwarding(): void {
    this.scheduler.on('task:started', (data) => {
      this.emit('task:started', data)
    })

    this.scheduler.on('task:progress', (data) => {
      this.emit('task:progress', data)
    })

    this.scheduler.on('task:completed', (data) => {
      this.emit('task:completed', data)
    })

    this.scheduler.on('task:failed', (data) => {
      this.emit('task:failed', data)
    })

    this.scheduler.on('task:cancelled', (data) => {
      this.emit('task:cancelled', data)
    })
  }

  // ============================================================================
  // Agent Registration
  // ============================================================================

  /**
   * Register an agent
   */
  registerAgent(descriptor: AgentDescriptor, impl: AgentImpl): void {
    this.registry.registerAgent(descriptor, impl)
    this.emit('agent:registered', { agentId: descriptor.id })
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    const result = this.registry.unregisterAgent(agentId)
    if (result) {
      this.emit('agent:unregistered', { agentId })
    }
    return result
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentDescriptor | null {
    return this.registry.getDescriptor(agentId)
  }

  /**
   * Get all available agents
   */
  getAvailableAgents(): AgentDescriptor[] {
    return this.registry.getEnabledAgents()
  }

  /**
   * Get all agents (including disabled)
   */
  getAllAgents(): AgentDescriptor[] {
    return this.registry.getAllDescriptors()
  }

  // ============================================================================
  // Task Execution
  // ============================================================================

  /**
   * Execute a task (queued execution)
   */
  async executeTask(task: AgentTask): Promise<string> {
    if (!this.initialized) {
      throw new Error('AgentManager not initialized')
    }

    // Validate agent exists
    if (!this.registry.hasAgent(task.agentId)) {
      throw new Error(`Agent ${task.agentId} not found`)
    }

    // Enqueue task
    const taskId = this.scheduler.enqueue(task)
    return taskId
  }

  /**
   * Execute a task immediately (bypass queue)
   */
  async executeTaskImmediate(task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) {
      throw new Error('AgentManager not initialized')
    }

    return this.executor.executeTask(task)
  }

  /**
   * Generate execution plan for a task
   */
  async planTask(task: AgentTask): Promise<AgentPlan> {
    if (!this.initialized) {
      throw new Error('AgentManager not initialized')
    }

    const planTask: AgentTask = {
      ...task,
      type: 'plan'
    }

    const result = await this.executor.executeTask(planTask)

    if (!result.success) {
      throw new Error(result.error || 'Plan generation failed')
    }

    return result.output as AgentPlan
  }

  /**
   * Stream chat with an agent
   */
  async *chat(agentId: string, messages: unknown[]): AsyncGenerator<string> {
    if (!this.initialized) {
      throw new Error('AgentManager not initialized')
    }

    const agent = this.registry.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    if (agent.impl.chat) {
      const context = {
        taskId: `chat_${Date.now()}`,
        sessionId: undefined
      }
      yield* agent.impl.chat(messages, context)
    } else {
      // Fallback to execute
      const agentMessages = messages.filter(isAgentMessage)
      const result = await this.executeTaskImmediate({
        agentId,
        type: 'chat',
        input: messages,
        context: agentMessages.length > 0 ? { messages: agentMessages } : undefined
      })

      if (result.success && result.output) {
        yield String(result.output)
      }
    }
  }

  // ============================================================================
  // Task Status
  // ============================================================================

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): AgentStatus {
    return this.scheduler.getTaskStatus(taskId)
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    // Try to cancel from queue first
    if (this.scheduler.cancelQueued(taskId)) {
      return true
    }

    // Otherwise try to abort running task
    return this.executor.cancelTask(taskId)
  }

  /**
   * Update task priority
   */
  updateTaskPriority(taskId: string, priority: number): boolean {
    return this.scheduler.updatePriority(taskId, priority)
  }

  // ============================================================================
  // Tool Management
  // ============================================================================

  /**
   * Register a tool
   */
  registerTool(definition: AgentTool, executor: ToolExecutorFn): void {
    this.tools.registerTool(definition, executor)
    this.emit('tool:registered', { toolId: definition.id })
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolId: string): boolean {
    const result = this.tools.unregisterTool(toolId)
    if (result) {
      this.emit('tool:unregistered', { toolId })
    }
    return result
  }

  /**
   * Get all tools
   */
  getTools(): AgentTool[] {
    return this.tools.getAllTools()
  }

  /**
   * Get tool by ID
   */
  getTool(toolId: string): AgentTool | null {
    return this.tools.getTool(toolId)
  }

  // ============================================================================
  // Statistics & Info
  // ============================================================================

  /**
   * Get manager statistics
   */
  getStats(): {
    agents: ReturnType<AgentRegistry['getStats']>
    scheduler: ReturnType<AgentScheduler['getStats']>
    tools: ReturnType<ToolRegistry['getStats']>
  } {
    return {
      agents: this.registry.getStats(),
      scheduler: this.scheduler.getStats(),
      tools: this.tools.getStats()
    }
  }

  /**
   * Report progress for a task
   */
  reportProgress(progress: TaskProgress): void {
    this.scheduler.reportProgress(progress)
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    logInfo('Shutting down AgentManager')

    // Clear scheduler queue
    this.scheduler.clearQueue()

    // Clear registries
    this.registry.clear()
    this.tools.clear()

    this.initialized = false
    logInfo('AgentManager shutdown complete')
  }
}

// Singleton instance
export const agentManager = new AgentManager()
