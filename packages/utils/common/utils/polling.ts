/**
 * @module polling
 * A high-precision, efficient, singleton polling service for scheduling periodic tasks.
 *
 * v2 capabilities:
 * - Lane-based concurrency isolation (`critical` / `realtime` / `io` / `maintenance` / `legacy_serial`)
 * - Backpressure semantics (`strict_fifo` / `latest_wins` / `coalesce`)
 * - Optional timeout and jitter controls
 *
 * Backward compatibility:
 * - Existing callsites without new options keep legacy behavior (`legacy_serial` + `strict_fifo`)
 */

type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours'
export type PollingTaskLane =
  | 'critical'
  | 'realtime'
  | 'io'
  | 'maintenance'
  | 'legacy_serial'

export type PollingTaskBackpressure = 'strict_fifo' | 'latest_wins' | 'coalesce'

const DEFAULT_LANE_CONCURRENCY: Record<PollingTaskLane, number> = {
  critical: 3,
  realtime: 2,
  io: 4,
  maintenance: 2,
  legacy_serial: 1
}

interface PollingTask {
  id: string
  callback: () => void | Promise<void>
  intervalMs: number
  nextRunMs: number
  lane: PollingTaskLane
  backpressure: PollingTaskBackpressure
  dedupeKey: string
  maxInFlight: number
  timeoutMs?: number
  jitterMs: number
}

interface QueuedTask {
  task: PollingTask
  dueAt: number
  enqueuedAt: number
  dedupeKey: string
  sequence: number
}

interface LaneState {
  queue: QueuedTask[]
  inFlight: number
  pendingByDedupe: Map<string, QueuedTask>
}

type PollingTaskStats = {
  count: number
  lastStartAt: number
  lastEndAt: number
  lastDurationMs: number
  maxDurationMs: number
  lastSchedulerDelayMs: number
  maxSchedulerDelayMs: number
  droppedCount: number
  coalescedCount: number
  timeoutCount: number
  errorCount: number
  lastMeta?: Record<string, unknown>
}

interface ActiveTaskState {
  runId: string
  taskId: string
  startedAt: number
  dueAt: number
  enqueuedAt: number
  lane: PollingTaskLane
}

function createDefaultStats(): PollingTaskStats {
  return {
    count: 0,
    lastStartAt: 0,
    lastEndAt: 0,
    lastDurationMs: 0,
    maxDurationMs: 0,
    lastSchedulerDelayMs: 0,
    maxSchedulerDelayMs: 0,
    droppedCount: 0,
    coalescedCount: 0,
    timeoutCount: 0,
    errorCount: 0
  }
}

export class PollingService {
  private static instance: PollingService
  private tasks = new Map<string, PollingTask>()
  private timerId: NodeJS.Timeout | null = null
  private isRunning = false
  private quitListenerCleanup?: () => void
  private activeTasks = new Map<string, ActiveTaskState>()
  private startAttempts = new Map<string, { count: number, lastAt: number }>()
  private taskStats = new Map<string, PollingTaskStats>()
  private taskInFlightCount = new Map<string, number>()
  private runSequence = 0
  private queueSequence = 0

  private laneStates = new Map<PollingTaskLane, LaneState>([
    ['critical', { queue: [], inFlight: 0, pendingByDedupe: new Map() }],
    ['realtime', { queue: [], inFlight: 0, pendingByDedupe: new Map() }],
    ['io', { queue: [], inFlight: 0, pendingByDedupe: new Map() }],
    ['maintenance', { queue: [], inFlight: 0, pendingByDedupe: new Map() }],
    ['legacy_serial', { queue: [], inFlight: 0, pendingByDedupe: new Map() }]
  ])

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

  private sanitizeLane(value: unknown): PollingTaskLane {
    if (
      value === 'critical' ||
      value === 'realtime' ||
      value === 'io' ||
      value === 'maintenance' ||
      value === 'legacy_serial'
    ) {
      return value
    }
    return 'legacy_serial'
  }

  private sanitizeBackpressure(value: unknown): PollingTaskBackpressure {
    if (value === 'latest_wins' || value === 'coalesce' || value === 'strict_fifo') {
      return value
    }
    return 'strict_fifo'
  }

