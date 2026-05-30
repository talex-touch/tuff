import type { UpsertFileRecord } from '../../../search-engine/workers/search-index-worker-client'

export interface FileProviderFullScanInsertResult<TInserted> {
  inserted: TInserted[]
  insertedCount: number
}

export interface FileProviderFullScanInsertDeps<TInserted, TContext> {
  getBatchSize: () => number
  recordBatchDuration: (durationMs: number) => void
  waitForIdle: () => Promise<void>
  upsertFiles: (records: UpsertFileRecord[], reason: string) => Promise<TInserted[]>
  dispatchSideEffects: (records: TInserted[]) => void
  emitRecordBatch: (records: TInserted[], context: TContext) => Promise<void>
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
  private readonly emitRecordBatch: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['emitRecordBatch']
  private readonly emitProgress: FileProviderFullScanInsertDeps<TInserted, TContext>['emitProgress']
  private readonly sleep: FileProviderFullScanInsertDeps<TInserted, TContext>['sleep']
  private readonly now: FileProviderFullScanInsertDeps<TInserted, TContext>['now']
  private readonly formatDuration: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['formatDuration']
  private readonly logInfo: FileProviderFullScanInsertDeps<TInserted, TContext>['logInfo']
  private readonly logDebug: FileProviderFullScanInsertDeps<TInserted, TContext>['logDebug']

  constructor(deps: FileProviderFullScanInsertDeps<TInserted, TContext>) {
    this.getBatchSize = deps.getBatchSize
    this.recordBatchDuration = deps.recordBatchDuration
    this.waitForIdle = deps.waitForIdle
    this.upsertFiles = deps.upsertFiles
    this.dispatchSideEffects = deps.dispatchSideEffects
    this.emitRecordBatch = deps.emitRecordBatch
    this.emitProgress = deps.emitProgress
    this.sleep = deps.sleep
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logInfo = deps.logInfo
    this.logDebug = deps.logDebug
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
    this.emitProgress(0, records.length)

    while (recordOffset < records.length) {
      const chunkSize = this.getBatchSize()
      const chunk = records.slice(recordOffset, recordOffset + chunkSize)
      recordOffset += chunk.length

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
      await this.emitRecordBatch(inserted, context)
      indexedFiles += chunk.length
      this.emitProgress(indexedFiles, records.length)
      await this.sleep(Math.max(100, Math.round(batchMs)))
    }

    return {
      inserted: insertedRecords,
      insertedCount: insertedRecords.length
    }
  }
}
