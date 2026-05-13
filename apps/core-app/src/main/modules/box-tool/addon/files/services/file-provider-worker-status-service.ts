import type { WorkerStatusSnapshot } from '../workers/worker-status'

export const WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS = 1_000

export interface FileProviderWorkerStatusSnapshot {
  summary: { total: number; busy: number; idle: number; offline: number }
  workers: WorkerStatusSnapshot[]
}

export function summarizeWorkerStatus(
  workers: WorkerStatusSnapshot[]
): FileProviderWorkerStatusSnapshot['summary'] {
  return workers.reduce(
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

export class FileProviderWorkerStatusService {
  private cachedSnapshot: {
    capturedAt: number
    snapshot: FileProviderWorkerStatusSnapshot
  } | null = null

  private pendingSnapshot: Promise<FileProviderWorkerStatusSnapshot> | null = null

  async getSnapshot(
    loadWorkers: () => Promise<WorkerStatusSnapshot[]>
  ): Promise<FileProviderWorkerStatusSnapshot> {
    const now = Date.now()
    if (
      this.cachedSnapshot &&
      now - this.cachedSnapshot.capturedAt < WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS
    ) {
      return this.cachedSnapshot.snapshot
    }

    if (this.pendingSnapshot) {
      return this.pendingSnapshot
    }

    this.pendingSnapshot = loadWorkers()
      .then((workers) => {
        const snapshot = { summary: summarizeWorkerStatus(workers), workers }
        this.cachedSnapshot = { capturedAt: Date.now(), snapshot }
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