  private randomJitter(jitterMs: number): number {
    if (!Number.isFinite(jitterMs) || jitterMs <= 0) return 0
    return Math.floor(Math.random() * (Math.floor(jitterMs) + 1))
  }

  private computeNextRunMs(task: PollingTask, now: number): number {
    // Skip catch-up bursts after pauses/sleep: schedule from "now" if already overdue.
    let next = task.nextRunMs + task.intervalMs
    if (next <= now) {
      next = now + task.intervalMs
    }
    return next + this.randomJitter(task.jitterMs)
  }

  private getLaneState(lane: PollingTaskLane): LaneState {
    return this.laneStates.get(lane) ?? this.laneStates.get('legacy_serial')!
  }

  private ensureTaskStats(taskId: string): PollingTaskStats {
    const existing = this.taskStats.get(taskId)
    if (existing) return existing
    const created = createDefaultStats()
    this.taskStats.set(taskId, created)
    return created
  }

  /**
   * Registers a new periodic task with the service.
   * @param id - A unique identifier for the task.
   * @param callback - The function to be executed.
   * @param options - The execution interval and advanced scheduling options.
   */
  public register(
    id: string,
    callback: () => void | Promise<void>,
    options: {
      interval: number
      unit: TimeUnit
      runImmediately?: boolean
      initialDelayMs?: number
      lane?: PollingTaskLane
      backpressure?: PollingTaskBackpressure
      dedupeKey?: string
      maxInFlight?: number
      timeoutMs?: number
      jitterMs?: number
    }
  ): void {
    if (this.tasks.has(id)) {
      if (this.shouldVerboseLog()) {
        console.warn(`[PollingService] Task with ID '${id}' is already registered. Overwriting.`)
      }
      // Clear pending queue items for old registration.
      this.removeQueuedEntriesByTaskId(id)
    }

    const intervalMs = this.convertToMs(options.interval, options.unit)
    if (intervalMs <= 0) {
      console.error(
        `[PollingService] Task '${id}' has an invalid interval of ${intervalMs}ms. Registration aborted.`
      )
      return
    }

    const lane = this.sanitizeLane(options.lane)
    const backpressure = this.sanitizeBackpressure(options.backpressure)
    const maxInFlight = Math.max(1, Math.floor(options.maxInFlight ?? 1))
    const jitterMs = Math.max(0, Math.floor(options.jitterMs ?? 0))
    const timeoutMs =
      typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
        ? Math.max(1, Math.floor(options.timeoutMs))
        : undefined

    const now = Date.now()
    const baseNextRunMs = options.runImmediately
      ? now
      : typeof options.initialDelayMs === 'number'
        ? now + Math.max(0, options.initialDelayMs)
        : now + intervalMs

    const nextRunMs = baseNextRunMs + this.randomJitter(jitterMs)

    this.tasks.set(id, {
      id,
      callback,
      intervalMs,
      nextRunMs,
      lane,
      backpressure,
      dedupeKey: options.dedupeKey || id,
      maxInFlight,
      timeoutMs,
      jitterMs
    })

    this.ensureTaskStats(id)

    if (this.shouldVerboseLog()) {
      console.debug(
        `[PollingService] Task '${id}' registered: every ${options.interval} ${options.unit}, lane=${lane}, backpressure=${backpressure}`
      )
    }

    if (this.isRunning) {
      this._reschedule()
      this.pumpLane(lane)
    }
  }

  public setTaskMeta(id: string, meta: Record<string, unknown> | null): void {
    if (!meta) return
    const stats = this.ensureTaskStats(id)
    stats.lastMeta = meta
    this.taskStats.set(id, stats)
  }

  /**
   * Unregisters a task, preventing it from being executed in the future.
   * @param id - The unique identifier of the task to remove.
   */
  public unregister(id: string): void {
    if (this.tasks.delete(id)) {
      this.removeQueuedEntriesByTaskId(id)
      if (this.shouldVerboseLog()) {
        console.debug(`[PollingService] Task '${id}' unregistered.`)
      }
      if (this.isRunning) {
        this._reschedule()
      }
    } else {
      if (this.shouldVerboseLog()) {
        console.warn(
          `[PollingService] Attempted to unregister a non-existent task with ID '${id}'.`
        )
      }
    }
  }

