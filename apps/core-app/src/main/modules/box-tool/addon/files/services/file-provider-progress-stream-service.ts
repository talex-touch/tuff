import type { FileIndexProgress as FileIndexProgressPayload } from '@talex-touch/utils/transport/events/types'
import type { IndexingProgressStreamThrottleConfig } from '@talex-touch/utils/search'
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
