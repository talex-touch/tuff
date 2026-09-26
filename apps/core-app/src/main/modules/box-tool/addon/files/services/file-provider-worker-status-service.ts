import type { WorkerStatusSnapshot } from '../workers/worker-status'
import {
  INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS,
  IndexedWorkerStatusSnapshotService,
  summarizeIndexedWorkerStatus
} from '@talex-touch/utils/search'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../../../../utils/logger'
import { getWorkerMemorySnapshot } from '../workers/worker-status'

const MEMORY_DIAGNOSTIC_TASK_ID = 'file-index.memory-snapshot'
const memoryLog = createLogger('FileProvider').child('Memory')

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
  private diagnosticGeneration = 0

  startDiagnostics(
    loadSnapshot: () => Promise<FileProviderWorkerStatusSnapshot>,
    loadWorkload: () => Record<string, number>
  ): void {
    this.stopDiagnostics()
    const generation = this.diagnosticGeneration
    PollingService.getInstance().register(
      MEMORY_DIAGNOSTIC_TASK_ID,
      async () => {
        const snapshot = await loadSnapshot()
        if (generation !== this.diagnosticGeneration) return
        const main = getWorkerMemorySnapshot()
        memoryLog.info('Indexing memory snapshot', {
          meta: {
            processRssBytes: main.rss,
            mainHeapUsedBytes: main.heapUsed,
            mainHeapTotalBytes: main.heapTotal,
            mainHeapLimitBytes: main.heapLimit,
            mainExternalBytes: main.external,
            mainArrayBufferBytes: main.arrayBuffers,
            workload: JSON.stringify(loadWorkload()),
            workers: JSON.stringify(
              snapshot.workers.map((worker) => ({
                name: worker.name,
                threadId: worker.threadId,
                state: worker.state,
                pending: worker.pending,
                capturedAt: worker.metrics?.capturedAt ?? null,
                heapUsedBytes: worker.metrics?.memory.heapUsed ?? null,
                heapTotalBytes: worker.metrics?.memory.heapTotal ?? null,
                heapLimitBytes: worker.metrics?.memory.heapLimit ?? null,
                externalBytes: worker.metrics?.memory.external ?? null,
                arrayBufferBytes: worker.metrics?.memory.arrayBuffers ?? null
              }))
            )
          }
        })
      },
      {
        interval: 30_000,
        unit: 'milliseconds',
        initialDelayMs: 15_000,
        lane: 'maintenance',
        backpressure: 'coalesce',
        maxInFlight: 1,
        timeoutMs: 5_000
      }
    )
  }

  stopDiagnostics(): void {
    this.diagnosticGeneration += 1
    PollingService.getInstance().unregister(MEMORY_DIAGNOSTIC_TASK_ID)
  }

  async getSnapshot(
    loadWorkers: () => Promise<WorkerStatusSnapshot[]>
  ): Promise<FileProviderWorkerStatusSnapshot> {
    return this.snapshotService.getSnapshot(loadWorkers)
  }

  clear(): void {
    this.snapshotService.clear()
  }
}
