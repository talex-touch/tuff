import type {
  IndexedSourceEvidence,
  IndexedWorkerSchedulerSnapshot,
  IndexedWriteFlushSnapshotService
} from '@talex-touch/utils/search'
import type { FileProviderRuntimeWriteSnapshot } from '../file-provider-index-contracts'
import type {
  FileProviderIndexBufferSnapshot,
  FileProviderIndexFlushSnapshot
} from './file-provider-index-runtime-service'
import type { FileProviderIntegritySnapshot } from './file-provider-integrity-service'
import {
  buildIndexedWriteFlushFailureSnapshot,
  buildIndexedWriteFlushResultSnapshot,
  IndexedSourceIntegrityEvidenceService,
  IndexedWriteFlushEvidenceService
} from '@talex-touch/utils/search'
import { INDEX_WORKER_BATCH_MAX_BYTES } from '../workers/index-worker-payload-budget'

/**
 * How the file provider reports its runtime state: the evidence rows after scan progress, the
 * write snapshots behind three of them, and the workload counters of the per-isolate diagnostics
 * journal. Pure over the snapshots the provider passes in; it lives beside file-provider.ts rather
 * than in it because that file is on the module size ratchet (#343).
 */

const fileIntegrityEvidenceService = new IndexedSourceIntegrityEvidenceService()
const indexFlushEvidenceService = new IndexedWriteFlushEvidenceService()

type RuntimeWriteSnapshotService =
  IndexedWriteFlushSnapshotService<FileProviderRuntimeWriteSnapshot>

/**
 * Numeric, content-free backlog: the bounded scheduler's retained batches/records (cumulative
 * deferred included) and the runtime flush buffer's result/byte ownership.
 */
export interface FileProviderIndexBacklogSnapshot {
  scheduler: IndexedWorkerSchedulerSnapshot
  buffer: FileProviderIndexBufferSnapshot
}

export interface FileProviderRuntimeEvidenceInput {
  sourceId: string
  integrity: FileProviderIntegritySnapshot | null
  flush: FileProviderIndexFlushSnapshot | null
  backlog: FileProviderIndexBacklogSnapshot
  incrementalPersist: FileProviderRuntimeWriteSnapshot | null
  ftsWrite: FileProviderRuntimeWriteSnapshot | null
  ftsDelete: FileProviderRuntimeWriteSnapshot | null
}

/**
 * Every evidence row after scan progress, in the order the provider has always reported them:
 * integrity and index flush once each has run, the content backlog always, then each runtime
 * write path that has recorded anything.
 */
