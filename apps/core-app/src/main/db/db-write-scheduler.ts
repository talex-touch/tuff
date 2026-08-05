import { AsyncLocalStorage } from 'node:async_hooks'
import { DB_QOS_ENABLED } from './runtime-flags'
import {
  computeSqliteBusyBackoffMs,
  incrementSqliteBusyRetryCount,
  isSqliteBusyError,
  nextSqliteBusyRetryLogState,
  notifySqliteRetryExhausted,
  resolveSqliteErrorIdentity
} from './sqlite-retry'
import { createLogger } from '../utils/logger'

const log = createLogger('DbWriteScheduler')

const taskContext = new AsyncLocalStorage<boolean>()

export type DbWritePriority = 'critical' | 'interactive' | 'background' | 'best_effort'
export type DbWriteDropPolicy = 'none' | 'drop' | 'latest_wins'
export type DbWriteLane = 'primary' | 'aux'

export interface DbWriteLabelPolicy {
  priority: DbWritePriority
  maxQueueWaitMs?: number
  budgetKey?: string
  dropPolicy?: DbWriteDropPolicy
  maxBusyFailures?: number
  circuitOpenMs?: number
  /**
   * Scheduler-owned SQLITE_BUSY retries via delayed re-enqueue: the backoff is
   * spent queued (other tasks keep executing), never while holding the write
   * loop. `0` disables scheduler retry (busy failures reject immediately).
   * Default by priority: interactive → 3, everything else → 6.
   */
  busyRetries?: number
  busyBaseDelayMs?: number
  busyMaxDelayMs?: number
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
  busyRetries: number
  busyBaseDelayMs: number
  busyMaxDelayMs: number
  /** Target SQLite file; selects the per-lane queue/loop the task runs in. */
  lane: DbWriteLane
  /** Scheduler-owned busy retries already consumed by this task. */
  busyAttempts: number
  /** Epoch ms before which the task must not be dequeued (busy backoff park). 0 = eligible now. */
  nextEligibleAt: number
  /** Cumulative ms this task spent parked for its own busy backoff. */
  busyBackoffTotalMs: number
}

export interface ScheduleOptions {
  priority?: DbWritePriority
  maxQueueWaitMs?: number
  budgetKey?: string
  dropPolicy?: DbWriteDropPolicy
  maxBusyFailures?: number
  circuitOpenMs?: number
  /** See {@link DbWriteLabelPolicy.busyRetries}. */
  busyRetries?: number
  busyBaseDelayMs?: number
  busyMaxDelayMs?: number
  /**
   * Which SQLite file the write targets (`'primary'` = database.db, `'aux'` =
   * database-aux.db). Each lane has its own queue and single-writer loop and
   * the lanes execute concurrently (different files — no lock contention), so
   * an aux write never queues behind primary-file contention and vice versa.
   * Default `'primary'`.
   */
  lane?: DbWriteLane
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

/** Per-lane snapshot exposed by {@link DbWriteScheduler.getStats}. */
export interface DbWriteLaneStats {
  queued: number
  processing: boolean
  currentTaskLabel: string | null
  currentTaskPriority: DbWritePriority | null
}

/**
 * One SQLite file's write queue: its own FIFO+priority queue, its own
 * single-task processing loop, and its own busy-backoff wake-up timer.
 * Label policies, circuits, and label stats stay scheduler-global (a label
 * always targets one file, so labels never cross lanes).
 */
interface LaneState {
  queue: DbWriteTask<unknown>[]
  processing: boolean
  currentTaskLabel: string | null
  currentTaskPriority: DbWritePriority | null
  /**
   * Wake-up timer for the earliest parked (busy-backoff) task in this lane.
   * Armed only when the lane loop is released because nothing is eligible;
   * cleared on every kick of this lane.
   */
  eligibilityTimer: ReturnType<typeof setTimeout> | null
}

function createLaneState(): LaneState {
  return {
    queue: [],
    processing: false,
    currentTaskLabel: null,
    currentTaskPriority: null,
    eligibilityTimer: null
  }
}

const PRIORITY_WEIGHT: Record<DbWritePriority, number> = {
  critical: 4,
  interactive: 3,
  background: 2,
  best_effort: 1
}

const DROPPABLE_TIMEOUT_MS = 10_000
const LABEL_STATS_LOG_THROTTLE_MS = 60_000
const LABEL_STATS_TOP_N = 6
const DEFAULT_MAX_BUSY_FAILURES = 3
const DEFAULT_CIRCUIT_OPEN_MS = 15_000
const DEFAULT_BUSY_BASE_DELAY_MS = 200
const DEFAULT_BUSY_MAX_DELAY_MS = 3_000
const BUSY_BACKOFF_JITTER_RATIO = 0.2
const BUSY_RETRY_LOG_THROTTLE_MS = 30_000
const DEFAULT_BUSY_RETRIES_BY_PRIORITY: Record<DbWritePriority, number> = {
  critical: 6,
  interactive: 3,
  background: 6,
  best_effort: 6
}

/**
 * Main-process SQLite write scheduler with one lane per database file
 * (design D3/FR4): `'primary'` → database.db, `'aux'` → database-aux.db.
 * Each lane executes at most one task at a time (single writer per file) and
 * the lanes run concurrently, so backlog or busy-backoff on one file never
 * blocks writes to the other. Busy failures are retried by delayed re-enqueue
 * into the task's own lane — backoff time is spent queued, never while holding
 * a lane loop. Drain/capacity waiters and label policies/circuits/stats are
 * scheduler-global.
 */
export class DbWriteScheduler {
  private lanes: Record<DbWriteLane, LaneState> = {
    primary: createLaneState(),
    aux: createLaneState()
  }
  private drainResolvers: Array<() => void> = []
  private capacityResolvers: Array<{ maxQueued: number; resolve: () => void }> = []
  private labelStats = new Map<string, LabelRuntimeStats>()
  private labelRuntime = new Map<string, LabelRuntimeState>()
  private labelPolicies = new Map<string, DbWriteLabelPolicy>()
  private lastLabelStatsLogAt = 0
  // Global monotonic sequence: FIFO ties are broken per lane, but one counter
  // for both lanes keeps enqueue order comparable across the scheduler.
  private sequence = 0

