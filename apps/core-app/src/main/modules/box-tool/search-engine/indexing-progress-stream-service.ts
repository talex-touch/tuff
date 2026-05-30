export interface IndexingProgressStreamPayload<TStage extends string = string> {
  stage: TStage
  current: number
  total: number
  progress: number
}

export interface IndexingProgressStreamThrottleConfig {
  minEmitIntervalMs: number
  maxSilenceMs: number
  currentStep: number
  terminalStages: readonly string[]
}

export const INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG: IndexingProgressStreamThrottleConfig = {
  minEmitIntervalMs: 160,
  maxSilenceMs: 1000,
  currentStep: 25,
  terminalStages: ['completed', 'idle']
}

interface EmitImmediatelyInput<TPayload extends IndexingProgressStreamPayload> {
  previous: TPayload | null
  next: TPayload
  now: number
  lastEmitAt: number
  config?: IndexingProgressStreamThrottleConfig
}

export function shouldEmitIndexingProgressStreamImmediately<
  TPayload extends IndexingProgressStreamPayload
>({
  previous,
  next,
  now,
  lastEmitAt,
  config = INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG
}: EmitImmediatelyInput<TPayload>): boolean {
  if (!previous) {
    return true
  }

  if (next.stage !== previous.stage) {
    return true
  }

  if (config.terminalStages.includes(next.stage)) {
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

export function getIndexingProgressStreamFlushDelayMs(
  now: number,
  lastEmitAt: number,
  config: IndexingProgressStreamThrottleConfig = INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG
): number {
  const elapsed = now - lastEmitAt
  return Math.max(0, config.minEmitIntervalMs - elapsed)
}
