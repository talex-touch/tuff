import {
  IndexedWriteRuntimeEmitterService,
  takeIndexedWriteRecordChunk
} from '@talex-touch/utils/search'
import type { IndexedSourceRecord, IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'

export interface FileProviderFullScanInsertResult<TInserted> {
  inserted: TInserted[]
  insertedCount: number
}

/**
 * A chunk slower than this means the write path is already behind, so the loop
 * parks for (at most) the chunk's own duration instead of hammering it.
 * Sits below the AIMD targetMs (300) so a chunk that already tripped congestion
 * control backs off exactly once.
 */
const FULL_SCAN_CHUNK_BACKOFF_MS = 250
const FULL_SCAN_CHUNK_BACKOFF_MAX_MS = 1_000

export interface FileProviderFullScanInsertDeps<TInserted, TContext> {
  sourceId: string
  mapRecord: (record: TInserted) => IndexedSourceRecord
  getBatchSize: () => number
  recordBatchDuration: (durationMs: number) => void
  waitForIdle: () => Promise<void>
  upsertFiles: (records: UpsertFileRecord[], reason: string) => Promise<TInserted[]>
  emitRecordBatch: (batch: IndexedSourceRecordBatch, context: TContext) => Promise<void>
  emitProgress: (current: number, total: number) => void
  sleep: (durationMs: number) => Promise<void>
  now: () => number
  formatDuration: (durationMs: number) => string
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderFullScanInsertService<TInserted, TContext> {
  private readonly getBatchSize: FileProviderFullScanInsertDeps<TInserted, TContext>['getBatchSize']
  private readonly recordBatchDuration: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['recordBatchDuration']
  private readonly waitForIdle: FileProviderFullScanInsertDeps<TInserted, TContext>['waitForIdle']
  private readonly upsertFiles: FileProviderFullScanInsertDeps<TInserted, TContext>['upsertFiles']
  private readonly sleep: FileProviderFullScanInsertDeps<TInserted, TContext>['sleep']
  private readonly now: FileProviderFullScanInsertDeps<TInserted, TContext>['now']
  private readonly formatDuration: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['formatDuration']
  private readonly logInfo: FileProviderFullScanInsertDeps<TInserted, TContext>['logInfo']
  private readonly logDebug: FileProviderFullScanInsertDeps<TInserted, TContext>['logDebug']
  private readonly runtimeEmitter: IndexedWriteRuntimeEmitterService<TInserted, TContext>

  constructor(deps: FileProviderFullScanInsertDeps<TInserted, TContext>) {
    this.getBatchSize = deps.getBatchSize
    this.recordBatchDuration = deps.recordBatchDuration
    this.waitForIdle = deps.waitForIdle
    this.upsertFiles = deps.upsertFiles
    this.sleep = deps.sleep
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logInfo = deps.logInfo
    this.logDebug = deps.logDebug
    this.runtimeEmitter = new IndexedWriteRuntimeEmitterService({
      sourceId: deps.sourceId,
      mapRecord: deps.mapRecord,
      emitRecordBatch: deps.emitRecordBatch,
      emitProgress: deps.emitProgress
    })
  }

  async execute(
    rootPath: string,
    records: UpsertFileRecord[],
    context: TContext
  ): Promise<FileProviderFullScanInsertResult<TInserted>> {
    if (records.length === 0) {
      return { inserted: [], insertedCount: 0 }
    }

    this.logInfo('Preparing to index full-scan results', {
      path: rootPath,
      files: records.length
    })

    const insertedRecords: TInserted[] = []
    let indexedFiles = 0
    let recordOffset = 0
    this.runtimeEmitter.emitProgressSnapshot({
      current: 0,
      total: records.length
    })

    while (recordOffset < records.length) {
      const { chunk, chunkSize, nextOffset } = takeIndexedWriteRecordChunk(
        records,
        recordOffset,
        this.getBatchSize()
      )
      recordOffset = nextOffset

      await this.waitForIdle()
      const chunkStart = this.now()
      const inserted = await this.upsertFiles(chunk, 'full-scan.upsert')
      const batchMs = this.now() - chunkStart
      this.recordBatchDuration(batchMs)
      insertedRecords.push(...inserted)

      this.logDebug('Full scan chunk inserted', {
        path: rootPath,
        chunk: `batch(${chunkSize})`,
        size: chunk.length,
        duration: this.formatDuration(batchMs)
      })

      await this.runtimeEmitter.emitBatch(inserted, context)
      indexedFiles += chunk.length
      this.runtimeEmitter.emitProgressSnapshot({
        current: indexedFiles,
        total: records.length
      })
      // `recordBatchDuration` feeds the AIMD window (targetMs=300) and the two
      // awaited worker round-trips above already hand the event loop back, so a
      // fixed floor here is a second, redundant pacer — and a throughput cap:
      // measured 607 chunks x ~177ms for a 10.6k-file scan, of which ~100ms per
      // chunk (56%) was this timer. Only back off when the chunk itself ran long
      // enough that the next one would compound the backlog.
      if (batchMs >= FULL_SCAN_CHUNK_BACKOFF_MS) {
        await this.sleep(Math.min(Math.round(batchMs), FULL_SCAN_CHUNK_BACKOFF_MAX_MS))
      }
    }

    return {
      inserted: insertedRecords,
      insertedCount: insertedRecords.length
    }
  }
}
