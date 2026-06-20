export interface IndexingProgressEstimate {
  estimatedRemainingMs: number | null
  averageItemsPerSecond: number
  status: IndexingProgressEstimateStatus
  speedSampleCount: number
  estimateBasis: IndexingProgressEstimateBasis
}

export type IndexingProgressEstimateStatus =
  | 'unknown'
  | 'stabilizing'
  | 'estimated'
  | 'stalled'
  | 'complete'

export type IndexingProgressEstimateBasis =
  | 'none'
  | 'stage-speed'
  | 'elapsed-progress'
  | 'stalled'
  | 'complete'

export interface IndexingProgressSample<TStage extends string = string> {
  stage: TStage
  current: number
  total: number
  now: number
}

export interface IndexingProgressEstimatorOptions<TStage extends string = string> {
  terminalStages?: readonly TStage[]
  completedStages?: readonly TStage[]
  minSampleIntervalMs?: number
  minProgressRatioForEta?: number
  minSpeedSamplesForEta?: number
  maxNoProgressMs?: number
  smoothingFactor?: number
  maxEtaMs?: number
  minElapsedMsForFallbackEta?: number
  fallbackEtaSafetyMultiplier?: number
}

const DEFAULT_MIN_SAMPLE_INTERVAL_MS = 500
const DEFAULT_MIN_PROGRESS_RATIO_FOR_ETA = 0.03
const DEFAULT_MIN_SPEED_SAMPLES_FOR_ETA = 2
const DEFAULT_MAX_NO_PROGRESS_MS = 15_000
const DEFAULT_SMOOTHING_FACTOR = 0.28
const DEFAULT_MAX_ETA_MS = 24 * 60 * 60 * 1000
const DEFAULT_MIN_ELAPSED_MS_FOR_FALLBACK_ETA = 3_000
const DEFAULT_FALLBACK_ETA_SAFETY_MULTIPLIER = 1.2

function clampEta(value: number, maxEtaMs: number): number {
  if (!Number.isFinite(value)) return maxEtaMs
  return Math.max(0, Math.min(maxEtaMs, value))
}

export class IndexingProgressEstimatorService<TStage extends string = string> {
  private readonly terminalStages: Set<TStage>
  private readonly completedStages: Set<TStage>
  private readonly minSampleIntervalMs: number
  private readonly minProgressRatioForEta: number
  private readonly minSpeedSamplesForEta: number
  private readonly maxNoProgressMs: number
  private readonly smoothingFactor: number
  private readonly maxEtaMs: number
  private readonly minElapsedMsForFallbackEta: number
  private readonly fallbackEtaSafetyMultiplier: number
  private stage: TStage | null = null
  private stageStartedAt = 0
  private lastSample: IndexingProgressSample<TStage> | null = null
  private lastProgressAt = 0
  private speedSampleCount = 0
  private smoothedItemsPerSecond = 0
  private lastEstimate: IndexingProgressEstimate = {
    estimatedRemainingMs: null,
    averageItemsPerSecond: 0,
    status: 'unknown',
    speedSampleCount: 0,
    estimateBasis: 'none'
  }

  constructor(options: IndexingProgressEstimatorOptions<TStage> = {}) {
    this.terminalStages = new Set(options.terminalStages ?? [])
    this.completedStages = new Set(options.completedStages ?? [])
    this.minSampleIntervalMs = normalizeNonNegativeNumber(
      options.minSampleIntervalMs,
      DEFAULT_MIN_SAMPLE_INTERVAL_MS
    )
    this.minProgressRatioForEta =
      normalizeNonNegativeNumber(options.minProgressRatioForEta, DEFAULT_MIN_PROGRESS_RATIO_FOR_ETA)
    this.minSpeedSamplesForEta = normalizeNonNegativeInteger(
      options.minSpeedSamplesForEta,
      DEFAULT_MIN_SPEED_SAMPLES_FOR_ETA
    )
    this.maxNoProgressMs = normalizeNonNegativeNumber(
      options.maxNoProgressMs,
      DEFAULT_MAX_NO_PROGRESS_MS
    )
    this.smoothingFactor = normalizeSmoothingFactor(options.smoothingFactor)
    this.maxEtaMs = normalizeNonNegativeNumber(options.maxEtaMs, DEFAULT_MAX_ETA_MS)
    this.minElapsedMsForFallbackEta =
      normalizeNonNegativeNumber(
        options.minElapsedMsForFallbackEta,
        DEFAULT_MIN_ELAPSED_MS_FOR_FALLBACK_ETA
      )
    this.fallbackEtaSafetyMultiplier =
      normalizeNonNegativeNumber(
        options.fallbackEtaSafetyMultiplier,
        DEFAULT_FALLBACK_ETA_SAFETY_MULTIPLIER
      )
  }

