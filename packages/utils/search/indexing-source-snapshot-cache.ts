export const INDEXED_SOURCE_SNAPSHOT_CACHE_TTL_MS = 500

export interface IndexedSourceSnapshotCacheConfig {
  cacheTtlMs?: number
  now?: () => number
}

export class IndexedSourceSnapshotCacheService<TSnapshot> {
  private readonly cacheTtlMs: number
  private readonly now: () => number
  private cachedSnapshot: {
    capturedAt: number
    snapshot: TSnapshot
  } | null = null

  private pendingSnapshot: Promise<TSnapshot> | null = null

  constructor(config: IndexedSourceSnapshotCacheConfig = {}) {
    this.cacheTtlMs = config.cacheTtlMs ?? INDEXED_SOURCE_SNAPSHOT_CACHE_TTL_MS
    this.now = config.now ?? (() => Date.now())
  }

  async getSnapshot(loadSnapshot: () => TSnapshot | Promise<TSnapshot>): Promise<TSnapshot> {
    const now = this.now()
    if (this.cachedSnapshot && now - this.cachedSnapshot.capturedAt < this.cacheTtlMs) {
      return this.cachedSnapshot.snapshot
    }

    if (this.pendingSnapshot) {
      return this.pendingSnapshot
    }

    try {
      this.pendingSnapshot = Promise.resolve(loadSnapshot())
        .then((snapshot) => {
          this.cachedSnapshot = { capturedAt: this.now(), snapshot }
          return snapshot
        })
        .finally(() => {
          this.pendingSnapshot = null
        })
    } catch (error) {
      this.pendingSnapshot = Promise.reject(error).finally(() => {
        this.pendingSnapshot = null
      })
    }

    return this.pendingSnapshot
  }

  prime(snapshot: TSnapshot): TSnapshot {
    this.cachedSnapshot = { capturedAt: this.now(), snapshot }
    return snapshot
  }

  clear(): void {
    this.cachedSnapshot = null
    this.pendingSnapshot = null
  }
}
