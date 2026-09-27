import type { FileIndexProgress as FileIndexProgressPayload } from '@talex-touch/utils/transport/events/types'
import type { StreamContext } from '@talex-touch/utils/transport/main'
import type { IndexingProgressStreamThrottleConfig } from '@talex-touch/utils/search'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import {
  getIndexingProgressStreamFlushDelayMs,
  INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG,
  shouldEmitIndexingProgressStreamImmediately
} from '@talex-touch/utils/search'

export type FileProviderProgressStreamThrottleConfig = Omit<
  IndexingProgressStreamThrottleConfig,
  'terminalStages'
>

export const FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG: FileProviderProgressStreamThrottleConfig =
  {
    minEmitIntervalMs: INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG.minEmitIntervalMs,
    maxSilenceMs: INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG.maxSilenceMs,
    currentStep: INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG.currentStep
  }

function toSharedConfig(
  config: FileProviderProgressStreamThrottleConfig = FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG
): IndexingProgressStreamThrottleConfig {
  return {
    ...config,
    terminalStages: ['completed', 'idle']
  }
}

export function shouldEmitProgressStreamImmediately(input: {
  previous: FileIndexProgressPayload | null
  next: FileIndexProgressPayload
  now: number
  lastEmitAt: number
  config?: FileProviderProgressStreamThrottleConfig
}): boolean {
  return shouldEmitIndexingProgressStreamImmediately({
    ...input,
    config: toSharedConfig(input.config)
  })
}

export function getProgressStreamFlushDelayMs(
  now: number,
  lastEmitAt: number,
  config: FileProviderProgressStreamThrottleConfig = FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG
): number {
  return getIndexingProgressStreamFlushDelayMs(now, lastEmitAt, toSharedConfig(config))
}

const FILE_PROVIDER_PROGRESS_TASK_ID = 'file-provider.progress-cleanup'
const pollingService = PollingService.getInstance()

/**
 * The publish half of the progress stream: the live subscriptions, the last payload a
 * late subscriber replays, and the throttle timer between them.
 *
 * FileProvider owns exactly one for its lifetime. Moved out of `file-provider.ts` unchanged
 * (#343) — the throttle decision was already a module beside this one, and this is the state
 * that decision is about.
 */
export class FileProviderProgressStreamPublisher {
  private readonly contexts = new Set<StreamContext<FileIndexProgressPayload>>()
  private lastPayload: FileIndexProgressPayload | null = null
  private lastEmitAt = 0
  private pendingPayload: FileIndexProgressPayload | null = null
  private flushTimer: NodeJS.Timeout | null = null

  /** Drop every subscription and pending payload, timers included. */
  reset(): void {
    this.contexts.clear()
    this.lastPayload = null
    this.lastEmitAt = 0
    this.pendingPayload = null
    this.clearFlushTimer()
    this.clearCleanupTimer()
  }

  register(context: StreamContext<FileIndexProgressPayload>): void {
    this.contexts.add(context)
    if (this.lastPayload) {
      // Emit asynchronously to avoid adding extra sync work to stream-start handshake.
      setImmediate(() => {
        if (!context.isCancelled()) {
          context.emit(this.lastPayload as FileIndexProgressPayload)
        }
      })
    }
    this.ensureCleanupTimer()
  }

  emit(payload: FileIndexProgressPayload): void {
    if (this.contexts.size === 0) {
      this.lastPayload = payload
      this.clearFlushTimer()
      this.pendingPayload = null
      return
    }

    const now = Date.now()
    const previous = this.lastEmitAt > 0 ? this.lastPayload : null

    if (
      shouldEmitProgressStreamImmediately({
        previous,
        next: payload,
        now,
        lastEmitAt: this.lastEmitAt
      })
    ) {
      // An immediate transition is newer than any throttled payload already
      // waiting in the timer. Retire that payload before publishing so an old
      // `indexing 100%` update can never overwrite `completed` or `idle`.
      this.clearFlushTimer()
      this.pendingPayload = null
      this.flush(payload, now)
      return
    }

    this.pendingPayload = payload
    this.scheduleFlush(now)
  }

  private scheduleFlush(now: number): void {
    if (this.flushTimer) {
      return
    }

    const delayMs = getProgressStreamFlushDelayMs(now, this.lastEmitAt)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const pending = this.pendingPayload
      this.pendingPayload = null
      if (!pending) {
        return
      }
      this.flush(pending, Date.now())
    }, delayMs)
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  private flush(payload: FileIndexProgressPayload, emittedAt: number): void {
    this.lastPayload = payload
    this.lastEmitAt = emittedAt

    for (const stream of Array.from(this.contexts)) {
      if (stream.isCancelled()) {
        this.contexts.delete(stream)
        continue
      }
      stream.emit(payload)
    }

    if (this.contexts.size === 0) {
      this.clearFlushTimer()
      this.pendingPayload = null
      this.clearCleanupTimer()
    }
  }

  private ensureCleanupTimer(): void {
    if (pollingService.isRegistered(FILE_PROVIDER_PROGRESS_TASK_ID)) {
      return
    }

    pollingService.register(
      FILE_PROVIDER_PROGRESS_TASK_ID,
      () => {
        for (const stream of Array.from(this.contexts)) {
          if (stream.isCancelled()) {
            this.contexts.delete(stream)
          }
        }

        if (this.contexts.size === 0) {
          this.clearCleanupTimer()
        }
      },
      { interval: 30_000, unit: 'milliseconds' }
    )
    pollingService.start()
  }

  private clearCleanupTimer(): void {
    pollingService.unregister(FILE_PROVIDER_PROGRESS_TASK_ID)
    this.clearFlushTimer()
    this.pendingPayload = null
  }
}