  private removeQueuedEntriesByTaskId(id: string): void {
    for (const [, state] of this.laneStates) {
      if (state.queue.length === 0) continue
      const remaining = state.queue.filter((entry) => entry.task.id !== id)
      state.queue = remaining
      for (const [key, value] of state.pendingByDedupe.entries()) {
        if (value.task.id === id) {
          state.pendingByDedupe.delete(key)
        }
      }
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
      this.recordStartAttempt()
      return
    }
    this.isRunning = true
    if (this.shouldVerboseLog()) {
      console.log('[PollingService] Polling service started')
    }
    this._setupQuitListener()
    this._reschedule()
  }

  /**
   * Sets up Electron app quit listener if running in Electron environment
   * Uses lazy resolution to avoid hard dependency on Electron
   */
  private _setupQuitListener(): void {
    try {
      const electron =
        (globalThis as any)?.electron ??
        (typeof require !== 'undefined' ? require('electron') : null)

      if (electron?.app) {
        const app = electron.app

        const quitHandler = () => {
          this.stop('app quit')
        }

        app.on('before-quit', quitHandler)

        this.quitListenerCleanup = () => {
          app.removeListener('before-quit', quitHandler)
        }
      }
    } catch {
      // Not in Electron environment or Electron not available.
    }
  }