  private laneStates(): LaneState[] {
    return [this.lanes.primary, this.lanes.aux]
  }

  private getTotalQueued(): number {
    let total = 0
    for (const lane of this.laneStates()) total += lane.queue.length
    return total
  }

  private isAnyLaneProcessing(): boolean {
    return this.laneStates().some((lane) => lane.processing)
  }

  private isFullyIdle(): boolean {
    return this.laneStates().every((lane) => !lane.processing && lane.queue.length === 0)
  }

  /**
   * Aggregate "current task" for the backward-compatible stats shape: the
   * primary lane's current task when it is executing one, else the aux
   * lane's. (The legacy shape had a single loop; with lanes there can be two
   * concurrent current tasks — the per-lane truth lives in `lanes`.)
   */
  private getAggregateCurrentTask(): {
    label: string | null
    priority: DbWritePriority | null
  } {
    const primary = this.lanes.primary
    if (primary.currentTaskLabel !== null) {
      return { label: primary.currentTaskLabel, priority: primary.currentTaskPriority }
    }
    const aux = this.lanes.aux
    return { label: aux.currentTaskLabel, priority: aux.currentTaskPriority }
  }

  private getLaneStatsBreakdown(): Record<DbWriteLane, DbWriteLaneStats> {
    const snapshot = (lane: DbWriteLane): DbWriteLaneStats => {
      const state = this.lanes[lane]
      return {
        queued: state.queue.length,
        processing: state.processing,
        currentTaskLabel: state.currentTaskLabel,
        currentTaskPriority: state.currentTaskPriority
      }
    }
    return { primary: snapshot('primary'), aux: snapshot('aux') }
  }

