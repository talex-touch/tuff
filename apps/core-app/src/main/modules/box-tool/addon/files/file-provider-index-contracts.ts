import type {
  IndexedSourceDelta,
  IndexedSourceRecordBatch,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceScanRequest,
  IndexedWriteFlushSnapshot
} from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../search-engine/search-index-writer'
import type { PersistAndApplyProviderItemsMetrics } from '../../search-engine/workers/search-index-worker-types'

// The shapes FileProvider's index runs trade in: the delegates the runtime hands it, the options a
// run takes and the counters it reports. Moved out of file-provider.ts unchanged (#343).

export type FileProviderRuntimeWriteSnapshot = Omit<IndexedWriteFlushSnapshot, 'status'> & {
  status: 'flushed' | 'failed'
}

export interface FileUpdateRecord {
  id: number
  path: string
  name: string
  extension: string | null
  size: number | null
  ctime: Date
  mtime: Date
  type: string
  isDir: boolean
}

export interface FileIndexSyncStats {
  added: number
  changed: number
  deleted: number
  skipped: number
  errors: number
}

export interface FileIndexRunOptions {
  onRecordBatch?: (batch: IndexedSourceRecordBatch) => void | Promise<void>
  onDelta?: (delta: IndexedSourceDelta) => void | Promise<void>
  throwOnFailure?: boolean
  signal?: AbortSignal
  mutationLeaseId?: string
}

export interface FileIndexedSourceRuntimeMutationDelegate {
  applyBatch: (batch: IndexedSourceRecordBatch) => Promise<unknown>
  applyBatchWithPersistence?: (
    batch: IndexedSourceRecordBatch,
    records: UpsertFileRecord[]
  ) => Promise<{
    persisted: Array<Record<string, unknown>>
    metrics?: PersistAndApplyProviderItemsMetrics
  }>
  applyDelta: (delta: IndexedSourceDelta) => Promise<unknown>
  cleanupSource: (sourceId: string, mutationLeaseId?: string) => Promise<unknown>
  countSource: (sourceId: string, mutationLeaseId?: string) => Promise<number>
  drainSource: (sourceId: string, timeoutMs?: number) => Promise<void>
  scanSource: (reason: IndexedSourceScanRequest['reason']) => Promise<unknown>
}

export interface FileIndexedSourceScanResult {
  batches: IndexedSourceRecordBatch[]
}

export type FileIndexedSourceRuntimeResetDelegate = (
  request: IndexedSourceResetRequest
) => Promise<IndexedSourceResetResult>

export function createFileIndexSyncStats(): FileIndexSyncStats {
  return {
    added: 0,
    changed: 0,
    deleted: 0,
    skipped: 0,
    errors: 0
  }
}
