import { isSqliteBusyError } from '../../../../../db/sqlite-retry'
import { IndexedWriteFlushRetryService } from '@talex-touch/utils/search'

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
    const decision = this.retryService.resolveClassifiedFailure({
      error: input.error,
      pendingSize: input.pendingSize,
      retryCount: input.retryCount,
      classify: (error) => (isSqliteBusyError(error) ? 'sqlite-busy' : null),
      retryableClassifications: ['sqlite-busy'],
      retryableReason: 'sqlite-busy-retry',
      fallbackReason: 'flush-failed'
    })
    return {
      isBusy: decision.classification === 'sqlite-busy',
      delayMs: decision.delayMs,
      nextRetryCount: decision.nextRetryCount,
      reason: decision.reason
    }
  }
}
