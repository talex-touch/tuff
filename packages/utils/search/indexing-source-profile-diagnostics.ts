import type {
  IndexedSourceEvidence,
  IndexedSourceHealthStatus,
  IndexedSourceRoot
} from './indexing-source'

export interface IndexedSourceProfileDiagnostic {
  key: string
  label: string
  status: IndexedSourceHealthStatus
  root?: string
  itemCount?: number
  reason?: string
  metadata?: Record<string, unknown>
}

export interface IndexedSourceProfileDiagnosticsInput {
  sourceId: string
  diagnostics: readonly IndexedSourceProfileDiagnostic[]
  checkedAt?: number
  rootWatchDepth?: number
  rootReason?: string
  metadata?: Record<string, unknown>
}

export class IndexedSourceProfileDiagnosticsService {
  buildEvidence(input: IndexedSourceProfileDiagnosticsInput): IndexedSourceEvidence[] {
    const checkedAt = normalizeEvidenceTimestamp(input.checkedAt)

    return input.diagnostics.map((diagnostic) => ({
      id: `${input.sourceId}:${diagnostic.key}`,
      label: diagnostic.label,
      status: diagnostic.status,
      itemCount: normalizeEvidenceCount(diagnostic.itemCount),
      rootCount: diagnostic.root ? 1 : 0,
      roots: diagnostic.root ? [diagnostic.root] : [],
      lastCheckedAt: checkedAt,
      reason: diagnostic.reason,
      metadata: {
        ...(input.metadata ?? {}),
        ...(diagnostic.metadata ?? {})
      }
    }))
  }

  buildRoots(input: IndexedSourceProfileDiagnosticsInput): IndexedSourceRoot[] {
    return input.diagnostics
      .filter((diagnostic) => Boolean(diagnostic.root) && diagnostic.status !== 'unsupported')
      .map((diagnostic) => ({
        sourceId: input.sourceId,
        path: diagnostic.root as string,
        permissionState: 'granted',
        watchDepth: input.rootWatchDepth,
        reason: input.rootReason ?? diagnostic.reason
      }))
  }
}

function normalizeEvidenceTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now()
}

function normalizeEvidenceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}
