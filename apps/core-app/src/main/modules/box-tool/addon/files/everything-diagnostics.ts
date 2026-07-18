import type {
  EverythingBackendType,
  EverythingDiagnosticStage,
  EverythingDiagnosticStatus,
  EverythingDiagnostics,
  EverythingPerformanceSummary,
  EverythingResultSample
} from '../../../../../shared/events/everything'
import { performance } from 'node:perf_hooks'

export interface EverythingResultLike {
  path: string
  name: string
  extension: string
  size: number
  mtime: Date
  isDir: boolean
}

export interface RecordDiagnosticStageInput {
  stage: EverythingDiagnosticStage
  status: EverythingDiagnosticStatus
  backend: EverythingBackendType
  startedAt: number
  target?: string | null
  error?: string | null
  errorCode?: string | null
  attempts?: number
}

export class EverythingDiagnosticsTracker {
  private diagnostics: EverythingDiagnostics = {
    stages: {},
    lastUpdated: null
  }

  reset(): void {
    this.replace({ stages: {}, lastUpdated: null })
  }

  replace(diagnostics: EverythingDiagnostics): void {
    this.diagnostics = {
      stages: { ...diagnostics.stages },
      lastUpdated: diagnostics.lastUpdated
    }
  }

  record({
    stage,
    status,
    backend,
    startedAt,
    target = null,
    error = null,
    errorCode = null,
    attempts
  }: RecordDiagnosticStageInput): void {
    const timestamp = Date.now()
    this.diagnostics = {
      stages: {
        ...this.diagnostics.stages,
        [stage]: {
          stage,
          status,
          backend,
          target,
          error,
          errorCode,
          duration: Math.round(performance.now() - startedAt),
          attempts,
          timestamp
        }
      },
      lastUpdated: timestamp
    }
  }

  snapshot(): EverythingDiagnostics {
    return {
      stages: { ...this.diagnostics.stages },
      lastUpdated: this.diagnostics.lastUpdated
    }
  }

  durationByStage(): Partial<Record<EverythingDiagnosticStage, number>> {
    const durationByStage: Partial<Record<EverythingDiagnosticStage, number>> = {}
    for (const [stage, summary] of Object.entries(this.diagnostics.stages) as Array<
      [EverythingDiagnosticStage, EverythingDiagnostics['stages'][EverythingDiagnosticStage]]
    >) {
      if (typeof summary?.duration === 'number') {
        durationByStage[stage] = summary.duration
      }
    }
    return durationByStage
  }
}

export type EverythingPerformanceOutcome = 'success' | 'timeout' | 'error' | 'aborted'

interface EverythingPerformanceSample {
  backend: Exclude<EverythingBackendType, 'unavailable'>
  outcome: EverythingPerformanceOutcome
  durationMs: number
  fallback: boolean
}

export class EverythingPerformanceTracker {
  private readonly samples: Array<EverythingPerformanceSample | undefined>
  private readonly capacity: number
  private nextIndex = 0
  private size = 0

  constructor(capacity = 500) {
    this.capacity = Math.max(1, Math.floor(capacity))
    this.samples = new Array(this.capacity)
  }

  record(sample: EverythingPerformanceSample): void {
    const durationMs = Number.isFinite(sample.durationMs)
      ? Math.max(0, Math.round(sample.durationMs))
      : 0
    this.samples[this.nextIndex] = { ...sample, durationMs }
    this.nextIndex = (this.nextIndex + 1) % this.capacity
    this.size = Math.min(this.size + 1, this.capacity)
  }

  snapshot(): EverythingPerformanceSummary {
    const durations: number[] = []
    let successCount = 0
    let timeoutCount = 0
    let errorCount = 0
    let abortedCount = 0
    let sdkCount = 0
    let cliCount = 0
    let fallbackCount = 0

    for (let index = 0; index < this.size; index += 1) {
      const sample = this.samples[index]
      if (!sample) continue

      if (sample.backend === 'sdk-napi') sdkCount += 1
      else cliCount += 1
      if (sample.fallback) fallbackCount += 1

      if (sample.outcome === 'success') successCount += 1
      else if (sample.outcome === 'timeout') timeoutCount += 1
      else if (sample.outcome === 'error') errorCount += 1
      else abortedCount += 1

      if (sample.outcome !== 'aborted') durations.push(sample.durationMs)
    }

    durations.sort((left, right) => left - right)
    const percentile = (ratio: number): number | null => {
      if (durations.length === 0) return null
      const index = Math.min(
        durations.length - 1,
        Math.max(0, Math.ceil(ratio * durations.length) - 1)
      )
      return durations[index]
    }

    return {
      sampleCount: this.size,
      durationSampleCount: durations.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: durations.length > 0 ? durations[durations.length - 1] : null,
      successCount,
      timeoutCount,
      errorCount,
      abortedCount,
      sdkCount,
      cliCount,
      fallbackCount,
      fallbackRatio: this.size > 0 ? Number((fallbackCount / this.size).toFixed(4)) : 0
    }
  }
}

export function toEverythingResultSample(
  result: EverythingResultLike | null
): EverythingResultSample | null {
  if (!result) {
    return null
  }
  return {
    path: result.path,
    name: result.name,
    extension: result.extension,
    size: result.size,
    mtime: result.mtime.toISOString(),
    isDir: result.isDir
  }
}
