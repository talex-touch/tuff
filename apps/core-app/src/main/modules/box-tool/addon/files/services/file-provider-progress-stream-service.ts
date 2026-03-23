import type { FileIndexProgress as FileIndexProgressPayload } from '@talex-touch/utils/transport/events/types'

export interface FileProviderProgressStreamThrottleConfig {
  minEmitIntervalMs: number
  maxSilenceMs: number
  currentStep: number
}

export const FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG: FileProviderProgressStreamThrottleConfig =
  {
    minEmitIntervalMs: 160,
    maxSilenceMs: 1000,
    currentStep: 25
  }

interface EmitImmediatelyInput {
  previous: FileIndexProgressPayload | null
  next: FileIndexProgressPayload
  now: number
  lastEmitAt: number
  config?: FileProviderProgressStreamThrottleConfig
}

export function shouldEmitProgressStreamImmediately({
  previous,
  next,
  now,
  lastEmitAt,
  config = FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG
}: EmitImmediatelyInput): boolean {
  if (!previous) {
    return true
  }

  if (next.stage !== previous.stage) {
    return true
  }

  if (next.stage === 'completed' || next.stage === 'idle') {
    return true
  }

  const elapsed = now - lastEmitAt
  if (elapsed >= config.maxSilenceMs) {
    return true
  }

  if (elapsed < config.minEmitIntervalMs) {
    return false
  }

  if (next.progress !== previous.progress) {
    return true
  }
  if (Math.abs(next.current - previous.current) >= config.currentStep) {
    return true
  }
  if (next.total !== previous.total) {
    return true
  }
  return false
}

export function getProgressStreamFlushDelayMs(
  now: number,
  lastEmitAt: number,
  config: FileProviderProgressStreamThrottleConfig = FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG
): number {
  const elapsed = now - lastEmitAt
  return Math.max(0, config.minEmitIntervalMs - elapsed)
}
