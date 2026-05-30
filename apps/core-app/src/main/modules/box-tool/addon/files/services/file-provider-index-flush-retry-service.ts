import { isSqliteBusyError } from '../../../../../db/sqlite-retry'
import { IndexedWriteFlushRetryService } from '../../../search-engine/indexing-write-flush-retry-service'

export interface FileProviderIndexFlushRetryConfig {
  baseDelayMs?: number
  backlogDelayMs?: number
  busyRetryBaseMs?: number
  busyRetryMaxMs?: number
}

export interface FileProviderIndexFlushFailureDecision {
  isBusy: boolean
  delayMs: number
  nextRetryCount: number
  reason: 'sqlite-busy-retry' | 'flush-failed'
}

export class FileProviderIndexFlushRetryService {
  private readonly retryService: IndexedWriteFlushRetryService

  constructor(config: FileProviderIndexFlushRetryConfig = {}) {
    this.retryService = new IndexedWriteFlushRetryService({
      baseDelayMs: config.baseDelayMs ?? 250,
      backlogDelayMs: config.backlogDelayMs ?? 500,
      retryBaseMs: config.busyRetryBaseMs ?? 250,
      retryMaxMs: config.busyRetryMaxMs ?? 5000
    })
  }

  getFlushDelay(pendingSize: number): number {
    return this.retryService.getFlushDelay(pendingSize)
  }

  resolveFailure(input: {
    error: unknown
    pendingSize: number
    retryCount: number
  }): FileProviderIndexFlushFailureDecision {
    const isBusy = isSqliteBusyError(input.error)
    const decision = this.retryService.resolveFailure({
      pendingSize: input.pendingSize,
      retryCount: input.retryCount,
      retryable: isBusy,
      retryableReason: 'sqlite-busy-retry',
      fallbackReason: 'flush-failed'
    })
    return {
      isBusy,
      delayMs: decision.delayMs,
      nextRetryCount: decision.nextRetryCount,
      reason: decision.reason
    }
  }
}