  reset(): void {
    this.stage = null
    this.stageStartedAt = 0
    this.lastSample = null
    this.lastProgressAt = 0
    this.speedSampleCount = 0
    this.smoothedItemsPerSecond = 0
    this.lastEstimate = {
      estimatedRemainingMs: null,
      averageItemsPerSecond: 0,
      status: 'unknown',
      speedSampleCount: 0,
      estimateBasis: 'none'
    }
  }

  getEstimate(): IndexingProgressEstimate {
    return this.lastEstimate
  }

  update(rawInput: IndexingProgressSample<TStage>): IndexingProgressEstimate {
    const input = this.normalizeSample(rawInput)

    if (this.terminalStages.has(input.stage)) {
      const estimate = {
        estimatedRemainingMs: this.completedStages.has(input.stage) ? 0 : null,
        averageItemsPerSecond: 0,
        status: this.completedStages.has(input.stage)
          ? ('complete' as const)
          : ('unknown' as const),
        speedSampleCount: 0,
        estimateBasis: this.completedStages.has(input.stage)
          ? ('complete' as const)
          : ('none' as const)
      }
      this.reset()
      this.lastEstimate = estimate
      return estimate
    }

    if (this.stage !== input.stage) {
      this.stage = input.stage
      this.stageStartedAt = input.now
      this.lastSample = input
      this.lastProgressAt = input.current > 0 ? input.now : 0
      this.speedSampleCount = 0
      this.smoothedItemsPerSecond = 0
      this.lastEstimate = {
        estimatedRemainingMs: null,
        averageItemsPerSecond: 0,
        status: input.current > 0 ? 'stabilizing' : 'unknown',
        speedSampleCount: 0,
        estimateBasis: 'none'
      }
      return this.lastEstimate
    }

    const previous = this.lastSample
    if (!previous) {
      this.lastSample = input
      return this.lastEstimate
    }

    const deltaMs = input.now - previous.now
    const deltaItems = input.current - previous.current
    if (deltaMs >= this.minSampleIntervalMs && deltaItems > 0) {
      const instantItemsPerSecond = deltaItems / (deltaMs / 1000)
      this.smoothedItemsPerSecond =
        this.smoothedItemsPerSecond > 0
          ? this.smoothedItemsPerSecond * (1 - this.smoothingFactor) +
            instantItemsPerSecond * this.smoothingFactor
          : instantItemsPerSecond
      this.lastProgressAt = input.now
      this.speedSampleCount += 1
      this.lastSample = input
    } else if (input.current < previous.current) {
      this.lastSample = input
      this.lastProgressAt = input.current > 0 ? input.now : 0
      this.speedSampleCount = 0
      this.smoothedItemsPerSecond = 0
      this.lastEstimate = {
        estimatedRemainingMs: null,
        averageItemsPerSecond: 0,
        status: input.current > 0 ? 'stabilizing' : 'unknown',
        speedSampleCount: 0,
        estimateBasis: 'none'
      }
      return this.lastEstimate
    } else if (deltaMs >= this.minSampleIntervalMs) {
      this.lastSample = input
    }

    const progressRatio = input.total > 0 ? input.current / input.total : 0
    const remainingItems = Math.max(0, input.total - input.current)
    const noProgressMs = this.lastProgressAt > 0 ? input.now - this.lastProgressAt : 0

    if (input.total > 0 && remainingItems === 0) {
      this.lastEstimate = {
        estimatedRemainingMs: 0,
        averageItemsPerSecond: this.smoothedItemsPerSecond || this.getElapsedItemsPerSecond(input),
        status: 'estimated',
        speedSampleCount: this.speedSampleCount,
        estimateBasis: this.smoothedItemsPerSecond > 0 ? 'stage-speed' : 'elapsed-progress'
      }
      return this.lastEstimate
    }

    if (noProgressMs >= this.maxNoProgressMs) {
      this.lastEstimate = {
        estimatedRemainingMs: null,
        averageItemsPerSecond: 0,
        status: 'stalled',
        speedSampleCount: this.speedSampleCount,
        estimateBasis: 'stalled'
      }
      return this.lastEstimate
    }

    if (
      input.total <= 0 ||
      input.current <= 0 ||
      progressRatio < this.minProgressRatioForEta ||
      (this.speedSampleCount < this.minSpeedSamplesForEta &&
        !this.canUseElapsedProgressFallback(input, remainingItems)) ||
      (this.smoothedItemsPerSecond <= 0 &&
        !this.canUseElapsedProgressFallback(input, remainingItems))
    ) {
      this.lastEstimate = {
        estimatedRemainingMs: null,
        averageItemsPerSecond: this.smoothedItemsPerSecond,
        status: input.current > 0 ? 'stabilizing' : 'unknown',
        speedSampleCount: this.speedSampleCount,
        estimateBasis: 'none'
      }
      return this.lastEstimate
    }

    const canUseStageSpeed =
      this.speedSampleCount >= this.minSpeedSamplesForEta && this.smoothedItemsPerSecond > 0
    const elapsedItemsPerSecond = this.getElapsedItemsPerSecond(input)
    const effectiveItemsPerSecond = canUseStageSpeed
      ? this.smoothedItemsPerSecond
      : elapsedItemsPerSecond
    const basis: IndexingProgressEstimateBasis = canUseStageSpeed
      ? 'stage-speed'
      : 'elapsed-progress'
    const safetyMultiplier = canUseStageSpeed ? 1 : this.fallbackEtaSafetyMultiplier
    const estimatedRemainingMs = clampEta(
      (remainingItems / effectiveItemsPerSecond) * 1000 * safetyMultiplier,
      this.maxEtaMs
    )

    this.lastEstimate = {
      estimatedRemainingMs,
      averageItemsPerSecond: effectiveItemsPerSecond,
      status: 'estimated',
      speedSampleCount: this.speedSampleCount,
      estimateBasis: basis
    }
    return this.lastEstimate
  }

