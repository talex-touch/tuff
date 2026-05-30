import type { WorkerStatusSnapshot } from '../workers/worker-status'
import {
  INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS,
  IndexedWorkerStatusSnapshotService,
  summarizeIndexedWorkerStatus
} from '@talex-touch/utils/search'

export const WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS = INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS

export interface FileProviderWorkerStatusSnapshot {
  summary: { total: number; busy: number; idle: number; offline: number }
  workers: WorkerStatusSnapshot[]
}

export function summarizeWorkerStatus(
  workers: WorkerStatusSnapshot[]
): FileProviderWorkerStatusSnapshot['summary'] {
  return summarizeIndexedWorkerStatus(workers)
}

export class FileProviderWorkerStatusService {
  private readonly snapshotService = new IndexedWorkerStatusSnapshotService<WorkerStatusSnapshot>()

  async getSnapshot(
    loadWorkers: () => Promise<WorkerStatusSnapshot[]>
  ): Promise<FileProviderWorkerStatusSnapshot> {
    return this.snapshotService.getSnapshot(loadWorkers)
  }

  clear(): void {
    this.snapshotService.clear()
  }
}
