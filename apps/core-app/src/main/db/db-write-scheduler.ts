import { AsyncLocalStorage } from 'node:async_hooks'
import { DB_QOS_ENABLED } from './runtime-flags'
import { isSqliteBusyError } from './sqlite-retry'
import { createLogger } from '../utils/logger'

const log = createLogger('DbWriteScheduler')

const taskContext = new AsyncLocalStorage<boolean>()

export type DbWritePriority = 'critical' | 'interactive' | 'background' | 'best_effort'
export type DbWriteDropPolicy = 'none' | 'drop' | 'latest_wins'

export interface DbWriteLabelPolicy {
  priority: DbWritePriority
  maxQueueWaitMs?: number
  budgetKey?: string
  dropPolicy?: DbWriteDropPolicy
  maxBusyFailures?: number
  circuitOpenMs?: number
}

export interface DbWriteTask<T> {
  label: string
  operation: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  enqueuedAt: number
  sequence: number
  priority: DbWritePriority
  maxQueueWaitMs?: number
  budgetKey?: string
  dropPolicy: DbWriteDropPolicy
  maxBusyFailures: number
  circuitOpenMs: number
  /** Legacy compatibility: if true, task can be dropped when queue wait time exceeds the threshold. */
  droppable?: boolean
}

export interface ScheduleOptions {
  /**
   * Legacy compatibility:
   * Mark this task as droppable under queue pressure.
   */
  droppable?: boolean
  priority?: DbWritePriority
  maxQueueWaitMs?: number
  budgetKey?: string
  dropPolicy?: DbWriteDropPolicy
  maxBusyFailures?: number
  circuitOpenMs?: number
}

interface LabelRuntimeStats {
  enqueued: number
  executed: number
  dropped: number
  failed: number
  busyFailed: number
  totalWaitMs: number
  maxWaitMs: number
}

interface LabelRuntimeState {
  consecutiveBusyFailures: number
  circuitOpenUntil: number
}

const PRIORITY_WEIGHT: Record<DbWritePriority, number> = {
  critical: 4,
  interactive: 3,
  background: 2,
  best_effort: 1
}

/** Tasks marked as droppable are rejected after waiting this long in the queue. */
const DROPPABLE_TIMEOUT_MS = 10_000
const LABEL_STATS_LOG_THROTTLE_MS = 60_000
const LABEL_STATS_TOP_N = 6
const DEFAULT_MAX_BUSY_FAILURES = 3
const DEFAULT_CIRCUIT_OPEN_MS = 15_000

export class DbWriteScheduler {
  private queue: DbWriteTask<unknown>[] = []
  private processing = false
  private currentTaskLabel: string | null = null
  private currentTaskPriority: DbWritePriority | null = null
  private drainResolvers: Array<() => void> = []
  private capacityResolvers: Array<{ maxQueued: number; resolve: () => void }> = []
  private labelStats = new Map<string, LabelRuntimeStats>()
  private labelRuntime = new Map<string, LabelRuntimeState>()
  private labelPolicies = new Map<string, DbWriteLabelPolicy>()
  private lastLabelStatsLogAt = 0
  private sequence = 0

  private enqueue<T>(task: DbWriteTask<T>): void {
    this.queue.push(task as DbWriteTask<unknown>)
    this.recordTaskEnqueued(task.label)
  }

  private getOrCreateLabelStats(label: string): LabelRuntimeStats {
    const existing = this.labelStats.get(label)
    if (existing) {
      return existing
    }
    const initial: LabelRuntimeStats = {
      enqueued: 0,
      executed: 0,
      dropped: 0,
      failed: 0,
      busyFailed: 0,
      totalWaitMs: 0,
      maxWaitMs: 0
    }
    this.labelStats.set(label, initial)
    return initial
  }

  private getOrCreateLabelRuntime(label: string): LabelRuntimeState {
    const existing = this.labelRuntime.get(label)
    if (existing) return existing
    const created: LabelRuntimeState = {
      consecutiveBusyFailures: 0,
      circuitOpenUntil: 0
    }
    this.labelRuntime.set(label, created)
    return created
  }

  private recordTaskEnqueued(label: string): void {
    this.getOrCreateLabelStats(label).enqueued += 1
  }

