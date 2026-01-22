import { EventEmitter } from 'node:events'
import { performance } from 'node:perf_hooks'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { fileProviderLog, formatDuration } from '../utils/logger'

/**
 * Background task interface
 */
export interface BackgroundTask {
  /** Task unique identifier */
  id: string
  /** Task name */
  name: string
  /** Task execution function */
  execute: () => Promise<void>
  /** Task priority */
  priority: 'low' | 'normal' | 'high'
  /** Estimated execution time in milliseconds */
  estimatedDuration?: number
  /** Whether the task can be interrupted */
  canInterrupt?: boolean
}

/**
 * User activity tracker interface
 */
export interface UserActivityTracker {
  /** Check if user is active */
  isActive: () => boolean
  /** Get last activity time */
  getLastActivityTime: () => number
  /** Reset activity state */
  resetActivity: () => void
}

/**
 * Background task service configuration options
 */
export interface BackgroundTaskServiceOptions {
  /** User idle threshold in milliseconds */
  idleThresholdMs: number
  /** Check interval in milliseconds */
  checkIntervalMs: number
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number
  /** Task timeout in milliseconds */
  taskTimeoutMs: number
}

export class BackgroundTaskService extends EventEmitter {
  private static instance: BackgroundTaskService | null = null
  private static readonly pollingTaskId = 'background-task.check'
  private static readonly pollingService = PollingService.getInstance()
  private readonly tasks = new Map<string, BackgroundTask>()
  private readonly runningTasks = new Set<string>()
  private readonly taskQueue: string[] = []
  private readonly options: BackgroundTaskServiceOptions
  private readonly activityTracker: UserActivityTracker
  private isRunning = false
  private lastActivityTime = Date.now()

