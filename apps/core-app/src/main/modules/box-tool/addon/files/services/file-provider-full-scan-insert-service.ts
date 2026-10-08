import { takeIndexedWriteRecordChunk } from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'

export interface FileProviderFullScanInsertResult {
  insertedCount: number
}

export interface FileProviderFullScanPersistResult {
  insertedCount: number
  workerCpuMicros?: number
}

const FULL_SCAN_CHUNK_BACKOFF_MS = 250
const FULL_SCAN_CHUNK_BACKOFF_MAX_MS = 1_000
const FULL_SCAN_COOPERATIVE_PAUSE_MS = 250
const FULL_SCAN_WORKER_CPU_TARGET = 0.35

/** Retains the full-scan cooperative pause and measured worker-CPU backoff contract. */
export function resolveFullScanPacingMs(batchMs: number, workerCpuMicros?: number): number {
  const cooperativeMs =
    batchMs >= FULL_SCAN_CHUNK_BACKOFF_MS
      ? Math.min(Math.round(batchMs), FULL_SCAN_CHUNK_BACKOFF_MAX_MS)
      : FULL_SCAN_COOPERATIVE_PAUSE_MS
  if (
    typeof workerCpuMicros !== 'number' ||
    !Number.isFinite(workerCpuMicros) ||
    workerCpuMicros <= 0
  ) {
    return cooperativeMs
  }
  const workerCpuMs = workerCpuMicros / 1_000
  const cpuBudgetMs = Math.max(0, workerCpuMs / FULL_SCAN_WORKER_CPU_TARGET - batchMs)
  return Math.max(cooperativeMs, Math.ceil(cpuBudgetMs))
}

export interface FileProviderFullScanInsertDeps<TContext> {
  getBatchSize: () => number
  recordBatchDuration: (durationMs: number) => void
  waitForIdle: (context: TContext) => Promise<void>
  /** Includes persistence, FTS, reader visibility and publication within one short source lease. */
  persistAndEmitBatch: (
    records: UpsertFileRecord[],
    context: TContext
  ) => Promise<FileProviderFullScanPersistResult>
  emitProgress: (current: number, total: number) => void
  sleep: (durationMs: number, context: TContext) => Promise<void>
  now: () => number
  formatDuration: (durationMs: number) => string
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderFullScanInsertService<TContext> {
  constructor(private readonly deps: FileProviderFullScanInsertDeps<TContext>) {}

  async execute(
    rootPath: string,
    records: UpsertFileRecord[],
    context: TContext
  ): Promise<FileProviderFullScanInsertResult> {
    let insertedCount = 0
    let offset = 0
    if (records.length === 0) return { insertedCount }
    this.deps.emitProgress(0, records.length)
    this.deps.logInfo('Preparing to index full-scan results', {
      path: rootPath,
      files: records.length
    })
    while (offset < records.length) {
      const { chunk, nextOffset } = takeIndexedWriteRecordChunk(
        records,
        offset,
        Math.min(10, this.deps.getBatchSize())
      )
      await this.deps.waitForIdle(context)
      const startedAt = this.deps.now()
      const result = await this.deps.persistAndEmitBatch(chunk, context)
      const batchMs = this.deps.now() - startedAt
      this.deps.recordBatchDuration(batchMs)
      insertedCount += result.insertedCount
      offset = nextOffset
      this.deps.emitProgress(offset, records.length)
      this.deps.logDebug('Full scan chunk committed and published', {
        path: rootPath,
        size: chunk.length,
        duration: this.deps.formatDuration(batchMs)
      })
      // Publication has completed and the producer's source lease has ended.
      // Pacing and idle waits never occupy that lease or the worker request slot.
      await this.deps.sleep(resolveFullScanPacingMs(batchMs, result.workerCpuMicros), context)
    }
    return { insertedCount }
  }
}
