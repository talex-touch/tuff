import type { IndexedSourceTaskHistoryKind } from './indexing-source'

export type IndexedSourceRuntimeTaskKind = IndexedSourceTaskHistoryKind

export interface IndexedSourceRuntimeTaskJob {
  id: string
  sourceId: string
  kind: IndexedSourceRuntimeTaskKind
  queuedAt: number
}

export class IndexedSourceRuntimeTaskJobFactory {
  private readonly sequences = new Map<IndexedSourceRuntimeTaskKind, number>()

  create(
    sourceId: string,
    kind: IndexedSourceRuntimeTaskKind,
    queuedAt = Date.now()
  ): IndexedSourceRuntimeTaskJob {
    const sequence = (this.sequences.get(kind) ?? 0) + 1
    this.sequences.set(kind, sequence)
    return {
      id: `${sourceId}:${kind}:${sequence}`,
      sourceId,
      kind,
      queuedAt
    }
  }
}
