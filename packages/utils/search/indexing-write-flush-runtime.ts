export type IndexedWriteFlushRuntimeIdleReason = 'unavailable' | 'no-pending' | 'flush-in-progress'

export interface IndexedWriteFlushRuntimeRetryDecision<TReason extends string = string> {
  delayMs: number
  nextRetryCount: number
  reason: TReason
}

export interface IndexedWriteFlushRuntimeRetryInput {
  error: unknown
  pendingSize: number
  retryCount: number
}

export interface IndexedWriteFlushRuntimeConfig {
  baseDelayMs?: number | undefined
  backlogDelayMs?: number | undefined
  flushDeferMs?: number | undefined
  backpressureMaxQueued?: number | undefined
  retryBaseMs?: number | undefined
  retryMaxMs?: number | undefined
}

export interface ResolvedIndexedWriteFlushRuntimeConfig {
  baseDelayMs: number
  backlogDelayMs: number
  flushDeferMs: number
  backpressureMaxQueued: number
  retryBaseMs: number
  retryMaxMs: number
}

export interface IndexedWriteFlushRuntimeRescheduleDecision {
  delayMs: number
  reason: string
}

export interface IndexedWriteFlushRuntimeServiceDeps<
  TResult,
  TReason extends string = string,
  TDecision extends IndexedWriteFlushRuntimeRetryDecision<TReason> =
    IndexedWriteFlushRuntimeRetryDecision<TReason>
> {
  getPendingSize: () => number
  getInflightSize: () => number
  isAvailable: () => boolean
  executeFlush: () => Promise<TResult>
  recordIdle: (input: {
    reason: IndexedWriteFlushRuntimeIdleReason
    pending: number
    inflight: number
  }) => void
  getFlushDelay: (pendingSize: number) => number
  resolveFailure: (input: IndexedWriteFlushRuntimeRetryInput) => TDecision
  handleFailure: (input: { error: unknown; decision: TDecision }) => void
  shouldRescheduleAfterResult?: (
    result: TResult
  ) => IndexedWriteFlushRuntimeRescheduleDecision | null
  onUnexpectedFlushError?: (error: unknown, reason: string) => void
  config?: {
    flushDeferMs?: number
  }
}

export function resolveIndexedWriteFlushRuntimeConfig(
  config: IndexedWriteFlushRuntimeConfig = {}
): ResolvedIndexedWriteFlushRuntimeConfig {
  return {
    baseDelayMs: normalizeRuntimeCount(config.baseDelayMs, 250),
    backlogDelayMs: normalizeRuntimeCount(config.backlogDelayMs, 500),
    flushDeferMs: normalizeRuntimeCount(config.flushDeferMs, 300),
    backpressureMaxQueued: normalizeRuntimeCount(config.backpressureMaxQueued, 10),
    retryBaseMs: normalizeRuntimeCount(config.retryBaseMs, 250),
    retryMaxMs: normalizeRuntimeCount(config.retryMaxMs, 5000)
  }
}

export class IndexedWriteFlushRuntimeService<
  TResult,
  TReason extends string = string,
  TDecision extends IndexedWriteFlushRuntimeRetryDecision<TReason> =
    IndexedWriteFlushRuntimeRetryDecision<TReason>
> {
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private retryCount = 0
  private readonly flushDeferMs: number

  constructor(
    private readonly deps: IndexedWriteFlushRuntimeServiceDeps<TResult, TReason, TDecision>
  ) {
    this.flushDeferMs = normalizeRuntimeCount(deps.config?.flushDeferMs, 300)
  }

  scheduleFlush(delayMs: number, reason: string): void {
    if (this.flushTimer) {
      return
    }

    const safeDelay = normalizeRuntimeCount(delayMs, 0)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush().catch((error) => {
        this.deps.onUnexpectedFlushError?.(error, reason)
      })
    }, safeDelay)
  }

  async flush(): Promise<void> {
    if (!this.deps.isAvailable()) {
      this.recordIdle('unavailable')
      return
    }

    if (this.getPendingSize() === 0) {
      this.recordIdle('no-pending')
      return
    }

    if (this.flushing) {
      this.recordIdle('flush-in-progress')
      this.scheduleFlush(this.flushDeferMs, 'flush-in-progress')
      return
    }

    this.flushing = true
    let flushSucceeded = false
    try {
      const result = await this.deps.executeFlush()
      this.retryCount = 0
      flushSucceeded = true

      const reschedule = this.deps.shouldRescheduleAfterResult?.(result)
      if (reschedule) {
        this.scheduleFlush(reschedule.delayMs, reschedule.reason)
      }
    } catch (error) {
      const decision = this.deps.resolveFailure({
        error,
        pendingSize: this.getPendingSize(),
        retryCount: this.retryCount
      })
      const safeDecision = this.normalizeRetryDecision(decision)
      this.retryCount = safeDecision.nextRetryCount
      this.deps.handleFailure({ error, decision: safeDecision })
      this.scheduleFlush(safeDecision.delayMs, safeDecision.reason)
    } finally {
      this.flushing = false
    }

    const pendingSize = this.getPendingSize()
    if (flushSucceeded && pendingSize > 0) {
      this.scheduleFlush(this.deps.getFlushDelay(pendingSize), 'drain-remaining')
    }
  }

  private recordIdle(reason: IndexedWriteFlushRuntimeIdleReason): void {
    this.deps.recordIdle({
      reason,
      pending: this.getPendingSize(),
      inflight: this.getInflightSize()
    })
  }

  private getPendingSize(): number {
    return normalizeRuntimeCount(this.deps.getPendingSize(), 0)
  }

  private getInflightSize(): number {
    return normalizeRuntimeCount(this.deps.getInflightSize(), 0)
  }

  private normalizeRetryDecision(decision: TDecision): TDecision {
    return {
      ...decision,
      delayMs: normalizeRuntimeCount(decision.delayMs, 0),
      nextRetryCount: normalizeRuntimeCount(decision.nextRetryCount, this.retryCount)
    }
  }
}

function normalizeRuntimeCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback
}
