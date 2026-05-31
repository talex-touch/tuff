import type { IndexedSourceTaskHistoryKind } from './indexing-source'

export type IndexedSourceTaskRunGateDecisionReason =
  | 'allowed'
  | 'already-running'
  | 'debounced'

export interface IndexedSourceTaskRunGateDecision {
  allowed: boolean
  reason: IndexedSourceTaskRunGateDecisionReason
  runningSince?: number
  lastCompletedAt?: number
  nextAllowedAt?: number
}

export interface IndexedSourceTaskRunGateEntry {
  sourceId: string
  kind: IndexedSourceTaskHistoryKind
  runningSince?: number
  lastCompletedAt?: number
}

export interface IndexedSourceTaskRunGateOptions {
  now?: () => number
  debounceMs?: number
}

export class IndexedSourceTaskRunGate {
  private readonly entries = new Map<string, IndexedSourceTaskRunGateEntry>()
  private readonly now: () => number
  private readonly debounceMs: number

  constructor(options: IndexedSourceTaskRunGateOptions = {}) {
    this.now = options.now ?? Date.now
    this.debounceMs = Math.max(0, Math.floor(options.debounceMs ?? 0))
  }

  canStart(sourceId: string, kind: IndexedSourceTaskHistoryKind): IndexedSourceTaskRunGateDecision {
    const key = this.getKey(sourceId, kind)
    const entry = this.entries.get(key)

    if (entry?.runningSince !== undefined) {
      return {
        allowed: false,
        reason: 'already-running',
        runningSince: entry.runningSince,
        lastCompletedAt: entry.lastCompletedAt
      }
    }

    const now = this.now()
    const lastCompletedAt = entry?.lastCompletedAt
    if (
      this.debounceMs > 0 &&
      typeof lastCompletedAt === 'number' &&
      now - lastCompletedAt < this.debounceMs
    ) {
      return {
        allowed: false,
        reason: 'debounced',
        lastCompletedAt,
        nextAllowedAt: lastCompletedAt + this.debounceMs
      }
    }

    return {
      allowed: true,
      reason: 'allowed',
      lastCompletedAt
    }
  }

  start(sourceId: string, kind: IndexedSourceTaskHistoryKind, startedAt = this.now()): void {
    const key = this.getKey(sourceId, kind)
    const existing = this.entries.get(key)
    this.entries.set(key, {
      sourceId,
      kind,
      runningSince: startedAt,
      lastCompletedAt: existing?.lastCompletedAt
    })
  }

  complete(sourceId: string, kind: IndexedSourceTaskHistoryKind, completedAt = this.now()): void {
    const key = this.getKey(sourceId, kind)
    const existing = this.entries.get(key)
    this.entries.set(key, {
      sourceId,
      kind,
      lastCompletedAt: completedAt ?? existing?.lastCompletedAt
    })
  }

  isRunning(sourceId: string, kind: IndexedSourceTaskHistoryKind): boolean {
    return this.entries.get(this.getKey(sourceId, kind))?.runningSince !== undefined
  }

  getEntry(
    sourceId: string,
    kind: IndexedSourceTaskHistoryKind
  ): IndexedSourceTaskRunGateEntry | undefined {
    const entry = this.entries.get(this.getKey(sourceId, kind))
    return entry ? { ...entry } : undefined
  }

  clear(sourceId?: string): void {
    if (!sourceId) {
      this.entries.clear()
      return
    }

    for (const key of this.entries.keys()) {
      if (key.startsWith(`${sourceId}:`)) {
        this.entries.delete(key)
      }
    }
  }

  private getKey(sourceId: string, kind: IndexedSourceTaskHistoryKind): string {
    return `${sourceId}:${kind}`
  }
}
