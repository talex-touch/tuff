/**
 * Agent Scheduler
 *
 * Priority-based task scheduling for agent execution.
 */

import type { AgentResult, AgentStatus, AgentTask, QueuedTask, SchedulerStats, TaskProgress } from '@talex-touch/utils'
import chalk from 'chalk'
import { EventEmitter } from 'node:events'

const TAG = chalk.hex('#9c27b0').bold('[AgentScheduler]')
const logInfo = (...args: any[]) => console.log(TAG, ...args)
const logDebug = (...args: any[]) => console.debug(TAG, chalk.gray(...args))

type TaskExecutor = (task: AgentTask) => Promise<AgentResult>

/**
 * Priority queue node
 */
interface QueueNode {
  task: AgentTask
  priority: number
  enqueuedAt: number
}

/**
 * Agent Scheduler - manages task queue and execution
 */
export class AgentScheduler extends EventEmitter {
  private queue: QueueNode[] = []
  private activeTasks: Map<string, { task: AgentTask, startedAt: number }> = new Map()
  private completedCount = 0
  private failedCount = 0
  private totalWaitTime = 0
  private totalExecutionTime = 0

  private maxConcurrent: number
  private isProcessing = false
  private executor: TaskExecutor | null = null

  constructor(maxConcurrent = 3) {
    super()
    this.maxConcurrent = maxConcurrent
  }

  /**
   * Set the task executor function
   */
  setExecutor(executor: TaskExecutor): void {
    this.executor = executor
  }

  /**
   * Enqueue a task for execution
   */
  enqueue(task: AgentTask): string {
    const taskId = task.id || this.generateTaskId()
    const taskWithId = { ...task, id: taskId }

    const node: QueueNode = {
      task: taskWithId,
      priority: task.priority || 5,
      enqueuedAt: Date.now(),
    }

    // Insert in priority order (lower number = higher priority)
    let inserted = false
    for (let i = 0; i < this.queue.length; i++) {
      if (node.priority < this.queue[i].priority) {
        this.queue.splice(i, 0, node)
        inserted = true
        break
      }
    }

    if (!inserted) {
      this.queue.push(node)
    }

    logDebug(`Enqueued task ${taskId} with priority ${node.priority}`)
    this.emit('task:queued', { taskId, priority: node.priority })

    // Start processing if not already
    this.processQueue()

    return taskId
  }

  /**
   * Dequeue the next task
   */
  private dequeue(): QueueNode | null {
    return this.queue.shift() || null
  }

  /**
   * Update task priority
   */
  updatePriority(taskId: string, priority: number): boolean {
    const index = this.queue.findIndex(n => n.task.id === taskId)
    if (index === -1) return false

    const node = this.queue.splice(index, 1)[0]
    node.priority = priority

    // Re-insert in priority order
    let inserted = false
    for (let i = 0; i < this.queue.length; i++) {
      if (node.priority < this.queue[i].priority) {
        this.queue.splice(i, 0, node)
        inserted = true
        break
      }
    }

    if (!inserted) {
      this.queue.push(node)
    }

    logDebug(`Updated priority for task ${taskId} to ${priority}`)
    return true
  }

  /**
   * Cancel a queued task
   */
  cancelQueued(taskId: string): boolean {
    const index = this.queue.findIndex(n => n.task.id === taskId)
    if (index === -1) return false

    this.queue.splice(index, 1)
    this.emit('task:cancelled', { taskId })
    return true
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return
    if (!this.executor) {
      console.warn(TAG, 'No executor set')
      return
    }

    this.isProcessing = true

    while (this.queue.length > 0 && this.activeTasks.size < this.maxConcurrent) {
      const node = this.dequeue()
      if (!node) break

      const { task, enqueuedAt } = node
      const taskId = task.id!
      const waitTime = Date.now() - enqueuedAt
      this.totalWaitTime += waitTime

      this.activeTasks.set(taskId, { task, startedAt: Date.now() })
      this.emit('task:started', { taskId, agentId: task.agentId })

      // Execute task asynchronously
      this.executeTask(task).catch((error) => {
        console.error(TAG, `Task ${taskId} failed:`, error)
      })
    }

    this.isProcessing = false
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: AgentTask): Promise<void> {
    const taskId = task.id!
    const startTime = Date.now()

    try {
      const result = await this.executor!(task)
      const executionTime = Date.now() - startTime
      this.totalExecutionTime += executionTime

      if (result.success) {
        this.completedCount++
        this.emit('task:completed', { taskId, result })
      }
      else {
        this.failedCount++
        this.emit('task:failed', { taskId, error: result.error })
      }
    }
    catch (error) {
      this.failedCount++
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit('task:failed', { taskId, error: errorMessage })
    }
    finally {
      this.activeTasks.delete(taskId)
      // Continue processing queue
      this.processQueue()
    }
  }

  /**
   * Report progress for a task
   */
  reportProgress(progress: TaskProgress): void {
    this.emit('task:progress', progress)
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): AgentStatus {
    if (this.activeTasks.has(taskId)) {
      return 'running' as AgentStatus
    }

    const queued = this.queue.find(n => n.task.id === taskId)
    if (queued) {
      return 'idle' as AgentStatus
    }

    return 'completed' as AgentStatus
  }

  /**
   * Get all queued tasks
   */
  getQueuedTasks(): QueuedTask[] {
    return this.queue.map(n => ({
      task: n.task,
      priority: n.priority,
      enqueuedAt: n.enqueuedAt,
      status: 'idle' as AgentStatus,
    }))
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): AgentTask[] {
    return Array.from(this.activeTasks.values()).map(a => a.task)
  }

  /**
   * Adjust max concurrency
   */
  adjustConcurrency(count: number): void {
    this.maxConcurrent = Math.max(1, Math.min(10, count))
    logInfo(`Adjusted concurrency to ${this.maxConcurrent}`)
    this.processQueue()
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    const totalTasks = this.completedCount + this.failedCount
    return {
      queueLength: this.queue.length,
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedCount,
      failedTasks: this.failedCount,
      averageWaitTime: totalTasks > 0 ? this.totalWaitTime / totalTasks : 0,
      averageExecutionTime: totalTasks > 0 ? this.totalExecutionTime / totalTasks : 0,
    }
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    const cancelled = this.queue.length
    this.queue = []
    logInfo(`Cleared ${cancelled} queued tasks`)
  }

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}

// Singleton instance
export const agentScheduler = new AgentScheduler()