  private recordTaskSettled(
    label: string,
    waitedMs: number,
    state: 'executed' | 'dropped' | 'failed'
  ): void {
    const stats = this.getOrCreateLabelStats(label)
    stats[state] += 1
    stats.totalWaitMs += waitedMs
    if (waitedMs > stats.maxWaitMs) {
      stats.maxWaitMs = waitedMs
    }
  }

  private recordBusyFailure(label: string): void {
    this.getOrCreateLabelStats(label).busyFailed += 1
  }

  private getQueueSummaryByPriority(): Record<DbWritePriority, number> {
    const summary: Record<DbWritePriority, number> = {
      critical: 0,
      interactive: 0,
      background: 0,
      best_effort: 0
    }
    for (const task of this.queue) {
      summary[task.priority] += 1
    }
    return summary
  }

  private getCircuitSummary(): string {
    const now = Date.now()
    const opened = Array.from(this.labelRuntime.entries())
      .filter(([, state]) => state.circuitOpenUntil > now)
      .map(([label, state]) => `${label}:${Math.max(0, state.circuitOpenUntil - now)}ms`)
    return opened.join(' | ')
  }

  private maybeLogLabelStats(): void {
    const now = Date.now()
    if (now - this.lastLabelStatsLogAt < LABEL_STATS_LOG_THROTTLE_MS) {
      return
    }

    const entries = Array.from(this.labelStats.entries())
    if (entries.length === 0) {
      return
    }

    this.lastLabelStatsLogAt = now
    const topLabels = entries
      .sort((left, right) => {
        if (right[1].dropped !== left[1].dropped) {
          return right[1].dropped - left[1].dropped
        }
        return right[1].enqueued - left[1].enqueued
      })
      .slice(0, LABEL_STATS_TOP_N)
      .map(([label, stats]) => {
        const settledCount = Math.max(1, stats.executed + stats.failed + stats.dropped)
        return {
          label,
          enqueued: stats.enqueued,
          executed: stats.executed,
          failed: stats.failed,
          busyFailed: stats.busyFailed,
          dropped: stats.dropped,
          avgWaitMs: Math.round(stats.totalWaitMs / settledCount),
          maxWaitMs: stats.maxWaitMs,
          busyFailedRatio:
            stats.failed > 0 ? Number((stats.busyFailed / stats.failed).toFixed(3)) : 0
        }
      })
    const topLabelsSummary = topLabels
      .map(
        (label) =>
          `${label.label}[q=${label.enqueued},ok=${label.executed},drop=${label.dropped},fail=${label.failed},busy=${label.busyFailed},busyRatio=${label.busyFailedRatio},avg=${label.avgWaitMs},max=${label.maxWaitMs}]`
      )
      .join(' | ')

    log.info('DB write scheduler label stats', {
      meta: {
        queued: this.queue.length,
        queuedByPriority: JSON.stringify(this.getQueueSummaryByPriority()),
        processing: this.processing,
        currentTaskLabel: this.currentTaskLabel,
        currentTaskPriority: this.currentTaskPriority,
        topLabelsSummary,
        openCircuits: this.getCircuitSummary() || undefined
      }
    })
  }

  private resolveDefaultLabelPolicy(label: string): DbWriteLabelPolicy {
    if (label.startsWith('file-index.') || label.startsWith('search-index.')) {
      return { priority: 'critical', dropPolicy: 'none' }
    }
    if (label === 'clipboard.persist') {
      return { priority: 'interactive', dropPolicy: 'none' }
    }
    if (label === 'recommendation.cache') {
      return {
        priority: 'best_effort',
        dropPolicy: 'latest_wins',
        budgetKey: 'recommendation.cache',
        maxQueueWaitMs: 8_000
      }
    }
    if (label.startsWith('analytics.') || label === 'ocr.clipboard.meta') {
      return { priority: 'best_effort', dropPolicy: 'drop', maxQueueWaitMs: 10_000 }
    }
    return { priority: 'background', dropPolicy: 'none' }
  }

