import type {
  EverythingBackendType,
  EverythingDiagnosticStage,
  EverythingDiagnosticStatus,
  EverythingDiagnostics,
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
