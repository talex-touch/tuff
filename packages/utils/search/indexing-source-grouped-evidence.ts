import type { IndexedSourceEvidence } from './indexing-source'

export interface IndexedSourceGroupedEvidenceResult<TKey extends string = string> {
  sourceId: TKey
  itemCount: number
  label?: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface IndexedSourceGroupedEvidenceInput<TKey extends string = string> {
  sourceId: string
  keys: readonly TKey[]
  labels: Record<TKey, string>
  results: readonly IndexedSourceGroupedEvidenceResult<TKey>[]
  checkedAt?: number
  metadata?: Record<string, unknown>
  resultMetadata?: Record<string, unknown>
  emptyReason?: (key: TKey) => string
  overrides?: Partial<
    Record<
      TKey,
      {
        itemCount?: number
        status?: IndexedSourceEvidence['status']
        reason?: string
        metadata?: Record<string, unknown>
      }
    >
  >
}

export class IndexedSourceGroupedEvidenceService {
  build<TKey extends string>(input: IndexedSourceGroupedEvidenceInput<TKey>): IndexedSourceEvidence[] {
    const checkedAt = input.checkedAt ?? Date.now()
    const bySourceId = new Map<TKey, IndexedSourceGroupedEvidenceResult<TKey>>()

    for (const result of input.results) {
      bySourceId.set(result.sourceId, result)
    }

    return input.keys.map((key) => {
      const result = bySourceId.get(key)
      const override = input.overrides?.[key]
      const itemCount = override?.itemCount ?? result?.itemCount ?? 0

      return {
        id: `${input.sourceId}:${key}`,
        label: input.labels[key],
        status: override?.status ?? this.resolveStatus(result?.error, itemCount),
        itemCount,
        lastCheckedAt: checkedAt,
        reason: override?.reason ?? result?.error ?? (itemCount === 0 ? input.emptyReason?.(key) : undefined),
        metadata: {
          ...(input.metadata ?? {}),
          ...(input.resultMetadata ?? {}),
          ...(result?.metadata ?? {}),
          ...(result?.label ? { sourceLabel: result.label } : {}),
          ...(override?.metadata ?? {})
        }
      }
    })
  }

  private resolveStatus(error: string | undefined, itemCount: number): IndexedSourceEvidence['status'] {
    return error || itemCount === 0 ? 'degraded' : 'ready'
  }
}