  private mergePolicy(
    label: string,
    options?: ScheduleOptions
  ): Required<
    Pick<DbWriteLabelPolicy, 'priority' | 'dropPolicy' | 'maxBusyFailures' | 'circuitOpenMs'>
  > &
    Pick<DbWriteLabelPolicy, 'maxQueueWaitMs' | 'budgetKey'> {
    const defaultPolicy = this.resolveDefaultLabelPolicy(label)
    const registeredPolicy = this.labelPolicies.get(label)
    const merged: DbWriteLabelPolicy = {
      ...defaultPolicy,
      ...registeredPolicy
    }

    if (options?.priority) merged.priority = options.priority
    if (typeof options?.maxQueueWaitMs === 'number') merged.maxQueueWaitMs = options.maxQueueWaitMs
    if (typeof options?.budgetKey === 'string') merged.budgetKey = options.budgetKey
    if (options?.dropPolicy) merged.dropPolicy = options.dropPolicy
    if (typeof options?.maxBusyFailures === 'number')
      merged.maxBusyFailures = options.maxBusyFailures
    if (typeof options?.circuitOpenMs === 'number') merged.circuitOpenMs = options.circuitOpenMs

    if (options?.droppable && (!merged.dropPolicy || merged.dropPolicy === 'none')) {
      merged.dropPolicy = 'drop'
    }
    if (
      (!merged.maxQueueWaitMs || merged.maxQueueWaitMs <= 0) &&
      (merged.dropPolicy === 'drop' || merged.dropPolicy === 'latest_wins')
    ) {
      merged.maxQueueWaitMs = DROPPABLE_TIMEOUT_MS
    }
    if (merged.dropPolicy === 'latest_wins' && !merged.budgetKey) {
      merged.budgetKey = label
    }

    return {
      priority: merged.priority ?? 'background',
      dropPolicy: merged.dropPolicy ?? 'none',
      maxQueueWaitMs: merged.maxQueueWaitMs,
      budgetKey: merged.budgetKey,
      maxBusyFailures: Math.max(1, merged.maxBusyFailures ?? DEFAULT_MAX_BUSY_FAILURES),
      circuitOpenMs: Math.max(1_000, merged.circuitOpenMs ?? DEFAULT_CIRCUIT_OPEN_MS)
    }
  }

  private shouldRejectByCircuit(task: Pick<DbWriteTask<unknown>, 'label' | 'priority'>): boolean {
    if (!DB_QOS_ENABLED) return false
    if (!(task.priority === 'background' || task.priority === 'best_effort')) {
      return false
    }
    const state = this.getOrCreateLabelRuntime(task.label)
    return state.circuitOpenUntil > Date.now()
  }

  private dropQueuedByBudgetKey(task: Pick<DbWriteTask<unknown>, 'budgetKey' | 'label'>): void {
    if (!task.budgetKey) return

    const remaining: DbWriteTask<unknown>[] = []
    for (const queued of this.queue) {
      if (queued.budgetKey === task.budgetKey) {
        const waitedMs = Date.now() - queued.enqueuedAt
        this.recordTaskSettled(queued.label, waitedMs, 'dropped')
        queued.reject(
          new Error(
            `DB write task dropped by latest_wins policy: ${queued.label} (${task.budgetKey})`
          )
        )
      } else {
        remaining.push(queued)
      }
    }
    this.queue = remaining
  }

  public registerLabelPolicy(label: string, policy: DbWriteLabelPolicy): void {
    this.labelPolicies.set(label, policy)
  }

  public getPolicyRegistry(): Array<{ label: string; policy: DbWriteLabelPolicy }> {
    return Array.from(this.labelPolicies.entries()).map(([label, policy]) => ({
      label,
      policy: { ...policy }
    }))
  }

  public getCircuitStates(): Array<{
    label: string
    open: boolean
    openUntil: number
    consecutiveBusyFailures: number
  }> {
    const now = Date.now()
    return Array.from(this.labelRuntime.entries()).map(([label, state]) => ({
      label,
      open: state.circuitOpenUntil > now,
      openUntil: state.circuitOpenUntil,
      consecutiveBusyFailures: state.consecutiveBusyFailures
    }))
  }

