export interface IndexedWorkerSchedulerConfig {
  chunkSize?: number
  /** Maximum chunks dispatching at once. Default 1. */
  maxInFlight?: number
  /**
   * Maximum chunks the scheduler retains at all (dispatching + queued).
   * Default 2, i.e. one active batch plus one queued batch. Records that do not
   * fit are returned to the caller as `deferred` and are never retained here —
   * durable overflow stays the caller's responsibility.
   */
  maxPendingBatches?: number
}

export interface IndexedWorkerSchedulerDeps<TPayload> {
  getWorkerContext: () => string | null
  dispatch: (context: string, payload: TPayload[]) => Promise<unknown>
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: IndexedWorkerSchedulerConfig
}

export interface IndexedWorkerScheduleBatch<TPayload> {
  payload: TPayload[]
  reason: string
  scopeId?: string
}

/**
 * Record counts returned by `schedule`. `accepted` records now occupy scheduler
 * capacity (dispatching or queued); `deferred` records were NOT retained and
 * must be made durable by the caller (e.g. file_index_progress pending rows).
 */
export interface IndexedWorkerScheduleResult {
  accepted: number
  deferred: number
}

export interface IndexedWorkerSchedulerSnapshot {
  activeBatches: number
  queuedBatches: number
  pendingRecords: number
  /**
   * Cumulative deferred record count since construction — never the current
   * backlog. Do not present this as queued work.
   */
  deferredRecords: number
}

interface IndexedWorkerPendingChunk<TPayload> {
  payload: TPayload[]
  reason: string
  scopeId?: string
}

interface IndexedWorkerDispatchFailure {
  scopeId?: string
  error: unknown
}

interface IndexedWorkerIdleWaiter {
  scopeId?: string
  resolve: () => void
}

export class IndexedWorkerSchedulerService<TPayload> {
  private readonly chunkSize: number
  private readonly maxInFlight: number
  private readonly maxPendingBatches: number
  private readonly queue: IndexedWorkerPendingChunk<TPayload>[] = []
  private readonly activeDispatches = new Map<Promise<void>, string | undefined>()
  private readonly dispatchFailures: IndexedWorkerDispatchFailure[] = []
  private readonly cancelledScopes = new Set<string>()
  private readonly idleWaiters = new Set<IndexedWorkerIdleWaiter>()
  private deferredRecords = 0
  private closed = false

  constructor(private readonly deps: IndexedWorkerSchedulerDeps<TPayload>) {
    this.chunkSize = normalizePositiveCount(deps.config?.chunkSize, 30)
    this.maxInFlight = normalizePositiveCount(deps.config?.maxInFlight, 1)
    this.maxPendingBatches = Math.max(this.maxInFlight, normalizePositiveCount(deps.config?.maxPendingBatches, 2))
  }

  schedule(batch: IndexedWorkerScheduleBatch<TPayload>): IndexedWorkerScheduleResult {
    const total = batch.payload.length
    if (total === 0 || this.closed) {
      return { accepted: 0, deferred: 0 }
    }
    if (batch.scopeId !== undefined && this.cancelledScopes.has(batch.scopeId)) {
      return { accepted: 0, deferred: 0 }
    }
    if (!this.deps.getWorkerContext()) {
      // No worker context yet: retain nothing, let the caller keep this durable.
      this.deferredRecords += total
      return { accepted: 0, deferred: total }
    }

    let accepted = 0
    for (let offset = 0; offset < total; offset += this.chunkSize) {
      if (this.activeDispatches.size + this.queue.length >= this.maxPendingBatches) {
        break
      }
      const chunk = batch.payload.slice(offset, offset + this.chunkSize)
      this.queue.push({ payload: chunk, reason: batch.reason, scopeId: batch.scopeId })
      accepted += chunk.length
    }

    const deferred = total - accepted
    this.deferredRecords += deferred
    this.pump()
    return { accepted, deferred }
  }

  getSnapshot(): IndexedWorkerSchedulerSnapshot {
    let pendingRecords = 0
    for (const chunk of this.queue) {
      pendingRecords += chunk.payload.length
    }
    return {
      activeBatches: this.activeDispatches.size,
      queuedBatches: this.queue.length,
      pendingRecords,
      deferredRecords: this.deferredRecords,
    }
  }

