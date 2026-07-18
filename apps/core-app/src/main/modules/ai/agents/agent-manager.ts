/**
 * Agent Manager
 *
 * Central facade for Agent profiles, tools, and the Pi-backed task runtime.
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
import type { AgentImpl, AgentRegistry, AgentRegistryStats } from './agent-registry'
import type { ToolExecutorFn, ToolRegistry, ToolRegistryStats } from './tool-registry'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createLogger } from '../../../utils/logger'
import { agentRegistry } from './agent-registry'
import { toolRegistry } from './tool-registry'

const agentManagerLog = createLogger('Intelligence').child('AgentManager')
const formatLogArgs = (args: unknown[]): string => args.map((arg) => String(arg)).join(' ')
const logInfo = (...args: unknown[]) => agentManagerLog.info(formatLogArgs(args))
const logWarn = (...args: unknown[]) => agentManagerLog.warn(formatLogArgs(args))

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

export interface AgentRuntimeStats {
  queueLength: 0
  activeTasks: number
  completedTasks: number
  failedTasks: number
  averageWaitTime: 0
  averageExecutionTime: number
}

export interface AgentManagerStats {
  agents: AgentRegistryStats
  runtime: AgentRuntimeStats
  tools: ToolRegistryStats
}

/**
 * Agent Manager - central coordination for the agent system
 */
export class AgentManager extends EventEmitter {
  private registry: AgentRegistry
  private tools: ToolRegistry
  private initialized = false
  private taskExecutor: ((task: AgentTask) => Promise<AgentResult>) | null = null
  private taskCanceller: ((taskId: string) => boolean) | null = null
  private readonly activeTaskIds = new Set<string>()
  private completedTaskCount = 0
  private failedTaskCount = 0
  private totalExecutionTime = 0

  setTaskRuntime(
    executor: (task: AgentTask) => Promise<AgentResult>,
    cancel: (taskId: string) => boolean
  ): void {
    this.taskExecutor = executor
    this.taskCanceller = cancel
  }

  private executeWithRuntime(task: AgentTask): Promise<AgentResult> {
    if (!this.taskExecutor) {
      throw new Error('Agent task runtime is not configured')
    }
    return this.taskExecutor(task)
  }

  constructor() {
    super()
    this.registry = agentRegistry
    this.tools = toolRegistry
  }

  /**
   * Initialize the agent manager
   */
  async init(_legacyIntelligenceSdk?: unknown): Promise<void> {
    if (this.initialized) {
      logWarn('AgentManager already initialized')
      return
    }

    this.initialized = true
    logInfo('AgentManager initialized')
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
   * Submit a task directly to the Pi-backed runtime.
   */
  async executeTask(task: AgentTask): Promise<string> {
    if (!this.initialized) throw new Error('AgentManager not initialized')
    if (!this.registry.hasAgent(task.agentId)) throw new Error(`Agent ${task.agentId} not found`)

    const taskId = task.id || `task_${randomUUID()}`
    const runtimeTask: AgentTask = { ...task, id: taskId }
    const startedAt = Date.now()
    this.activeTaskIds.add(taskId)
    this.emit('task:started', { taskId, agentId: task.agentId })
    void Promise.resolve()
      .then(() => this.executeWithRuntime(runtimeTask))
      .then((result) => {
        if (result.success) {
          this.completedTaskCount += 1
          this.emit('task:completed', { taskId, result })
        } else {
          this.failedTaskCount += 1
          this.emit('task:failed', { taskId, error: result.error })
        }
      })
      .catch((error) => {
        this.failedTaskCount += 1
        this.emit('task:failed', {
          taskId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        this.totalExecutionTime += Date.now() - startedAt
        this.activeTaskIds.delete(taskId)
      })
    return taskId
  }

  /**
   * Execute a task immediately (bypass queue)
   */
  async executeTaskImmediate(task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) {
      throw new Error('AgentManager not initialized')
    }

    return this.executeWithRuntime(task)
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

    const result = await this.executeWithRuntime(planTask)

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

    if (!this.registry.getAgent(agentId)) {
      throw new Error(`Agent ${agentId} not found`)
    }

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

  // ============================================================================
  // Task Status
  // ============================================================================

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): AgentStatus {
    return (this.activeTaskIds.has(taskId) ? 'running' : 'completed') as AgentStatus
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const cancelled = this.taskCanceller?.(taskId) ?? false
    if (cancelled) {
      this.activeTaskIds.delete(taskId)
      this.emit('task:cancelled', { taskId })
    }
    return cancelled
  }

  /**
   * Update task priority
   */
  updateTaskPriority(_taskId: string, _priority: number): boolean {
    return false
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
  getStats(): AgentManagerStats {
    const completed = this.completedTaskCount + this.failedTaskCount
    return {
      agents: this.registry.getStats(),
      runtime: {
        queueLength: 0,
        activeTasks: this.activeTaskIds.size,
        completedTasks: this.completedTaskCount,
        failedTasks: this.failedTaskCount,
        averageWaitTime: 0,
        averageExecutionTime: completed > 0 ? this.totalExecutionTime / completed : 0
      },
      tools: this.tools.getStats()
    }
  }

  /**
   * Report progress for a task
   */
  reportProgress(progress: TaskProgress): void {
    this.emit('task:progress', progress)
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

    for (const taskId of this.activeTaskIds) this.taskCanceller?.(taskId)
    this.activeTaskIds.clear()
    // Clear registries
    this.registry.clear()
    this.tools.clear()
    this.taskExecutor = null
    this.taskCanceller = null

    this.initialized = false
    logInfo('AgentManager shutdown complete')
  }
}

// Singleton instance
export const agentManager = new AgentManager()