  /**
   * Stops the polling service and clears all scheduled timers.
   * It does not remove task definitions.
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

    if (this.quitListenerCleanup) {
      this.quitListenerCleanup()
      this.quitListenerCleanup = undefined
    }

    if (reason) {
      if (this.shouldVerboseLog()) {
        console.log(`[PollingService] Stopping polling service: ${reason}`)
      }
    } else {
      if (this.shouldVerboseLog()) {
        console.log('[PollingService] Polling service stopped')
      }
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
      prev.nextRunMs < curr.nextRunMs ? prev : curr
    )

    const delay = Math.max(0, nextTask.nextRunMs - now)
    this.timerId = setTimeout(() => this._tick(), delay)
  }

  private _tick(): void {
    const now = Date.now()

    for (const task of this.tasks.values()) {
      if (task.nextRunMs > now) {
        continue
      }

      const dueAt = task.nextRunMs
      task.nextRunMs = this.computeNextRunMs(task, now)
      this.enqueueDueTask(task, dueAt, now)
    }

    this._reschedule()
  }

  private enqueueDueTask(task: PollingTask, dueAt: number, now: number): void {
    const laneState = this.getLaneState(task.lane)
    const dedupeKey = task.dedupeKey || task.id

    if (task.backpressure !== 'strict_fifo') {
      const existing = laneState.pendingByDedupe.get(dedupeKey)
      if (existing) {
        existing.dueAt = dueAt
        existing.enqueuedAt = now
        existing.task = task
        const stats = this.ensureTaskStats(task.id)
        if (task.backpressure === 'latest_wins') {
          stats.droppedCount += 1
        } else {
          stats.coalescedCount += 1
        }
        this.taskStats.set(task.id, stats)
        return
      }
    }

    const queued: QueuedTask = {
      task,
      dueAt,
      enqueuedAt: now,
      dedupeKey,
      sequence: ++this.queueSequence
    }

    laneState.queue.push(queued)
    if (task.backpressure !== 'strict_fifo') {
      laneState.pendingByDedupe.set(dedupeKey, queued)
    }

    this.pumpLane(task.lane)
  }

  private pumpLane(lane: PollingTaskLane): void {
    if (!this.isRunning) return

    const laneState = this.getLaneState(lane)
    const laneConcurrency = DEFAULT_LANE_CONCURRENCY[lane]

    while (laneState.inFlight < laneConcurrency && laneState.queue.length > 0) {
      const queued = laneState.queue.shift()!
      if (laneState.pendingByDedupe.get(queued.dedupeKey) === queued) {
        laneState.pendingByDedupe.delete(queued.dedupeKey)
      }

      const currentTask = this.tasks.get(queued.task.id)
      if (!currentTask || currentTask !== queued.task) {
        continue
      }

      const taskInFlight = this.taskInFlightCount.get(currentTask.id) ?? 0
      if (taskInFlight >= currentTask.maxInFlight) {
        // Respect per-task in-flight cap; requeue and retry later.
        laneState.queue.push(queued)
        if (currentTask.backpressure !== 'strict_fifo') {
          laneState.pendingByDedupe.set(queued.dedupeKey, queued)
        }
        break
      }

      laneState.inFlight += 1
      this.taskInFlightCount.set(currentTask.id, taskInFlight + 1)

      const runId = `${currentTask.id}#${++this.runSequence}`
      const startAt = Date.now()
      this.activeTasks.set(runId, {
        runId,
        taskId: currentTask.id,
        startedAt: startAt,
        dueAt: queued.dueAt,
        enqueuedAt: queued.enqueuedAt,
        lane
      })

      void this.executeQueuedTask(currentTask, queued, lane, runId)
    }
  }

  private async executeQueuedTask(
    task: PollingTask,
    queued: QueuedTask,
    lane: PollingTaskLane,
    runId: string
  ): Promise<void> {
    const startAt = Date.now()
    const schedulerDelayMs = Math.max(0, startAt - queued.dueAt)
    const stats = this.ensureTaskStats(task.id)
    stats.lastSchedulerDelayMs = schedulerDelayMs
    stats.maxSchedulerDelayMs = Math.max(stats.maxSchedulerDelayMs, schedulerDelayMs)

    try {
      const callbackPromise = Promise.resolve().then(() => task.callback())
      const timedOut = await this.awaitWithTimeout(task, callbackPromise)
      if (timedOut) {
        stats.timeoutCount += 1
      }
    } catch (error) {
      stats.errorCount += 1
      console.error(`[PollingService] Error executing task '${task.id}':`, error)
    } finally {
      const endAt = Date.now()
      const durationMs = Math.max(0, endAt - startAt)

      stats.count += 1
      stats.lastStartAt = startAt
      stats.lastEndAt = endAt
      stats.lastDurationMs = durationMs
      stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs)
      this.taskStats.set(task.id, stats)

      this.activeTasks.delete(runId)

      const laneState = this.getLaneState(lane)
      laneState.inFlight = Math.max(0, laneState.inFlight - 1)

      const inFlightNow = Math.max(0, (this.taskInFlightCount.get(task.id) ?? 1) - 1)
      if (inFlightNow <= 0) {
        this.taskInFlightCount.delete(task.id)
      } else {
        this.taskInFlightCount.set(task.id, inFlightNow)
      }

      this.pumpLane(lane)
    }
  }

  private async awaitWithTimeout(
    task: PollingTask,
    callbackPromise: Promise<void | unknown>
  ): Promise<boolean> {
    if (!task.timeoutMs || task.timeoutMs <= 0) {
      await callbackPromise
      return false
    }

    const timeoutError = new Error(
      `[PollingService] Task '${task.id}' timeout after ${task.timeoutMs}ms`
    )

    let timeoutHandle: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(timeoutError), task.timeoutMs)
    })

    try {
      await Promise.race([callbackPromise, timeoutPromise])
      return false
    } catch (error) {
      if (error === timeoutError) {
        // Prevent unhandled rejection if callback fails after timeout.
        callbackPromise.catch((lateError) => {
          if (this.shouldVerboseLog()) {
            console.warn(`[PollingService] Late task failure after timeout '${task.id}':`, lateError)
          }
        })
        console.warn(timeoutError.message)
        return true
      }
      throw error
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }

  public getDiagnostics(): {
    activeTasks: Array<{
      id: string
      runId: string
      lane: PollingTaskLane
      startedAt: number
      ageMs: number
      schedulerDelayMs: number
      queueAgeMs: number
      intervalMs?: number
      nextRunMs?: number
      lastDurationMs?: number
      maxDurationMs?: number
      count?: number
      lastMeta?: Record<string, unknown>
    }>
    recentTasks: Array<{
      id: string
      lane?: PollingTaskLane
      lastDurationMs: number
      lastEndAt: number
      count: number
      maxDurationMs: number
      lastSchedulerDelayMs: number
      maxSchedulerDelayMs: number
      droppedCount: number
      coalescedCount: number
      timeoutCount: number
      errorCount: number
      intervalMs?: number
      nextRunMs?: number
      lastMeta?: Record<string, unknown>
    }>
    queueDepthByLane: Record<PollingTaskLane, { queued: number; inFlight: number }>
    droppedCount: number
    coalescedCount: number
    startAttempts: Array<{ caller: string, count: number, ageMs: number }>
  } {
    const now = Date.now()
    const activeTasks = Array.from(this.activeTasks.values())
      .map((active) => ({
        id: active.taskId,
        runId: active.runId,
        lane: active.lane,
        startedAt: active.startedAt,
        ageMs: Math.max(0, now - active.startedAt),
        schedulerDelayMs: Math.max(0, active.startedAt - active.dueAt),
        queueAgeMs: Math.max(0, active.startedAt - active.enqueuedAt),
        intervalMs: this.tasks.get(active.taskId)?.intervalMs,
        nextRunMs: this.tasks.get(active.taskId)?.nextRunMs,
        lastDurationMs: this.taskStats.get(active.taskId)?.lastDurationMs,
        maxDurationMs: this.taskStats.get(active.taskId)?.maxDurationMs,
        count: this.taskStats.get(active.taskId)?.count,
        lastMeta: this.taskStats.get(active.taskId)?.lastMeta
      }))
      .sort((a, b) => b.ageMs - a.ageMs)
      .slice(0, 8)

    const recentTasks = Array.from(this.taskStats.entries())
      .map(([id, stat]) => ({
        id,
        lane: this.tasks.get(id)?.lane,
        lastDurationMs: stat.lastDurationMs,
        lastEndAt: stat.lastEndAt,
        count: stat.count,
        maxDurationMs: stat.maxDurationMs,
        lastSchedulerDelayMs: stat.lastSchedulerDelayMs,
        maxSchedulerDelayMs: stat.maxSchedulerDelayMs,
        droppedCount: stat.droppedCount,
        coalescedCount: stat.coalescedCount,
        timeoutCount: stat.timeoutCount,
        errorCount: stat.errorCount,
        intervalMs: this.tasks.get(id)?.intervalMs,
        nextRunMs: this.tasks.get(id)?.nextRunMs,
        lastMeta: stat.lastMeta
      }))
      .sort((a, b) => b.lastEndAt - a.lastEndAt)
      .slice(0, 10)

    const queueDepthByLane = {
      critical: {
        queued: this.getLaneState('critical').queue.length,
        inFlight: this.getLaneState('critical').inFlight
      },
      realtime: {
        queued: this.getLaneState('realtime').queue.length,
        inFlight: this.getLaneState('realtime').inFlight
      },
      io: {
        queued: this.getLaneState('io').queue.length,
        inFlight: this.getLaneState('io').inFlight
      },
      maintenance: {
        queued: this.getLaneState('maintenance').queue.length,
        inFlight: this.getLaneState('maintenance').inFlight
      },
      legacy_serial: {
        queued: this.getLaneState('legacy_serial').queue.length,
        inFlight: this.getLaneState('legacy_serial').inFlight
      }
    } satisfies Record<PollingTaskLane, { queued: number; inFlight: number }>

    const droppedCount = recentTasks.reduce((sum, item) => sum + item.droppedCount, 0)
    const coalescedCount = recentTasks.reduce((sum, item) => sum + item.coalescedCount, 0)

    const startAttempts = Array.from(this.startAttempts.entries())
      .map(([caller, stat]) => ({
        caller,
        count: stat.count,
        ageMs: Math.max(0, now - stat.lastAt)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      activeTasks,
      recentTasks,
      queueDepthByLane,
      droppedCount,
      coalescedCount,
      startAttempts
    }
  }

  private recordStartAttempt(): void {
    const stack = new Error().stack
    const caller = stack?.split('\n')[2]?.trim() ?? 'unknown'
    const entry = this.startAttempts.get(caller) ?? { count: 0, lastAt: 0 }
    entry.count += 1
    entry.lastAt = Date.now()
    this.startAttempts.set(caller, entry)
  }

  private shouldVerboseLog(): boolean {
    return (globalThis as any).__TALEX_VERBOSE_LOGS__ === true
  }
}

export const pollingService = PollingService.getInstance()