  hasPendingWork(scopeId?: string): boolean {
    return (
      this.hasScheduledWork(scopeId) ||
      this.dispatchFailures.some(failure => this.matchesScope(failure.scopeId, scopeId))
    )
  }

  async drain(timeoutMs = 15_000, scopeId?: string): Promise<void> {
    if (this.hasScheduledWork(scopeId)) {
      await new Promise<void>((resolve, reject) => {
        const waiter: IndexedWorkerIdleWaiter = {
          scopeId,
          resolve: () => {
            clearTimeout(timeout)
            this.idleWaiters.delete(waiter)
            resolve()
          },
        }
        const timeout = setTimeout(() => {
          this.idleWaiters.delete(waiter)
          reject(new Error('INDEXED_WORKER_SCHEDULER_DRAIN_TIMEOUT'))
        }, timeoutMs)
        this.idleWaiters.add(waiter)
      })
    }

    const failures = this.dispatchFailures.filter(failure => this.matchesScope(failure.scopeId, scopeId))
    if (failures.length === 0) return
    for (let index = this.dispatchFailures.length - 1; index >= 0; index -= 1) {
      const failure = this.dispatchFailures[index]
      if (failure && this.matchesScope(failure.scopeId, scopeId)) {
        this.dispatchFailures.splice(index, 1)
      }
    }
    throw new AggregateError(
      failures.map(failure => failure.error),
      'INDEXED_WORKER_SCHEDULER_DISPATCH_FAILED',
    )
  }

  cancelScope(scopeId: string): void {
    this.cancelledScopes.add(scopeId)
    this.cancelPending(scopeId)
  }

  cancelPending(scopeId?: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const chunk = this.queue[index]
      if (!chunk || !this.matchesScope(chunk.scopeId, scopeId)) continue
      this.queue.splice(index, 1)
    }
    for (let index = this.dispatchFailures.length - 1; index >= 0; index -= 1) {
      const failure = this.dispatchFailures[index]
      if (failure && this.matchesScope(failure.scopeId, scopeId)) {
        this.dispatchFailures.splice(index, 1)
      }
    }
    this.resolveIdleWaiters()
  }

  close(): void {
    this.closed = true
    this.cancelPending()
  }

  private pump(): void {
    if (this.closed) {
      this.resolveIdleWaiters()
      return
    }
    while (this.activeDispatches.size < this.maxInFlight && this.queue.length > 0) {
      const context = this.deps.getWorkerContext()
      if (!context) break
      const chunk = this.queue.shift()
      if (!chunk) break
      this.dispatchChunk(context, chunk)
    }
    this.resolveIdleWaiters()
  }

  private dispatchChunk(context: string, chunk: IndexedWorkerPendingChunk<TPayload>): void {
    const { payload, reason, scopeId } = chunk
    const dispatch = Promise.resolve()
      .then(async () => {
        if (scopeId !== undefined && this.cancelledScopes.has(scopeId)) return
        await this.deps.dispatch(context, payload)
      })
      .then(() => undefined)
      .catch(error => {
        if (scopeId !== undefined && this.cancelledScopes.has(scopeId)) return
        this.dispatchFailures.push({ scopeId, error })
        this.deps.logWarn('Index worker failed', error, {
          reason,
          size: payload.length,
          ...(scopeId ? { scopeId } : {}),
        })
      })
      .finally(() => {
        this.activeDispatches.delete(dispatch)
        this.pump()
        this.resolveIdleWaiters()
      })
    this.activeDispatches.set(dispatch, scopeId)
  }

  private resolveIdleWaiters(): void {
    for (const waiter of this.idleWaiters) {
      if (!this.hasScheduledWork(waiter.scopeId)) waiter.resolve()
    }
  }

  private hasScheduledWork(scopeId?: string): boolean {
    for (const chunk of this.queue) {
      if (this.matchesScope(chunk.scopeId, scopeId)) return true
    }
    for (const dispatchScopeId of this.activeDispatches.values()) {
      if (this.matchesScope(dispatchScopeId, scopeId)) return true
    }
    return false
  }

  private matchesScope(candidate: string | undefined, scopeId: string | undefined): boolean {
    return scopeId === undefined || candidate === scopeId
  }
}

function normalizePositiveCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}