  async schedule<T>(
    label: string,
    operation: () => Promise<T>,
    options?: ScheduleOptions
  ): Promise<T> {
    if (taskContext.getStore()) {
      return operation()
    }

    const policy = this.mergePolicy(label, options)
    const task: DbWriteTask<T> = {
      label,
      operation,
      resolve: () => undefined as T,
      reject: () => undefined,
      enqueuedAt: Date.now(),
      sequence: ++this.sequence,
      priority: policy.priority,
      maxQueueWaitMs: policy.maxQueueWaitMs,
      budgetKey: policy.budgetKey,
      dropPolicy: policy.dropPolicy,
      maxBusyFailures: policy.maxBusyFailures,
      circuitOpenMs: policy.circuitOpenMs,
      droppable: options?.droppable
    }

    if (this.shouldRejectByCircuit(task)) {
      return Promise.reject(new Error(`DB write task dropped by circuit breaker: ${label}`))
    }

    return new Promise<T>((resolve, reject) => {
      task.resolve = resolve
      task.reject = reject

      if (DB_QOS_ENABLED && task.dropPolicy === 'latest_wins') {
        this.dropQueuedByBudgetKey(task)
      }

      this.enqueue(task)
      this.kick()
    })
  }

  getStats(): {
    queued: number
    processing: boolean
    currentTaskLabel: string | null
    currentTaskPriority: DbWritePriority | null
  } {
    return {
      queued: this.queue.length,
      processing: this.processing,
      currentTaskLabel: this.currentTaskLabel,
      currentTaskPriority: this.currentTaskPriority
    }
  }

  getDetailedStats(): {
    queued: number
    queuedByPriority: Record<DbWritePriority, number>
    processing: boolean
    currentTaskLabel: string | null
    currentTaskPriority: DbWritePriority | null
    sqliteBusyRatio: number
    circuits: ReturnType<DbWriteScheduler['getCircuitStates']>
  } {
    const totals = Array.from(this.labelStats.values()).reduce(
      (acc, item) => {
        acc.failed += item.failed
        acc.busyFailed += item.busyFailed
        return acc
      },
      { failed: 0, busyFailed: 0 }
    )

    return {
      queued: this.queue.length,
      queuedByPriority: this.getQueueSummaryByPriority(),
      processing: this.processing,
      currentTaskLabel: this.currentTaskLabel,
      currentTaskPriority: this.currentTaskPriority,
      sqliteBusyRatio:
        totals.failed > 0 ? Number((totals.busyFailed / totals.failed).toFixed(3)) : 0,
      circuits: this.getCircuitStates()
    }
  }

  /**
   * Wait until the queue depth drops below `maxQueued`.
   * Use this to apply backpressure on producers that generate DB tasks
   * faster than they can be consumed (e.g. fullScan fire-and-forget chains).
   */
  async waitForCapacity(maxQueued: number): Promise<void> {
    if (this.queue.length < maxQueued) return

    await new Promise<void>((resolve) => {
      this.capacityResolvers.push({ maxQueued, resolve })
    })
  }