export function buildFileProviderRuntimeEvidence(
  input: FileProviderRuntimeEvidenceInput
): IndexedSourceEvidence[] {
  const { sourceId, integrity, flush, backlog } = input
  const evidence: IndexedSourceEvidence[] = []

  if (integrity) {
    evidence.push(
      fileIntegrityEvidenceService.build({
        id: `${sourceId}:integrity`,
        label: 'File index integrity',
        snapshot: {
          ...integrity,
          indexedRows: integrity.ftsRows
        },
        reasons: {
          rebuildScheduled: 'fts-files-count-mismatch-rebuild-scheduled',
          aligned: 'fts-files-count-aligned'
        },
        metadata: {
          ...integrity
        }
      })
    )
  }

  if (flush) {
    evidence.push(
      indexFlushEvidenceService.build({
        id: `${sourceId}:index-flush`,
        label: 'File index flush',
        snapshot: flush
      })
    )
  }

  const backlogDepth =
    backlog.scheduler.activeBatches +
    backlog.scheduler.queuedBatches +
    backlog.buffer.pending +
    backlog.buffer.inflight
  evidence.push(
    indexFlushEvidenceService.build({
      id: `${sourceId}:index-backlog`,
      label: 'File index backlog',
      snapshot: {
        status: backlogDepth > 0 ? 'backlog' : 'idle',
        entries: backlog.scheduler.pendingRecords,
        pending: backlog.buffer.pending,
        inflight: backlog.buffer.inflight,
        reason: 'content-scheduler',
        checkedAt: Date.now(),
        metadata: {
          activeBatches: backlog.scheduler.activeBatches,
          queuedBatches: backlog.scheduler.queuedBatches,
          pendingRecords: backlog.scheduler.pendingRecords,
          // Cumulative since boot — NOT the current backlog.
          deferredRecordsCumulative: backlog.scheduler.deferredRecords,
          bufferPendingBytes: backlog.buffer.pendingBytes,
          bufferInflightBytes: backlog.buffer.inflightBytes,
          bufferBudgetBytes: INDEX_WORKER_BATCH_MAX_BYTES
        }
      }
    })
  )

  const runtimeWrites: Array<{
    snapshot: FileProviderRuntimeWriteSnapshot | null
    id: string
    label: string
  }> = [
    {
      snapshot: input.incrementalPersist,
      id: `${sourceId}:incremental-persist`,
      label: 'File incremental DB persist'
    },
    {
      snapshot: input.ftsWrite,
      id: `${sourceId}:fts-write`,
      label: 'File FTS write'
    },
    {
      snapshot: input.ftsDelete,
      id: `${sourceId}:fts-delete`,
      label: 'File FTS delete'
    }
  ]

  for (const item of runtimeWrites) {
    if (!item.snapshot) continue
    evidence.push(
      indexFlushEvidenceService.build({
        id: item.id,
        label: item.label,
        snapshot: item.snapshot
      })
    )
  }

  return evidence
}

export function recordRuntimeWriteSnapshot(
  service: RuntimeWriteSnapshotService,
  input: {
    entries: number
    reason: string
    metadata?: Record<string, unknown>
    durationMs?: number
  }
): void {
  service.record(
    buildIndexedWriteFlushResultSnapshot<FileProviderRuntimeWriteSnapshot>({
      status: 'flushed',
      entries: input.entries,
      pending: 0,
      inflight: 0,
      reason: input.reason,
      metadata: input.metadata,
      durationMs: input.durationMs
    })
  )
}

export function recordRuntimeWriteFailureSnapshot(
  service: RuntimeWriteSnapshotService,
  input: {
    error: unknown
    reason: string
    entries?: number
    metadata?: Record<string, unknown>
  }
): void {
  service.record(
    buildIndexedWriteFlushFailureSnapshot<FileProviderRuntimeWriteSnapshot>({
      error: input.error,
      pendingSize: 0,
      inflightSize: 0,
      flushResult: {
        status: 'failed',
        entries: input.entries ?? 0,
        pending: 0,
        inflight: 0,
        reason: input.reason,
        metadata: input.metadata
      }
    })
  )
}

/** The icon service's file-icon counters, as `iconService.getFileIconCacheStats()` returns them. */
export interface FileIconCacheCounters {
  inflight: number
  cached: number
  cacheHits: number
  deferred: number
  generatedBytesCumulative: number
}

/**
 * The workload map the 30s per-isolate diagnostics journal logs beside each isolate's memory.
 * Counts only — never paths or file contents.
 */
export function buildIndexWorkerWorkload(
  backlog: FileProviderIndexBacklogSnapshot,
  icons: FileIconCacheCounters
): Record<string, number> {
  const { scheduler, buffer } = backlog
  return {
    schedulerActiveBatches: scheduler.activeBatches,
    schedulerQueuedBatches: scheduler.queuedBatches,
    schedulerPendingRecords: scheduler.pendingRecords,
    schedulerDeferredRecords: scheduler.deferredRecords,
    bufferPendingResults: buffer.pending,
    bufferInflightResults: buffer.inflight,
    bufferPendingBytes: buffer.pendingBytes,
    bufferInflightBytes: buffer.inflightBytes,
    iconInflight: icons.inflight,
    iconCached: icons.cached,
    iconCacheHitsCumulative: icons.cacheHits,
    iconDeferredCumulative: icons.deferred,
    iconGeneratedBytesCumulative: icons.generatedBytesCumulative
  }
}
