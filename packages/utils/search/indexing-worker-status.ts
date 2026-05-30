export const INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS = 1_000

export type IndexedWorkerState = 'offline' | 'idle' | 'busy'

export interface IndexedWorkerStatusLike {
  state: IndexedWorkerState
}

export interface IndexedWorkerStatusSummary {
  total: number
  busy: number
  idle: number
  offline: number
}

export interface IndexedWorkerStatusSnapshot<TWorker extends IndexedWorkerStatusLike> {
  summary: IndexedWorkerStatusSummary
  workers: TWorker[]
}

export function summarizeIndexedWorkerStatus<TWorker extends IndexedWorkerStatusLike>(
  workers: TWorker[]
): IndexedWorkerStatusSummary {
  return workers.reduce<IndexedWorkerStatusSummary>(
    (acc, worker) => {
      acc.total += 1
      if (worker.state === 'busy') {
        acc.busy += 1
      } else if (worker.state === 'idle') {
        acc.idle += 1
      } else {
        acc.offline += 1
      }
      return acc
    },
    { total: 0, busy: 0, idle: 0, offline: 0 }
  )
}

export interface IndexedWorkerStatusSnapshotServiceConfig {
  cacheTtlMs?: number
  now?: () => number
}

export class IndexedWorkerStatusSnapshotService<TWorker extends IndexedWorkerStatusLike> {
  private readonly cacheTtlMs: number
  private readonly now: () => number
  private cachedSnapshot: {
    capturedAt: number
    snapshot: IndexedWorkerStatusSnapshot<TWorker>
  } | null = null

  private pendingSnapshot: Promise<IndexedWorkerStatusSnapshot<TWorker>> | null = null

  constructor(config: IndexedWorkerStatusSnapshotServiceConfig = {}) {
    this.cacheTtlMs = config.cacheTtlMs ?? INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS
    this.now = config.now ?? (() => Date.now())
  }

  async getSnapshot(
    loadWorkers: () => Promise<TWorker[]>
  ): Promise<IndexedWorkerStatusSnapshot<TWorker>> {
    const now = this.now()
    if (this.cachedSnapshot && now - this.cachedSnapshot.capturedAt < this.cacheTtlMs) {
      return this.cachedSnapshot.snapshot
    }

    if (this.pendingSnapshot) {
      return this.pendingSnapshot
    }

    this.pendingSnapshot = loadWorkers()
      .then((workers) => {
        const snapshot = { summary: summarizeIndexedWorkerStatus(workers), workers }
        this.cachedSnapshot = { capturedAt: this.now(), snapshot }
        return snapshot
      })
      .finally(() => {
        this.pendingSnapshot = null
      })

    return this.pendingSnapshot
  }

  clear(): void {
    this.cachedSnapshot = null
    this.pendingSnapshot = null
  }
}
