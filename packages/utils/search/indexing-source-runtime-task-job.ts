import type { IndexedSourceTaskHistoryKind } from './indexing-source'

export type IndexedSourceRuntimeTaskKind = IndexedSourceTaskHistoryKind

export interface IndexedSourceRuntimeTaskJob {
  id: string
  sourceId: string
  kind: IndexedSourceRuntimeTaskKind
  queuedAt: number
}

export interface IndexedSourceRuntimeTaskJobFactoryOptions {
  now?: () => number
}

export class IndexedSourceRuntimeTaskJobFactory {
  private readonly sequences = new Map<IndexedSourceRuntimeTaskKind, number>()
  private readonly now: () => number

  constructor(options: IndexedSourceRuntimeTaskJobFactoryOptions = {}) {
    this.now = options.now ?? Date.now
  }

  create(
    sourceId: string,
    kind: IndexedSourceRuntimeTaskKind,
    queuedAt = this.now()
  ): IndexedSourceRuntimeTaskJob {
    const sequence = (this.sequences.get(kind) ?? 0) + 1
    this.sequences.set(kind, sequence)
    return {
      id: `${sourceId}:${kind}:${sequence}`,
      sourceId,
      kind,
      queuedAt: this.normalizeQueuedAt(queuedAt)
    }
  }

  private normalizeQueuedAt(value: number): number {
    const clock = normalizeFiniteTimestamp(this.now()) ?? 0
    return Math.min(normalizeFiniteTimestamp(value) ?? clock, clock)
  }
}

function normalizeFiniteTimestamp(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