  private enqueue<T>(task: DbWriteTask<T>): void {
    this.lanes[task.lane].queue.push(task as DbWriteTask<unknown>)
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
    for (const lane of this.laneStates()) {
      for (const task of lane.queue) {
        summary[task.priority] += 1
      }
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

    const current = this.getAggregateCurrentTask()
    log.info('DB write scheduler label stats', {
      meta: {
        queued: this.getTotalQueued(),
        queuedByPriority: JSON.stringify(this.getQueueSummaryByPriority()),
        queuedByLane: JSON.stringify({
          primary: this.lanes.primary.queue.length,
          aux: this.lanes.aux.queue.length
        }),
        processing: this.isAnyLaneProcessing(),
        currentTaskLabel: current.label,
        currentTaskPriority: current.priority,
        topLabelsSummary,
        openCircuits: this.getCircuitSummary() || undefined
      }
    })
  }

  private resolveDefaultLabelPolicy(label: string): DbWriteLabelPolicy {
    if (label === 'file-index.extensions.upsert') {
      return {
        priority: 'background',
        dropPolicy: 'drop',
        maxQueueWaitMs: 30_000,
        maxBusyFailures: 2,
        circuitOpenMs: 60_000
      }
    }
    if (label === 'file-icon.persist' || label === 'file-opener.icon.persist') {
      return {
        priority: 'best_effort',
        dropPolicy: 'drop',
        maxQueueWaitMs: 15_000,
        maxBusyFailures: 2,
        circuitOpenMs: 60_000
      }
    }
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
    Pick<
      DbWriteLabelPolicy,
      | 'priority'
      | 'dropPolicy'
      | 'maxBusyFailures'
      | 'circuitOpenMs'
      | 'busyRetries'
      | 'busyBaseDelayMs'
      | 'busyMaxDelayMs'
    >
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
    if (typeof options?.busyRetries === 'number') merged.busyRetries = options.busyRetries
    if (typeof options?.busyBaseDelayMs === 'number')
      merged.busyBaseDelayMs = options.busyBaseDelayMs
    if (typeof options?.busyMaxDelayMs === 'number') merged.busyMaxDelayMs = options.busyMaxDelayMs
    if (
      (!merged.maxQueueWaitMs || merged.maxQueueWaitMs <= 0) &&
      (merged.dropPolicy === 'drop' || merged.dropPolicy === 'latest_wins')
    ) {
      merged.maxQueueWaitMs = DROPPABLE_TIMEOUT_MS
    }
    if (merged.dropPolicy === 'latest_wins' && !merged.budgetKey) {
      merged.budgetKey = label
    }

    const priority = merged.priority ?? 'background'
    return {
      priority,
      dropPolicy: merged.dropPolicy ?? 'none',
      maxQueueWaitMs: merged.maxQueueWaitMs,
      budgetKey: merged.budgetKey,
      maxBusyFailures: Math.max(1, merged.maxBusyFailures ?? DEFAULT_MAX_BUSY_FAILURES),
      circuitOpenMs: Math.max(1_000, merged.circuitOpenMs ?? DEFAULT_CIRCUIT_OPEN_MS),
      busyRetries: Math.max(
        0,
        Math.floor(merged.busyRetries ?? DEFAULT_BUSY_RETRIES_BY_PRIORITY[priority])
      ),
      busyBaseDelayMs: Math.max(0, merged.busyBaseDelayMs ?? DEFAULT_BUSY_BASE_DELAY_MS),
      busyMaxDelayMs: Math.max(0, merged.busyMaxDelayMs ?? DEFAULT_BUSY_MAX_DELAY_MS)
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

  private dropQueuedByBudgetKey(
    task: Pick<DbWriteTask<unknown>, 'budgetKey' | 'label' | 'lane'>
  ): void {
    if (!task.budgetKey) return

    // latest_wins sweeps only the incoming task's own lane. Budget keys and
    // labels are lane-stable in practice (a label always writes one file), and
    // the lane boundary keeps a sweep from reaching into another file's queue.
    const laneState = this.lanes[task.lane]
    const remaining: DbWriteTask<unknown>[] = []
    for (const queued of laneState.queue) {
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
    laneState.queue = remaining
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
    // Reentrancy guard: a schedule() issued from inside a running task executes
    // directly — even when it targets the OTHER lane. Deadlock avoidance trumps
    // lane placement for this edge case (nested cross-lane writes are rare and
    // the LibSQL binding serializes executes on the thread anyway).
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
      busyRetries: policy.busyRetries,
      busyBaseDelayMs: policy.busyBaseDelayMs,
      busyMaxDelayMs: policy.busyMaxDelayMs,
      lane: options?.lane ?? 'primary',
      busyAttempts: 0,
      nextEligibleAt: 0,
      busyBackoffTotalMs: 0
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
      this.kick(task.lane)
    })
  }

  /**
   * Backward-compatible aggregate over both lanes plus a per-lane breakdown:
   * - `queued` — SUM of queued tasks across lanes.
   * - `processing` — true when ANY lane is executing a task.
   * - `currentTaskLabel`/`currentTaskPriority` — the primary lane's current
   *   task when it has one, else the aux lane's (see
   *   {@link DbWriteScheduler.getAggregateCurrentTask}).
   * Per-lane truth is in `lanes`.
   */
  getStats(): {
    queued: number
    processing: boolean
    currentTaskLabel: string | null
    currentTaskPriority: DbWritePriority | null
    lanes: Record<DbWriteLane, DbWriteLaneStats>
  } {
    const current = this.getAggregateCurrentTask()
    return {
      queued: this.getTotalQueued(),
      processing: this.isAnyLaneProcessing(),
      currentTaskLabel: current.label,
      currentTaskPriority: current.priority,
      lanes: this.getLaneStatsBreakdown()
    }
  }

  /**
   * Same aggregate semantics as {@link DbWriteScheduler.getStats} (sum/any
   * across lanes, primary-first current task) with label/circuit detail and a
   * per-lane breakdown.
   */
  getDetailedStats(): {
    queued: number
    queuedByPriority: Record<DbWritePriority, number>
    processing: boolean
    currentTaskLabel: string | null
    currentTaskPriority: DbWritePriority | null
    sqliteBusyRatio: number
    busyFailures: number
    circuits: ReturnType<DbWriteScheduler['getCircuitStates']>
    lanes: Record<DbWriteLane, DbWriteLaneStats>
  } {
    const totals = Array.from(this.labelStats.values()).reduce(
      (acc, item) => {
        acc.failed += item.failed
        acc.busyFailed += item.busyFailed
        return acc
      },
      { failed: 0, busyFailed: 0 }
    )

    const current = this.getAggregateCurrentTask()
    return {
      queued: this.getTotalQueued(),
      queuedByPriority: this.getQueueSummaryByPriority(),
      processing: this.isAnyLaneProcessing(),
      currentTaskLabel: current.label,
      currentTaskPriority: current.priority,
      busyFailures: totals.busyFailed,
      sqliteBusyRatio:
        totals.failed > 0 ? Number((totals.busyFailed / totals.failed).toFixed(3)) : 0,
      circuits: this.getCircuitStates(),
      lanes: this.getLaneStatsBreakdown()
    }
  }

  /**
   * Wait until the TOTAL queue depth (sum across both lanes) drops below
   * `maxQueued`. Use this to apply backpressure on producers that generate DB
   * tasks faster than they can be consumed (e.g. fullScan fire-and-forget
   * chains). Backpressure is deliberately global: it bounds scheduler memory
   * and event-loop pressure, which both lanes share.
   */
  async waitForCapacity(maxQueued: number): Promise<void> {
    if (this.getTotalQueued() < maxQueued) return

    await new Promise<void>((resolve) => {
      this.capacityResolvers.push({ maxQueued, resolve })
    })
  }

  /**
   * Resolve when EVERY lane is idle with an empty queue. Tasks parked for busy
   * backoff still count as queued, so drain waits out their delayed retries in
   * both lanes instead of resolving early.
   */
  async drain(): Promise<void> {
    if (this.isFullyIdle()) return

    await new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve)
      this.kick('primary')
      this.kick('aux')
    })
  }

