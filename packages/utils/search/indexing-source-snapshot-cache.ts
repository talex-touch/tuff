import { cloneIndexingSnapshotValue } from './indexing-snapshot-clone'

export const INDEXED_SOURCE_SNAPSHOT_CACHE_TTL_MS = 500

export interface IndexedSourceSnapshotCacheConfig {
  cacheTtlMs?: number
  now?: () => number
  cloneSnapshot?: <TSnapshot>(snapshot: TSnapshot) => TSnapshot
}

export class IndexedSourceSnapshotCacheService<TSnapshot> {
  private readonly cacheTtlMs: number
  private readonly now: () => number
  private readonly cloneSnapshot: (snapshot: TSnapshot) => TSnapshot
  private cachedSnapshot: {
    capturedAt: number
    snapshot: TSnapshot
  } | null = null

  private pendingSnapshot: Promise<TSnapshot> | null = null
  private generation = 0

  constructor(config: IndexedSourceSnapshotCacheConfig = {}) {
    this.cacheTtlMs = config.cacheTtlMs ?? INDEXED_SOURCE_SNAPSHOT_CACHE_TTL_MS
    this.now = config.now ?? (() => Date.now())
    this.cloneSnapshot = config.cloneSnapshot ?? cloneIndexedSourceSnapshot
  }

  async getSnapshot(loadSnapshot: () => TSnapshot | Promise<TSnapshot>): Promise<TSnapshot> {
    const now = this.now()
    if (this.cachedSnapshot && now - this.cachedSnapshot.capturedAt < this.cacheTtlMs) {
      return this.cloneSnapshot(this.cachedSnapshot.snapshot)
    }

    if (this.pendingSnapshot) {
      return this.pendingSnapshot.then((snapshot) => this.cloneSnapshot(snapshot))
    }

    try {
      const generation = this.generation
      this.pendingSnapshot = Promise.resolve(loadSnapshot())
        .then((snapshot) => {
          const clonedSnapshot = this.cloneSnapshot(snapshot)
          if (this.generation === generation) {
            this.cachedSnapshot = { capturedAt: this.now(), snapshot: clonedSnapshot }
          }
          return this.cloneSnapshot(clonedSnapshot)
        })
        .finally(() => {
          if (this.generation === generation) {
            this.pendingSnapshot = null
          }
        })
    } catch (error) {
      const generation = this.generation
      this.pendingSnapshot = Promise.reject(error).finally(() => {
        if (this.generation === generation) {
          this.pendingSnapshot = null
        }
      })
    }

    return this.pendingSnapshot
  }

  prime(snapshot: TSnapshot): TSnapshot {
    this.cachedSnapshot = { capturedAt: this.now(), snapshot: this.cloneSnapshot(snapshot) }
    return this.cloneSnapshot(this.cachedSnapshot.snapshot)
  }

  clear(): void {
    this.generation += 1
    this.cachedSnapshot = null
    this.pendingSnapshot = null
  }
}

function cloneIndexedSourceSnapshot<TSnapshot>(snapshot: TSnapshot): TSnapshot {
  return cloneIndexingSnapshotValue(snapshot)
}
