import {
  IndexedWriteRuntimeEmitterService,
  takeIndexedWriteRecordChunk
} from '@talex-touch/utils/search'
import type { IndexedSourceRecord, IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../../search-engine/workers/search-index-worker-client'

export interface FileProviderFullScanInsertResult<TInserted> {
  inserted: TInserted[]
  insertedCount: number
}

export interface FileProviderFullScanInsertDeps<TInserted, TContext> {
  sourceId: string
  mapRecord: (record: TInserted) => IndexedSourceRecord
  getBatchSize: () => number
  recordBatchDuration: (durationMs: number) => void
  waitForIdle: () => Promise<void>
  upsertFiles: (records: UpsertFileRecord[], reason: string) => Promise<TInserted[]>
  dispatchSideEffects: (records: TInserted[]) => void
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
  private readonly dispatchSideEffects: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['dispatchSideEffects']
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
    this.dispatchSideEffects = deps.dispatchSideEffects
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

      this.dispatchSideEffects(inserted)
      await this.runtimeEmitter.emitBatch(inserted, context)
      indexedFiles += chunk.length
      this.runtimeEmitter.emitProgressSnapshot({
        current: indexedFiles,
        total: records.length
      })
      await this.sleep(Math.max(100, Math.round(batchMs)))
    }

    return {
      inserted: insertedRecords,
      insertedCount: insertedRecords.length
    }
  }
}
