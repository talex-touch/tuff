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
  const normalizedConfig = normalizeStreamConfig(config)
  const normalizedPrevious = previous ? normalizePayload(previous) : null
  const normalizedNext = normalizePayload(next)
  const normalizedLastEmitAt = normalizeTimestamp(lastEmitAt, 0)
  const normalizedNow = Math.max(normalizedLastEmitAt, normalizeTimestamp(now, normalizedLastEmitAt))

  if (!normalizedPrevious) {
    return true
  }

  if (normalizedNext.stage !== normalizedPrevious.stage) {
    return true
  }

  if (normalizedConfig.terminalStages.includes(normalizedNext.stage)) {
    return true
  }

  const elapsed = normalizedNow - normalizedLastEmitAt
  if (elapsed >= normalizedConfig.maxSilenceMs) {
    return true
  }

  if (elapsed < normalizedConfig.minEmitIntervalMs) {
    return false
  }

  if (normalizedNext.progress !== normalizedPrevious.progress) {
    return true
  }
  if (Math.abs(normalizedNext.current - normalizedPrevious.current) >= normalizedConfig.currentStep) {
    return true
  }
  if (normalizedNext.total !== normalizedPrevious.total) {
    return true
  }
  return false
}

export function getIndexingProgressStreamFlushDelayMs(
  now: number,
  lastEmitAt: number,
  config: IndexingProgressStreamThrottleConfig = INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG
): number {
  const normalizedConfig = normalizeStreamConfig(config)
  const normalizedLastEmitAt = normalizeTimestamp(lastEmitAt, 0)
  const normalizedNow = Math.max(normalizedLastEmitAt, normalizeTimestamp(now, normalizedLastEmitAt))
  const elapsed = normalizedNow - normalizedLastEmitAt
  return Math.max(0, normalizedConfig.minEmitIntervalMs - elapsed)
}

function normalizePayload<TPayload extends IndexingProgressStreamPayload>(payload: TPayload): TPayload {
  return {
    ...payload,
    current: normalizeCount(payload.current),
    total: normalizeCount(payload.total),
    progress: normalizeProgress(payload.progress)
  }
}

function normalizeStreamConfig(
  config: IndexingProgressStreamThrottleConfig
): IndexingProgressStreamThrottleConfig {
  return {
    minEmitIntervalMs: normalizeCount(
      config.minEmitIntervalMs,
      INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG.minEmitIntervalMs
    ),
    maxSilenceMs: normalizeCount(
      config.maxSilenceMs,
      INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG.maxSilenceMs
    ),
    currentStep: normalizeCount(
      config.currentStep,
      INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG.currentStep
    ),
    terminalStages: config.terminalStages
  }
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeCount(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function normalizeProgress(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}