  private constructor(
    activityTracker: UserActivityTracker,
    options: Partial<BackgroundTaskServiceOptions> = {}
  ) {
    super()
    this.activityTracker = activityTracker
    this.options = {
      idleThresholdMs: 60 * 60 * 1000,
      checkIntervalMs: 5 * 60 * 1000,
      maxConcurrentTasks: 2,
      taskTimeoutMs: 30 * 60 * 1000,
      ...options
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    activityTracker?: UserActivityTracker,
    options?: Partial<BackgroundTaskServiceOptions>
  ): BackgroundTaskService {
    if (!BackgroundTaskService.instance) {
      if (!activityTracker) {
        throw new Error('ActivityTracker is required for first initialization')
      }
      BackgroundTaskService.instance = new BackgroundTaskService(activityTracker, options)
    }
    return BackgroundTaskService.instance
  }

  /**
   * Register background task
   */
  registerTask(task: BackgroundTask): void {
    this.tasks.set(task.id, task)
    this.logInfo(`Registered background task: ${task.name}`)
    this.emit('taskRegistered', task)
  }

  /**
   * Unregister background task
   */
  unregisterTask(taskId: string): void {
    if (this.tasks.has(taskId)) {
      this.tasks.delete(taskId)
      this.logInfo(`Unregistered background task: ${taskId}`)
      this.emit('taskUnregistered', taskId)
    }
  }

  /**
   * Start background task service
   */
  start(): void {
    if (this.isRunning) {
      this.logWarn('Background task service is already running')
      return
    }

    this.isRunning = true
    this.lastActivityTime = Date.now()

    this.logInfo('Starting background task service', {
      idleThreshold: formatDuration(this.options.idleThresholdMs),
      checkInterval: formatDuration(this.options.checkIntervalMs),
      maxConcurrentTasks: this.options.maxConcurrentTasks
    })

    BackgroundTaskService.pollingService.register(
      BackgroundTaskService.pollingTaskId,
      () => this.checkAndExecuteTasks(),
      { interval: this.options.checkIntervalMs, unit: 'milliseconds' }
    )
    BackgroundTaskService.pollingService.start()

    this.emit('serviceStarted')
  }

  /**
   * Stop background task service
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    BackgroundTaskService.pollingService.unregister(BackgroundTaskService.pollingTaskId)

    this.logInfo('Stopping background task service')
    this.emit('serviceStopped')
  }

  /**
   * Record user activity
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now()
    this.activityTracker.resetActivity()

    if (this.runningTasks.size > 0) {
      this.logInfo('User activity detected, stopping background tasks')
      this.stopRunningTasks()
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      registeredTasks: this.tasks.size,
      runningTasks: this.runningTasks.size,
      queuedTasks: this.taskQueue.length,
      lastActivityTime: this.lastActivityTime,
      isUserIdle: this.isUserIdle()
    }
  }

  private isUserIdle(): boolean {
    const now = Date.now()
    const timeSinceLastActivity = now - this.lastActivityTime
    return timeSinceLastActivity >= this.options.idleThresholdMs
  }

  private async checkAndExecuteTasks(): Promise<void> {
    if (!this.isRunning) return

    const isIdle = this.isUserIdle()
    const canExecuteMore = this.runningTasks.size < this.options.maxConcurrentTasks

    if (isIdle && canExecuteMore && this.taskQueue.length > 0) {
      const taskId = this.taskQueue.shift()
      if (taskId) {
        await this.executeTask(taskId)
      }
    }

    if (isIdle && this.taskQueue.length === 0 && this.runningTasks.size === 0) {
      this.queueAllTasks()
    }
  }

  private queueAllTasks(): void {
    const sortedTasks = Array.from(this.tasks.values()).sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    for (const task of sortedTasks) {
      if (!this.runningTasks.has(task.id) && !this.taskQueue.includes(task.id)) {
        this.taskQueue.push(task.id)
      }
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logWarn(`Task not found: ${taskId}`)
      return
    }

    this.runningTasks.add(taskId)
    this.logDebug(`Starting background task: ${task.name}`)

    const startTime = performance.now()
    const timeoutId = setTimeout(() => {
      this.logWarn(`Task timeout: ${task.name}`)
      this.emit('taskTimeout', task)
    }, this.options.taskTimeoutMs)

    try {
      await task.execute()
      const duration = performance.now() - startTime
      this.logDebug(`Completed background task: ${task.name}`, {
        duration: formatDuration(duration)
      })
      this.emit('taskCompleted', { task, duration })
    } catch (error) {
      const duration = performance.now() - startTime
      this.logError(`Background task failed: ${task.name}`, error as Error)
      this.emit('taskFailed', { task, error, duration })
    } finally {
      clearTimeout(timeoutId)
      this.runningTasks.delete(taskId)
    }
  }

  private stopRunningTasks(): void {
    for (const taskId of this.runningTasks) {
      const task = this.tasks.get(taskId)
      if (task?.canInterrupt) {
        this.logInfo(`Stopping interruptible task: ${task.name}`)
        this.emit('taskInterrupted', task)
      }
    }
    this.runningTasks.clear()
  }

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    fileProviderLog.info(`[BackgroundTaskService] ${message}`, meta)
  }

  private logWarn(message: string, meta?: Record<string, unknown>): void {
    fileProviderLog.warn(`[BackgroundTaskService] ${message}`, meta)
  }

  private logError(message: string, error?: unknown): void {
    if (error) {
      fileProviderLog.error(`[BackgroundTaskService] ${message}`, error)
    } else {
      fileProviderLog.error(`[BackgroundTaskService] ${message}`)
    }
  }

  private logDebug(message: string, meta?: Record<string, unknown>): void {
    fileProviderLog.debug(`[BackgroundTaskService] ${message}`, meta)
  }
}

/**
 * 基于应用使用情况的用户活动跟踪器
 */
export class AppUsageActivityTracker implements UserActivityTracker {
  private static instance: AppUsageActivityTracker | null = null
  private lastActivityTime = Date.now()
  private isCurrentlyActive = false

  private constructor() {
    this.setupActivityListeners()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AppUsageActivityTracker {
    if (!AppUsageActivityTracker.instance) {
      AppUsageActivityTracker.instance = new AppUsageActivityTracker()
    }
    return AppUsageActivityTracker.instance
  }

  private setupActivityListeners(): void {}

  isActive(): boolean {
    return this.isCurrentlyActive
  }

  getLastActivityTime(): number {
    return this.lastActivityTime
  }

  resetActivity(): void {
    this.lastActivityTime = Date.now()
    this.isCurrentlyActive = true
  }

  /**
   * Mark user as inactive
   */
  markInactive(): void {
    this.isCurrentlyActive = false
  }
}