  /**
   * Pick the next ELIGIBLE task (`nextEligibleAt <= now`) from one lane's
   * queue, by priority weight then FIFO sequence. Tasks parked for busy
   * backoff are skipped so their backoff is spent queued instead of blocking
   * the head of the lane. Returns -1 when the lane holds only parked tasks.
   */
  private pickNextTaskIndex(laneState: LaneState, now: number): number {
    let bestIdx = -1
    let bestWeight = -1
    let bestSeq = Number.MAX_SAFE_INTEGER

    for (let i = 0; i < laneState.queue.length; i++) {
      const candidate = laneState.queue[i]
      if (candidate.nextEligibleAt > now) continue
      // Legacy non-QoS mode: FIFO by queue position among eligible tasks.
      if (!DB_QOS_ENABLED) return i

      const weight = PRIORITY_WEIGHT[candidate.priority]
      if (weight > bestWeight || (weight === bestWeight && candidate.sequence < bestSeq)) {
        bestIdx = i
        bestWeight = weight
        bestSeq = candidate.sequence
      }
    }
    return bestIdx
  }

  private clearEligibilityTimer(laneState: LaneState): void {
    if (laneState.eligibilityTimer !== null) {
      clearTimeout(laneState.eligibilityTimer)
      laneState.eligibilityTimer = null
    }
  }

