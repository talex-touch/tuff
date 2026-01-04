import type {
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
} from '@talex-touch/utils/analytics'

export const DEFAULT_RETENTION_MS: Record<AnalyticsWindowType, number> = {
  '1m': 5 * 60_000,
  '5m': 60 * 60_000,
  '15m': 6 * 60 * 60_000,
  '1h': 24 * 60 * 60_000,
  '24h': 7 * 24 * 60 * 60_000,
}

/**
 * In-memory store for analytics snapshots with per-window retention.
 */
export class MemoryStore {
  private snapshots = new Map<AnalyticsWindowType, AnalyticsSnapshot[]>()

  constructor(
    private retentionMs: Record<AnalyticsWindowType, number> = DEFAULT_RETENTION_MS,
    private now: () => number = () => Date.now(),
  ) {}

  /**
   * Push a snapshot into the store and prune expired entries for that window.
   */
  push(snapshot: AnalyticsSnapshot): void {
    const list = this.snapshots.get(snapshot.windowType) ?? []
    list.unshift(snapshot)

    const cutoff = this.now() - (this.retentionMs[snapshot.windowType] ?? 0)
    const pruned = list.filter(item => item.timestamp >= cutoff)

    this.snapshots.set(snapshot.windowType, pruned)
  }

  /**
   * Get the latest snapshot for a window.
   */
  latest(windowType: AnalyticsWindowType): AnalyticsSnapshot | null {
    const list = this.snapshots.get(windowType)
    return (list && list.length > 0) ? list[0] : null
  }

  /**
   * Get a time-range slice for a window.
   */
  range(request: AnalyticsRangeRequest): AnalyticsSnapshot[] {
    const list = this.snapshots.get(request.windowType) || []
    return list.filter(item => item.timestamp >= request.from && item.timestamp <= request.to)
  }

  /**
   * Clear all stored snapshots.
   */
  clear(): void {
    this.snapshots.clear()
  }
}
