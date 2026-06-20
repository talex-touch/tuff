import type {
  IndexedSourceTaskHistoryKind,
  IndexedSourceTaskRunGateBlockedReason,
  IndexedSourceTaskRunGateSnapshot,
  IndexedSourceTaskRunGateSnapshotEntry
} from './indexing-source'

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
  blockedCount?: number
  lastBlockedAt?: number
  lastBlockedReason?: IndexedSourceTaskRunGateBlockedReason
  nextAllowedAt?: number
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
    const runningSince = normalizeFiniteTimestamp(entry?.runningSince)
    const lastCompletedAt = normalizeFiniteTimestamp(entry?.lastCompletedAt)

    if (runningSince !== undefined) {
      this.recordBlocked(sourceId, kind, entry, 'already-running', {
        runningSince,
        lastCompletedAt
      })
      return {
        allowed: false,
        reason: 'already-running',
        runningSince,
        lastCompletedAt
      }
    }

    const now = normalizeFiniteTimestamp(this.now())
    if (
      this.debounceMs > 0 &&
      now !== undefined &&
      lastCompletedAt !== undefined &&
      now - lastCompletedAt < this.debounceMs
    ) {
      const nextAllowedAt = lastCompletedAt + this.debounceMs
      this.recordBlocked(sourceId, kind, entry, 'debounced', {
        lastCompletedAt,
        nextAllowedAt
      })
      return {
        allowed: false,
        reason: 'debounced',
        lastCompletedAt,
        nextAllowedAt
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
    const runningSince = this.normalizeTimestamp(startedAt)
    if (runningSince === undefined && !existing) return

    this.entries.set(key, {
      sourceId,
      kind,
      runningSince: runningSince ?? normalizeFiniteTimestamp(existing?.runningSince),
      lastCompletedAt: normalizeFiniteTimestamp(existing?.lastCompletedAt),
      blockedCount: existing?.blockedCount,
      lastBlockedAt: normalizeFiniteTimestamp(existing?.lastBlockedAt),
      lastBlockedReason: existing?.lastBlockedReason,
      nextAllowedAt: normalizeFiniteTimestamp(existing?.nextAllowedAt)
    })
  }

  complete(sourceId: string, kind: IndexedSourceTaskHistoryKind, completedAt = this.now()): void {
    const key = this.getKey(sourceId, kind)
    const existing = this.entries.get(key)
    const normalizedCompletedAt = this.normalizeTimestamp(completedAt)
    const existingLastCompletedAt = normalizeFiniteTimestamp(existing?.lastCompletedAt)
    const lastCompletedAt =
      existingLastCompletedAt !== undefined && normalizedCompletedAt !== undefined
        ? Math.max(existingLastCompletedAt, normalizedCompletedAt)
        : existingLastCompletedAt ?? normalizedCompletedAt

    if (
      lastCompletedAt === undefined &&
      !existing?.blockedCount &&
      normalizeFiniteTimestamp(existing?.lastBlockedAt) === undefined
    ) {
      this.entries.delete(key)
      return
    }

    this.entries.set(key, {
      sourceId,
      kind,
      lastCompletedAt,
      blockedCount: existing?.blockedCount,
      lastBlockedAt: normalizeFiniteTimestamp(existing?.lastBlockedAt),
      lastBlockedReason: existing?.lastBlockedReason,
      nextAllowedAt: normalizeFiniteTimestamp(existing?.nextAllowedAt)
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

  getSnapshot(generatedAt = this.now()): IndexedSourceTaskRunGateSnapshot {
    const normalizedGeneratedAt = normalizeFiniteTimestamp(generatedAt) ?? 0
    const entries = Array.from(this.entries.values())
      .map((entry): IndexedSourceTaskRunGateSnapshotEntry => ({
        sourceId: entry.sourceId,
        kind: entry.kind,
        blockedCount: entry.blockedCount ?? 0,
        runningSince: normalizeFiniteTimestamp(entry.runningSince),
        lastCompletedAt: normalizeFiniteTimestamp(entry.lastCompletedAt),
        lastBlockedAt: normalizeFiniteTimestamp(entry.lastBlockedAt),
        lastBlockedReason: entry.lastBlockedReason,
        nextAllowedAt: normalizeFiniteTimestamp(entry.nextAllowedAt)
      }))
      .sort((a, b) => {
        const sourceCompare = a.sourceId.localeCompare(b.sourceId)
        if (sourceCompare !== 0) return sourceCompare
        return a.kind.localeCompare(b.kind)
      })

    return {
      generatedAt: normalizedGeneratedAt,
      totalEntries: entries.length,
      runningEntries: entries.filter(entry => entry.runningSince !== undefined).length,
      blockedEntries: entries.filter(entry => entry.blockedCount > 0).length,
      entries
    }
  }

  private recordBlocked(
    sourceId: string,
    kind: IndexedSourceTaskHistoryKind,
    entry: IndexedSourceTaskRunGateEntry | undefined,
    reason: IndexedSourceTaskRunGateBlockedReason,
    updates: Pick<IndexedSourceTaskRunGateEntry, 'runningSince' | 'lastCompletedAt' | 'nextAllowedAt'>
  ): void {
    const key = this.getKey(sourceId, kind)
    this.entries.set(key, {
      sourceId,
      kind,
      runningSince:
        normalizeFiniteTimestamp(updates.runningSince) ??
        normalizeFiniteTimestamp(entry?.runningSince),
      lastCompletedAt:
        normalizeFiniteTimestamp(updates.lastCompletedAt) ??
        normalizeFiniteTimestamp(entry?.lastCompletedAt),
      blockedCount: (entry?.blockedCount ?? 0) + 1,
      lastBlockedAt: normalizeFiniteTimestamp(this.now()),
      lastBlockedReason: reason,
      nextAllowedAt: normalizeFiniteTimestamp(updates.nextAllowedAt)
    })
  }

  private getKey(sourceId: string, kind: IndexedSourceTaskHistoryKind): string {
    return `${sourceId}:${kind}`
  }

  private normalizeTimestamp(value: number | undefined): number | undefined {
    return normalizeInputTimestamp(value, normalizeFiniteTimestamp(this.now()))
  }
}

function normalizeFiniteTimestamp(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeInputTimestamp(
  value: number | undefined,
  now: number | undefined
): number | undefined {
  const timestamp = normalizeFiniteTimestamp(value)
  if (timestamp === undefined) return now
  if (now !== undefined && timestamp > now) return now
  return timestamp
}