  /**
   * Arm a single wake-up for the earliest parked task in one lane. Called only
   * when that lane's loop is released with a non-empty queue of ineligible
   * tasks; any subsequent kick of the same lane (new enqueue, drain) clears
   * and supersedes it. Lanes park and wake independently.
   */
  private armEligibilityTimer(lane: DbWriteLane, now: number): void {
    const laneState = this.lanes[lane]
    let minEligibleAt = Number.POSITIVE_INFINITY
    for (const task of laneState.queue) {
      if (task.nextEligibleAt < minEligibleAt) minEligibleAt = task.nextEligibleAt
    }
    if (!Number.isFinite(minEligibleAt)) return

    const delayMs = Math.max(1, minEligibleAt - now + 1)
    this.clearEligibilityTimer(laneState)
    laneState.eligibilityTimer = setTimeout(() => {
      laneState.eligibilityTimer = null
      this.kick(lane)
    }, delayMs)
  }

  private kick(lane: DbWriteLane): void {
    const laneState = this.lanes[lane]
    if (laneState.processing) return
    if (laneState.queue.length === 0) return

    // The lane loop re-evaluates eligibility itself and re-arms the timer when
    // it parks again, so a pending wake-up is always safe to drop here. This
    // also guarantees a newly enqueued eligible task never waits behind the
    // timer.
    this.clearEligibilityTimer(laneState)
    void this.processLoop(lane)
  }

  private notifyCapacityWaiters(): void {
    if (this.capacityResolvers.length === 0) return

    const totalQueued = this.getTotalQueued()
    const remaining: typeof this.capacityResolvers = []
    for (const waiter of this.capacityResolvers) {
      if (totalQueued < waiter.maxQueued) {
        waiter.resolve()
      } else {
        remaining.push(waiter)
      }
    }
    this.capacityResolvers = remaining
  }

