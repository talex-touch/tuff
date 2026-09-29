import type {
  FileIndexEstimateBasis,
  FileIndexEstimateStatus,
  FileIndexProgress as FileIndexProgressPayload,
  FileIndexStage
} from '@talex-touch/utils/transport/events/types'
import type { StreamContext } from '@talex-touch/utils/transport/main'
import type { IndexingProgressStreamThrottleConfig } from '@talex-touch/utils/search'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import {
  getIndexingProgressStreamFlushDelayMs,
  INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG,
  shouldEmitIndexingProgressStreamImmediately
} from '@talex-touch/utils/search'
import { FileProviderProgressEstimatorService } from './file-provider-progress-estimator-service'

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

export function resolveFileProviderOverallProgress(input: {
  stage: string
  current: number
  total: number
  previousStage: string
  previousProgress: number
}): number {
  if (input.stage === 'idle') return 0
  if (input.stage === 'completed') return 100

  const stageWeights: Record<string, { start: number; weight: number }> = {
    cleanup: { start: 0, weight: 5 },
    scanning: { start: 5, weight: 20 },
    indexing: { start: 25, weight: 60 },
    reconciliation: { start: 85, weight: 15 }
  }
  const stageInfo = stageWeights[input.stage] ?? { start: 0, weight: 0 }
  const stageProgress =
    input.total > 0 ? Math.min(100, Math.max(0, (input.current / input.total) * 100)) : 0
  const candidate = stageInfo.start + (stageProgress / 100) * stageInfo.weight
  const previousProgress = input.previousStage === 'idle' ? 0 : input.previousProgress

  return Math.max(previousProgress, Math.min(100, Math.max(0, candidate)))
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

export interface FileProviderProgressStatusSnapshot {
  progress: {
    stage: FileIndexStage
    current: number
    total: number
    progress: number
  }
  startTime: number | null
  estimatedCompletion: number | null
  estimatedRemainingMs: number | null
  averageItemsPerSecond: number
  estimateStatus: FileIndexEstimateStatus
  speedSampleCount: number
  estimateBasis: FileIndexEstimateBasis
}

/** Owns whole-run progress, estimation and stream publication for one FileProvider. */
export class FileProviderProgressStateService {
  private readonly estimator = new FileProviderProgressEstimatorService()
  private progress = { stage: 'idle' as FileIndexStage, current: 0, total: 0 }
  private overallProgress = 0
  private startTime: number | null = null
  private stats = this.initialStats('idle')

  constructor(
    private readonly publisher: FileProviderProgressStreamPublisher,
    private readonly now: () => number = Date.now
  ) {}

  register(context: StreamContext<FileIndexProgressPayload>): void {
    this.publisher.register(context)
  }

  reset(): void {
    this.publisher.reset()
    this.resetRun()
  }

  resetRun(): void {
    this.progress = { stage: 'idle', current: 0, total: 0 }
    this.overallProgress = 0
    this.startTime = null
    this.stats = this.initialStats('idle')
    this.estimator.reset()
  }

  getSnapshot(isIndexing: boolean): FileProviderProgressStatusSnapshot {
    let estimatedCompletion: number | null = null
    let estimatedRemainingMs: number | null = null
    if (isIndexing && this.startTime) {
      const estimate = this.estimator.getEstimate()
      estimatedRemainingMs = estimate.estimatedRemainingMs
      this.applyEstimate(estimate)
      if (estimatedRemainingMs != null) estimatedCompletion = this.now() + estimatedRemainingMs
    } else if (!isIndexing) {
      estimatedRemainingMs = 0
    }

    return {
      progress: { ...this.progress, progress: this.overallProgress },
      startTime: this.startTime,
      estimatedCompletion,
      estimatedRemainingMs,
      averageItemsPerSecond: this.stats.averageItemsPerSecond,
      estimateStatus: this.stats.estimateStatus,
      speedSampleCount: this.stats.speedSampleCount,
      estimateBasis: this.stats.estimateBasis
    }
  }

  emit(stage: FileIndexStage, current: number, total: number): void {
    const now = this.now()
    this.overallProgress = resolveFileProviderOverallProgress({
      stage,
      current,
      total,
      previousStage: this.progress.stage,
      previousProgress: this.overallProgress
    })

    if (stage !== 'idle' && stage !== 'completed' && !this.startTime) {
      this.startTime = now
      this.stats.startTime = now
      this.stats.processedItems = 0
      this.stats.lastUpdateTime = now
    }
    if (this.startTime && stage !== 'idle' && stage !== 'completed') {
      const elapsed = (now - this.stats.startTime) / 1_000
      if (elapsed > 0 && current > 0) this.stats.averageItemsPerSecond = current / elapsed
      this.stats.processedItems = current
      this.stats.lastUpdateTime = now
    }
    if (stage === 'completed' || stage === 'idle') {
      this.startTime = null
      this.stats = this.initialStats(stage)
      this.estimator.reset()
    }

    this.progress = { stage, current, total }
    const estimate = this.estimator.update({ stage, current, total, now })
    this.applyEstimate(estimate)
    this.publisher.emit({
      stage,
      current,
      total,
      progress: this.overallProgress,
      startTime: this.startTime,
      estimatedRemainingMs: estimate.estimatedRemainingMs,
      averageItemsPerSecond: this.stats.averageItemsPerSecond,
      estimateStatus: estimate.status,
      speedSampleCount: estimate.speedSampleCount,
      estimateBasis: estimate.estimateBasis
    })
  }

  private applyEstimate(
    estimate: ReturnType<FileProviderProgressEstimatorService['getEstimate']>
  ): void {
    this.stats.averageItemsPerSecond = estimate.averageItemsPerSecond
    this.stats.estimateStatus = estimate.status
    this.stats.speedSampleCount = estimate.speedSampleCount
    this.stats.estimateBasis = estimate.estimateBasis
  }

  private initialStats(stage: FileIndexStage) {
    return {
      processedItems: 0,
      startTime: 0,
      lastUpdateTime: 0,
      averageItemsPerSecond: 0,
      estimateStatus: (stage === 'completed' ? 'complete' : 'unknown') as FileIndexEstimateStatus,
      speedSampleCount: 0,
      estimateBasis: (stage === 'completed' ? 'complete' : 'none') as FileIndexEstimateBasis
    }
  }
}
