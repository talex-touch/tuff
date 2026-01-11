/* eslint-disable no-console */
/**
 * @module polling
 * A high-precision, efficient, singleton polling service for scheduling periodic tasks.
 * This service uses a dynamic setTimeout approach, ensuring tasks are executed
 * with high accuracy while minimizing CPU usage and battery consumption.
 */

interface PollingTask {
  id: string
  callback: () => void | Promise<void>
  intervalMs: number
  nextRunMs: number
}

type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours'

export class PollingService {
  private static instance: PollingService
  private tasks = new Map<string, PollingTask>()
  private timerId: NodeJS.Timeout | null = null
  private isRunning = false
  private quitListenerCleanup?: () => void
  private activeTasks = new Set<string>()
  private taskStats = new Map<
    string,
    {
      count: number
      lastStartAt: number
      lastEndAt: number
      lastDurationMs: number
      maxDurationMs: number
    }
  >()

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): PollingService {
    if (!PollingService.instance) {
      PollingService.instance = new PollingService()
    }
    return PollingService.instance
  }

  private convertToMs(interval: number, unit: TimeUnit): number {
    switch (unit) {
      case 'milliseconds':
        return interval
      case 'seconds':
        return interval * 1000
      case 'minutes':
        return interval * 60 * 1000
      case 'hours':
        return interval * 60 * 60 * 1000
      default:
        throw new Error(`Invalid time unit: ${unit}`)
    }
  }

  /**
   * Registers a new periodic task with the service.
   * @param id - A unique identifier for the task.
   * @param callback - The function to be executed.
   * @param options - The execution interval.
   */
  public register(
    id: string,
    callback: () => void | Promise<void>,
    options: {
      interval: number
      unit: TimeUnit
      runImmediately?: boolean
      initialDelayMs?: number
    },
  ): void {
    if (this.tasks.has(id)) {
      console.warn(`[PollingService] Task with ID '${id}' is already registered. Overwriting.`)
    }

    const intervalMs = this.convertToMs(options.interval, options.unit)
    if (intervalMs <= 0) {
      console.error(`[PollingService] Task '${id}' has an invalid interval of ${intervalMs}ms. Registration aborted.`)
      return
    }

    const now = Date.now()
    const nextRunMs = options.runImmediately
      ? now
      : typeof options.initialDelayMs === 'number'
        ? now + Math.max(0, options.initialDelayMs)
        : now + intervalMs

    this.tasks.set(id, {
      id,
      callback,
      intervalMs,
      nextRunMs,
    })

    console.debug(`[PollingService] Task '${id}' registered to run every ${options.interval} ${options.unit}.`)

    if (this.isRunning) {
      this._reschedule()
    }
  }

  /**
   * Unregisters a task, preventing it from being executed in the future.
   * @param id - The unique identifier of the task to remove.
   */
  public unregister(id: string): void {
    if (this.tasks.delete(id)) {
      console.log(`[PollingService] Task '${id}' unregistered.`)
      if (this.isRunning) {
        this._reschedule()
      }
    }
    else {
      console.warn(`[PollingService] Attempted to unregister a non-existent task with ID '${id}'.`)
    }
  }

  /**
   * Checks if a task is already registered.
   * @param id - The unique identifier of the task.
   * @returns - True if the task is registered, false otherwise.
   */
  public isRegistered(id: string): boolean {
    return this.tasks.has(id)
  }

  /**
   * Starts the polling service.
   * It's safe to call this method multiple times.
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('[PollingService] Already running, skipping start.')
      return
    }
    this.isRunning = true
    console.log('[PollingService] Polling service started')
    this._setupQuitListener()
    this._reschedule()
  }

  /**
   * Sets up Electron app quit listener if running in Electron environment
   * Uses lazy resolution to avoid hard dependency on Electron
   */
  private _setupQuitListener(): void {
    // Check if we're in Electron environment
    try {
      // Use dynamic require to avoid hard dependency on Electron
      // Similar to the approach used in packages/utils/plugin/channel.ts
      const electron = (globalThis as any)?.electron
        ?? (typeof require !== 'undefined' ? require('electron') : null)

      if (electron?.app) {
        const app = electron.app

        // Listen to before-quit event
        const quitHandler = () => {
          this.stop('app quit')
        }

        app.on('before-quit', quitHandler)

        // Store cleanup function
        this.quitListenerCleanup = () => {
          app.removeListener('before-quit', quitHandler)
        }
      }
    }
    catch (error) {
      // Not in Electron environment or Electron not available
      // This is fine, just skip the quit listener setup
    }
  }

  /**
   * Stops the polling service and clears all scheduled tasks.
   * @param reason - Optional reason for stopping the service (for logging purposes)
   */
  public stop(reason?: string): void {
    if (!this.isRunning) {
      return
    }
    this.isRunning = false
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }

    // Clean up quit listener
    if (this.quitListenerCleanup) {
      this.quitListenerCleanup()
      this.quitListenerCleanup = undefined
    }

    if (reason) {
      console.log(`[PollingService] Stopping polling service: ${reason}`)
    }
    else {
      console.log('[PollingService] Polling service stopped')
    }
  }

  private _reschedule(): void {
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }

    if (!this.isRunning || this.tasks.size === 0) {
      return
    }

    const now = Date.now()
    const nextTask = Array.from(this.tasks.values()).reduce((prev, curr) =>
      prev.nextRunMs < curr.nextRunMs ? prev : curr,
    )

    const delay = Math.max(0, nextTask.nextRunMs - now)
    this.timerId = setTimeout(() => this._tick(), delay)
  }

  private async _tick(): Promise<void> {
    const now = Date.now()
    const tasksToRun: PollingTask[] = []

    for (const task of this.tasks.values()) {
      if (task.nextRunMs <= now) {
        tasksToRun.push(task)
      }
    }

    if (tasksToRun.length > 0) {
      // console.debug(`[PollingService] Executing ${tasksToRun.length} tasks.`);
      for (const task of tasksToRun) {
        const startAt = Date.now()
        this.activeTasks.add(task.id)
        try {
          await task.callback()
        }
        catch (error) {
          console.error(`[PollingService] Error executing task '${task.id}':`, error)
        }
        finally {
          const endAt = Date.now()
          const durationMs = Math.max(0, endAt - startAt)
          const stats = this.taskStats.get(task.id) ?? {
            count: 0,
            lastStartAt: 0,
            lastEndAt: 0,
            lastDurationMs: 0,
            maxDurationMs: 0,
          }
          stats.count += 1
          stats.lastStartAt = startAt
          stats.lastEndAt = endAt
          stats.lastDurationMs = durationMs
          stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs)
          this.taskStats.set(task.id, stats)
          this.activeTasks.delete(task.id)
        }
        // Update next run time based on its last scheduled run time, not 'now'.
        // This prevents drift if a task takes a long time to execute.
        task.nextRunMs += task.intervalMs
      }
    }

    this._reschedule()
  }

  public getDiagnostics(): {
    activeTasks: string[]
    recentTasks: Array<{
      id: string
      lastDurationMs: number
      lastEndAt: number
      count: number
      maxDurationMs: number
    }>
  } {
    const recentTasks = Array.from(this.taskStats.entries())
      .map(([id, stat]) => ({
        id,
        lastDurationMs: stat.lastDurationMs,
        lastEndAt: stat.lastEndAt,
        count: stat.count,
        maxDurationMs: stat.maxDurationMs,
      }))
      .sort((a, b) => b.lastEndAt - a.lastEndAt)
      .slice(0, 6)

    return {
      activeTasks: Array.from(this.activeTasks),
      recentTasks,
    }
  }
}

export const pollingService = PollingService.getInstance()