  private maybeResolveDrainWaiters(): void {
    if (this.drainResolvers.length === 0) return
    if (!this.isFullyIdle()) return

    const resolvers = this.drainResolvers
    this.drainResolvers = []
    for (const resolve of resolvers) {
      resolve()
    }
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
      (task.dropPolicy === 'drop' || task.dropPolicy === 'latest_wins') &&
      waitedMs > DROPPABLE_TIMEOUT_MS
    ) {
      return true
    }
    return false
  }

  /**
   * Scheduler-owned SQLITE_BUSY retry (design D2): re-enqueue the SAME task
   * object with delayed eligibility so its backoff is spent queued while other
   * tasks execute. Returns false when the failure must settle instead
   * (non-busy error, retries disabled, or retries exhausted).
   */
  private tryParkForBusyRetry(task: DbWriteTask<unknown>, error: unknown): boolean {
    if (task.busyRetries <= 0) return false
    if (!isSqliteBusyError(error)) return false
    if (task.busyAttempts >= task.busyRetries) return false

    task.busyAttempts += 1
    incrementSqliteBusyRetryCount()
    const backoffMs = computeSqliteBusyBackoffMs(
      task.busyAttempts - 1,
      task.busyBaseDelayMs,
      task.busyMaxDelayMs,
      BUSY_BACKOFF_JITTER_RATIO
    )
    task.nextEligibleAt = Date.now() + backoffMs
    task.busyBackoffTotalMs += backoffMs
    // Same task object: enqueuedAt, sequence, promise callbacks, and lane
    // preserved — the park re-enters the task's OWN lane, so the backoff never
    // leaks into the other file's queue. Aging (shouldDropTaskByWait) keeps
    // measuring from the original enqueuedAt, so a busy-looping droppable task
    // drops instead of retrying forever. Not re-counted as enqueued: one
    // schedule() call settles once.
    this.lanes[task.lane].queue.push(task)

    const logState = nextSqliteBusyRetryLogState(task.label, BUSY_RETRY_LOG_THROTTLE_MS)
    if (logState.shouldLog) {
      log.warn(`SQLITE_BUSY during ${task.label}, retry ${task.busyAttempts}/${task.busyRetries}`, {
        meta: {
          delayMs: backoffMs,
          suppressedRetries: logState.suppressed > 0 ? logState.suppressed : undefined
        }
      })
    }
    return true
  }

  private settleTaskFailure(task: DbWriteTask<unknown>, error: unknown, waitedMs: number): void {
    if (task.busyRetries > 0 && task.busyAttempts >= task.busyRetries && isSqliteBusyError(error)) {
      // Scheduler-owned busy retries are exhausted: emit the exact event
      // withSqliteRetry would, so DatabaseModule keeps reporting
      // DATABASE_BUSY_RETRY_EXHAUSTED with unchanged labels.
      notifySqliteRetryExhausted({
        label: task.label,
        attempts: task.busyAttempts + 1,
        elapsedMs: Math.max(0, Date.now() - task.enqueuedAt),
        ...resolveSqliteErrorIdentity(error),
        error
      })
    }
    // Circuit accounting fires only on this final failure (once per
    // schedule() call), so circuit thresholds keep their meaning.
    this.markTaskFailure(task, error)
    this.recordTaskSettled(task.label, waitedMs, 'failed')
    task.reject(error)
  }

  /**
   * One lane's processing loop: executes that lane's tasks one at a time
   * (single writer per file). Both lane loops may be in flight concurrently —
   * they interleave on the event loop (the LibSQL local binding is synchronous
   * per execute) but neither ever waits for the other lane's queue, backoff
   * park, or file lock.
   */
  private async processLoop(lane: DbWriteLane): Promise<void> {
    const laneState = this.lanes[lane]
    if (laneState.processing) return

    laneState.processing = true

    let taskCount = 0
    while (laneState.queue.length > 0) {
      const now = Date.now()
      const taskIdx = this.pickNextTaskIndex(laneState, now)
      if (taskIdx < 0) {
        // Every task queued in this lane is parked for busy backoff: release
        // the lane loop and arm one wake-up for the earliest eligibility.
        // Never sleep (or spin) while holding a lane loop; backoff time is
        // spent queued. The other lane is unaffected.
        this.armEligibilityTimer(lane, now)
        break
      }

      const [task] = laneState.queue.splice(taskIdx, 1)
      const waitedMs = now - task.enqueuedAt
      laneState.currentTaskLabel = task.label
      laneState.currentTaskPriority = task.priority

      // The slow-wait warning measures head-of-line queue blocking, so the
      // task's own deliberate busy-backoff parks are excluded.
      const blockedWaitMs = waitedMs - task.busyBackoffTotalMs
      if (blockedWaitMs > 2000) {
        // Rate-limit slow-wait warnings: only log every 20th occurrence
        // during heavy indexing to avoid flooding the log with 11K+ entries.
        taskCount++
        if (taskCount <= 3 || taskCount % 20 === 0) {
          log.warn(
            `DB write task waited ${blockedWaitMs}ms: ${task.label}` +
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
        laneState.currentTaskLabel = null
        laneState.currentTaskPriority = null
        this.notifyCapacityWaiters()
        this.maybeLogLabelStats()
        continue
      }

      if (this.shouldRejectByCircuit(task)) {
        this.recordTaskSettled(task.label, waitedMs, 'dropped')
        task.reject(new Error(`DB write task dropped by circuit breaker: ${task.label}`))
        laneState.currentTaskLabel = null
        laneState.currentTaskPriority = null
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
        // Busy failures re-enter their lane with delayed eligibility instead
        // of settling; everything else (or exhausted retries) settles failed.
        if (!this.tryParkForBusyRetry(task, error)) {
          this.settleTaskFailure(task, error, waitedMs)
        }
      } finally {
        laneState.currentTaskLabel = null
        laneState.currentTaskPriority = null
      }

      // Notify capacity waiters after completing a task
      this.notifyCapacityWaiters()

      // Yield to event loop after every task to prevent blocking.
      this.maybeLogLabelStats()
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    laneState.processing = false

    // Final capacity notification when this lane goes idle.
    this.notifyCapacityWaiters()

    // Drain resolves only when EVERY lane is idle and empty (a lane that broke
    // out parked still has queued tasks, so drain keeps waiting for its timer).
    this.maybeResolveDrainWaiters()
  }
}

export const dbWriteScheduler = new DbWriteScheduler()
