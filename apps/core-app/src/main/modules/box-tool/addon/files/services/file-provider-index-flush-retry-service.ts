import { isSqliteBusyError } from '../../../../../db/sqlite-retry'
import {
  getIndexWorkerBusyRetryDelay,
  getIndexWorkerFlushDelay
} from './file-provider-index-flush-service'

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
  private readonly config: Required<FileProviderIndexFlushRetryConfig>

  constructor(config: FileProviderIndexFlushRetryConfig = {}) {
    this.config = {
      baseDelayMs: config.baseDelayMs ?? 250,
      backlogDelayMs: config.backlogDelayMs ?? 500,
      busyRetryBaseMs: config.busyRetryBaseMs ?? 250,
      busyRetryMaxMs: config.busyRetryMaxMs ?? 5000
    }
  }

  getFlushDelay(pendingSize: number): number {
    return getIndexWorkerFlushDelay(pendingSize, {
      baseDelayMs: this.config.baseDelayMs,
      backlogDelayMs: this.config.backlogDelayMs
    })
  }

  resolveFailure(input: {
    error: unknown
    pendingSize: number
    retryCount: number
  }): FileProviderIndexFlushFailureDecision {
    const isBusy = isSqliteBusyError(input.error)
    if (isBusy) {
      const retry = getIndexWorkerBusyRetryDelay(input.retryCount, {
        baseDelayMs: this.config.busyRetryBaseMs,
        maxDelayMs: this.config.busyRetryMaxMs
      })
      return {
        isBusy,
        delayMs: retry.delayMs,
        nextRetryCount: retry.nextRetryCount,
        reason: 'sqlite-busy-retry'
      }
    }

    return {
      isBusy,
      delayMs: this.getFlushDelay(input.pendingSize),
      nextRetryCount: input.retryCount,
      reason: 'flush-failed'
    }
  }
}
