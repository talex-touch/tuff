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

export class IndexedWriteFlushRuntimeService<
  TResult,
  TReason extends string = string,
  TDecision extends IndexedWriteFlushRuntimeRetryDecision<TReason> =
    IndexedWriteFlushRuntimeRetryDecision<TReason>
> {
  private flushTimer: NodeJS.Timeout | null = null
  private flushing = false
  private retryCount = 0
  private readonly flushDeferMs: number

  constructor(
    private readonly deps: IndexedWriteFlushRuntimeServiceDeps<TResult, TReason, TDecision>
  ) {
    this.flushDeferMs = deps.config?.flushDeferMs ?? 300
  }

  scheduleFlush(delayMs: number, reason: string): void {
    if (this.flushTimer) {
      return
    }

    const safeDelay = Math.max(0, Math.round(delayMs))
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

    if (this.deps.getPendingSize() === 0) {
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
        pendingSize: this.deps.getPendingSize(),
        retryCount: this.retryCount
      })
      this.retryCount = decision.nextRetryCount
      this.deps.handleFailure({ error, decision })
      this.scheduleFlush(decision.delayMs, decision.reason)
    } finally {
      this.flushing = false
    }

    if (flushSucceeded && this.deps.getPendingSize() > 0) {
      this.scheduleFlush(this.deps.getFlushDelay(this.deps.getPendingSize()), 'drain-remaining')
    }
  }

  private recordIdle(reason: IndexedWriteFlushRuntimeIdleReason): void {
    this.deps.recordIdle({
      reason,
      pending: this.deps.getPendingSize(),
      inflight: this.deps.getInflightSize()
    })
  }
}
