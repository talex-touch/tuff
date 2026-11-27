import type { WorkerStatusSnapshot } from '../workers/worker-status'
import {
  INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS,
  IndexedWorkerStatusSnapshotService,
  summarizeIndexedWorkerStatus
} from '@talex-touch/utils/search'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../../../../utils/logger'
import {
  idleBudgetCoordinator,
  isStatePausedFor
} from '../../../../../service/idle-budget-coordinator'
import { getWorkerMemorySnapshot } from '../workers/worker-status'

const MEMORY_DIAGNOSTIC_TASK_ID = 'file-index.memory-snapshot'
/**
 * How often the journal still writes while nothing changes. Without the gate an idle app paid the
 * 30 s cadence forever: every live worker was messaged for metrics and an identical info line
 * written, long after indexing finished. Ten minutes still shows memory creeping up at rest.
 */
const MEMORY_DIAGNOSTIC_IDLE_INTERVAL_MS = 10 * 60_000
/** Workload counters that are not cumulative: all zero means no indexing work is queued or running. */
const ACTIVE_WORKLOAD_KEYS = [
  'schedulerActiveBatches',
  'schedulerQueuedBatches',
  'schedulerPendingRecords',
  'schedulerDeferredRecords',
  'bufferPendingResults',
  'bufferInflightResults',
  'iconInflight'
] as const
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
  private idleBudgetUnsubscribe: (() => void) | null = null

  startDiagnostics(
    loadSnapshot: () => Promise<FileProviderWorkerStatusSnapshot>,
    loadWorkload: () => Record<string, number>
  ): void {
    this.stopDiagnostics()
    const generation = this.diagnosticGeneration
    let previousWorkload: string | null = null
    let lastJournalAt = 0
    const registerDiagnosticTask = () => {
      if (generation !== this.diagnosticGeneration) return
      if (PollingService.getInstance().isRegistered(MEMORY_DIAGNOSTIC_TASK_ID)) return
      PollingService.getInstance().register(
        MEMORY_DIAGNOSTIC_TASK_ID,
        async () => {
          const workloadCounts = loadWorkload()
          const workload = JSON.stringify(workloadCounts)
          const quiet =
            workload === previousWorkload &&
            ACTIVE_WORKLOAD_KEYS.every((key) => !workloadCounts[key])
          previousWorkload = workload
          if (quiet && Date.now() - lastJournalAt < MEMORY_DIAGNOSTIC_IDLE_INTERVAL_MS) return

          const snapshot = await loadSnapshot()
          if (generation !== this.diagnosticGeneration) return
          lastJournalAt = Date.now()
          const main = getWorkerMemorySnapshot()
          memoryLog.info('Indexing memory snapshot', {
            meta: {
              processRssBytes: main.rss,
              mainHeapUsedBytes: main.heapUsed,
              mainHeapTotalBytes: main.heapTotal,
              mainHeapLimitBytes: main.heapLimit,
              mainExternalBytes: main.external,
              mainArrayBufferBytes: main.arrayBuffers,
              workload,
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

    this.idleBudgetUnsubscribe = idleBudgetCoordinator.subscribe((snapshot) => {
      if (generation !== this.diagnosticGeneration) return
      if (isStatePausedFor(snapshot.state, 'background-hidden')) {
        PollingService.getInstance().unregister(MEMORY_DIAGNOSTIC_TASK_ID)
        return
      }
      registerDiagnosticTask()
    })

    if (!idleBudgetCoordinator.isPausedFor('background-hidden')) {
      registerDiagnosticTask()
    }
  }

  stopDiagnostics(): void {
    this.diagnosticGeneration += 1
    this.idleBudgetUnsubscribe?.()
    this.idleBudgetUnsubscribe = null
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