  async drain(): Promise<void> {
    if (!this.processing && this.queue.length === 0) return

    await new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve)
      this.kick()
    })
  }

  private pickNextTaskIndex(): number {
    if (!DB_QOS_ENABLED) return 0
    if (this.queue.length <= 1) return 0

    let bestIdx = 0
    let bestWeight = PRIORITY_WEIGHT[this.queue[0].priority]
    let bestSeq = this.queue[0].sequence

    for (let i = 1; i < this.queue.length; i++) {
      const candidate = this.queue[i]
      const weight = PRIORITY_WEIGHT[candidate.priority]
      if (weight > bestWeight) {
        bestIdx = i
        bestWeight = weight
        bestSeq = candidate.sequence
        continue
      }
      if (weight === bestWeight && candidate.sequence < bestSeq) {
        bestIdx = i
        bestSeq = candidate.sequence
      }
    }
    return bestIdx
  }

  private kick(): void {
    if (this.processing) return
    if (this.queue.length === 0) return

    void this.processLoop()
  }

  private notifyCapacityWaiters(): void {
    if (this.capacityResolvers.length === 0) return

    const remaining: typeof this.capacityResolvers = []
    for (const waiter of this.capacityResolvers) {
      if (this.queue.length < waiter.maxQueued) {
        waiter.resolve()
      } else {
        remaining.push(waiter)
      }
    }
    this.capacityResolvers = remaining
  }

  private openCircuitForTask(task: DbWriteTask<unknown>): void {
    const runtime = this.getOrCreateLabelRuntime(task.label)
    if (!(task.priority === 'background' || task.priority === 'best_effort')) return
    runtime.circuitOpenUntil = Date.now() + task.circuitOpenMs
    runtime.consecutiveBusyFailures = 0
    log.warn('DB write label circuit opened', {
      meta: {
        label: task.label,
        priority: task.priority,
        openForMs: task.circuitOpenMs
      }
    })
  }

  private markTaskSuccess(task: DbWriteTask<unknown>): void {
    const runtime = this.getOrCreateLabelRuntime(task.label)
    runtime.consecutiveBusyFailures = 0
  }

  private markTaskFailure(task: DbWriteTask<unknown>, error: unknown): void {
    const runtime = this.getOrCreateLabelRuntime(task.label)
    if (!isSqliteBusyError(error)) {
      runtime.consecutiveBusyFailures = 0
      return
    }

    this.recordBusyFailure(task.label)
    runtime.consecutiveBusyFailures += 1
    if (
      (task.priority === 'background' || task.priority === 'best_effort') &&
      runtime.consecutiveBusyFailures >= task.maxBusyFailures
    ) {
      this.openCircuitForTask(task)
    }
  }

  private shouldDropTaskByWait(task: DbWriteTask<unknown>, waitedMs: number): boolean {
    const maxWaitMs =
      typeof task.maxQueueWaitMs === 'number' && task.maxQueueWaitMs > 0
        ? task.maxQueueWaitMs
        : undefined
    if (maxWaitMs && waitedMs > maxWaitMs) return true
    if (
      (task.droppable || task.dropPolicy === 'drop' || task.dropPolicy === 'latest_wins') &&
      waitedMs > DROPPABLE_TIMEOUT_MS
    ) {
      return true
    }
    return false
  }

  private async processLoop(): Promise<void> {
    if (this.processing) return

    this.processing = true

    let taskCount = 0
    while (this.queue.length > 0) {
      const taskIdx = this.pickNextTaskIndex()
      const [task] = this.queue.splice(taskIdx, 1)
      const waitedMs = Date.now() - task.enqueuedAt
      this.currentTaskLabel = task.label
      this.currentTaskPriority = task.priority

      if (waitedMs > 2000) {
        // Rate-limit slow-wait warnings: only log every 20th occurrence
        // during heavy indexing to avoid flooding the log with 11K+ entries.
        taskCount++
        if (taskCount <= 3 || taskCount % 20 === 0) {
          log.warn(
            `DB write task waited ${waitedMs}ms: ${task.label}` +
              (taskCount > 3 ? ` (${taskCount} slow tasks so far)` : '')
          )
        }
      }

      // Drop stale tasks under queue pressure.
      if (this.shouldDropTaskByWait(task, waitedMs)) {
        log.warn(`Dropping stale task after ${waitedMs}ms: ${task.label}`)
        this.recordTaskSettled(task.label, waitedMs, 'dropped')
        task.reject(
          new Error(`DB write task dropped after ${waitedMs}ms queue wait: ${task.label}`)
        )
        this.currentTaskLabel = null
        this.currentTaskPriority = null
        this.notifyCapacityWaiters()
        this.maybeLogLabelStats()
        continue
      }

      if (this.shouldRejectByCircuit(task)) {
        this.recordTaskSettled(task.label, waitedMs, 'dropped')
        task.reject(new Error(`DB write task dropped by circuit breaker: ${task.label}`))
        this.currentTaskLabel = null
        this.currentTaskPriority = null
        this.notifyCapacityWaiters()
        this.maybeLogLabelStats()
        continue
      }

      try {
        const result = await taskContext.run(true, task.operation)
        this.markTaskSuccess(task)
        this.recordTaskSettled(task.label, waitedMs, 'executed')
        task.resolve(result)
      } catch (error) {
        this.markTaskFailure(task, error)
        this.recordTaskSettled(task.label, waitedMs, 'failed')
        task.reject(error)
      } finally {
        this.currentTaskLabel = null
        this.currentTaskPriority = null
      }

      // Notify capacity waiters after completing a task
      this.notifyCapacityWaiters()

      // Yield to event loop after every task to prevent blocking.
      this.maybeLogLabelStats()
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    this.processing = false

    // Final capacity notification when queue is empty
    this.notifyCapacityWaiters()

    if (this.queue.length === 0) {
      const resolvers = this.drainResolvers
      this.drainResolvers = []
      for (const resolve of resolvers) {
        resolve()
      }
    }
  }
}

export const dbWriteScheduler = new DbWriteScheduler()
