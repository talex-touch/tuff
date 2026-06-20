import type { IndexedSourceEvidence } from './indexing-source'

export interface IndexedSourceRootEvidenceInput {
  id: string
  label: string
  roots: string[]
  emptyReason: string
  checkedAt?: number
  metadata?: Record<string, unknown>
}

export class IndexedSourceRootEvidenceService {
  build(input: IndexedSourceRootEvidenceInput): IndexedSourceEvidence {
    const rootCount = input.roots.length
    const checkedAt = normalizeEvidenceTimestamp(input.checkedAt)

    return {
      id: input.id,
      label: input.label,
      status: rootCount > 0 ? 'ready' : 'degraded',
      rootCount,
      roots: input.roots,
      lastCheckedAt: checkedAt,
      reason: rootCount > 0 ? undefined : input.emptyReason,
      metadata: input.metadata
    }
  }
}

function normalizeEvidenceTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now()
}