  private canUseElapsedProgressFallback(
    input: IndexingProgressSample<TStage>,
    remainingItems: number
  ): boolean {
    if (remainingItems <= 0) {
      return true
    }

    const elapsedMs = input.now - this.stageStartedAt
    return (
      this.stageStartedAt > 0 &&
      elapsedMs >= this.minElapsedMsForFallbackEta &&
      this.getElapsedItemsPerSecond(input) > 0
    )
  }

  private getElapsedItemsPerSecond(input: IndexingProgressSample<TStage>): number {
    const elapsedMs = input.now - this.stageStartedAt
    if (elapsedMs <= 0 || input.current <= 0) {
      return 0
    }
    return input.current / (elapsedMs / 1000)
  }

  private normalizeSample(input: IndexingProgressSample<TStage>): IndexingProgressSample<TStage> {
    const fallbackNow = this.lastSample?.now ?? this.stageStartedAt
    const now = Math.max(
      fallbackNow,
      normalizeNonNegativeNumber(input.now, fallbackNow)
    )

    return {
      stage: input.stage,
      current: normalizeNonNegativeInteger(input.current, 0),
      total: normalizeNonNegativeInteger(input.total, 0),
      now
    }
  }
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  return Math.floor(normalizeNonNegativeNumber(value, fallback))
}

function normalizeSmoothingFactor(value: unknown): number {
  const normalized = normalizeNonNegativeNumber(value, DEFAULT_SMOOTHING_FACTOR)
  return Math.min(1, normalized)
}
