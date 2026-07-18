import {
  chunkIndexedWriteRecords,
  IndexedWriteRuntimeEmitterService,
  mapIndexedWriteReconciliationUpsertRecords
} from '@talex-touch/utils/search'
import type {
  IndexedSourceDelta,
  IndexedSourceRecord,
  IndexedSourceRecordBatch
} from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'

export interface FileProviderReconciliationDiskFile {
  path: string
  name: string
  extension: string | null
  size: number | null
  mtime: Date | number | string
  ctime: Date | number | string
}

export interface FileProviderReconciliationInsertResult<TInserted> {
  inserted: TInserted[]
  insertedCount: number
}

export interface FileProviderReconciliationInsertDeps<
  TInserted extends { path: string },
  TContext
> {
  sourceId: string
  waitForIdle: () => Promise<void>
  runQueue: (
    chunks: UpsertFileRecord[][],
    handler: (chunk: UpsertFileRecord[], index: number) => Promise<void>,
    options: { estimatedTaskTimeMs: number; label: string }
  ) => Promise<void>
  upsertFiles: (records: UpsertFileRecord[], reason: string) => Promise<TInserted[]>
  emitRecordBatch: (batch: IndexedSourceRecordBatch, context: TContext) => Promise<void>
  emitDelta: (delta: IndexedSourceDelta, context: TContext) => Promise<void>
  shouldEmitRecordBatch: (context: TContext) => boolean
  mapRecord: (record: TInserted) => IndexedSourceRecord
  emitProgress: (current: number, total: number) => void
  now: () => number
  formatDuration: (durationMs: number) => string
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderReconciliationInsertService<TInserted extends { path: string }, TContext> {
  private readonly waitForIdle: FileProviderReconciliationInsertDeps<
    TInserted,
    TContext
  >['waitForIdle']
  private readonly runQueue: FileProviderReconciliationInsertDeps<TInserted, TContext>['runQueue']
  private readonly upsertFiles: FileProviderReconciliationInsertDeps<
    TInserted,
    TContext
  >['upsertFiles']
  private readonly emitProgress: FileProviderReconciliationInsertDeps<
    TInserted,
    TContext
  >['emitProgress']
  private readonly shouldEmitRecordBatch: FileProviderReconciliationInsertDeps<
    TInserted,
    TContext
  >['shouldEmitRecordBatch']
  private readonly now: FileProviderReconciliationInsertDeps<TInserted, TContext>['now']
  private readonly formatDuration: FileProviderReconciliationInsertDeps<
    TInserted,
    TContext
  >['formatDuration']
  private readonly logDebug: FileProviderReconciliationInsertDeps<TInserted, TContext>['logDebug']
  private readonly runtimeEmitter: IndexedWriteRuntimeEmitterService<TInserted, TContext>

  constructor(deps: FileProviderReconciliationInsertDeps<TInserted, TContext>) {
    this.waitForIdle = deps.waitForIdle
    this.runQueue = deps.runQueue
    this.upsertFiles = deps.upsertFiles
    this.emitProgress = deps.emitProgress
    this.shouldEmitRecordBatch = deps.shouldEmitRecordBatch
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logDebug = deps.logDebug
    this.runtimeEmitter = new IndexedWriteRuntimeEmitterService({
      sourceId: deps.sourceId,
      mapRecord: deps.mapRecord,
      defaultDeltaReason: 'file-provider-reconciliation-add',
      emitRecordBatch: deps.emitRecordBatch,
      emitDelta: deps.emitDelta,
      emitProgress: deps.emitProgress
    })
  }

  async execute(
    filesToAdd: FileProviderReconciliationDiskFile[],
    context: TContext
  ): Promise<FileProviderReconciliationInsertResult<TInserted>> {
    if (filesToAdd.length === 0) {
      return { inserted: [], insertedCount: 0 }
    }

    const records = mapIndexedWriteReconciliationUpsertRecords(filesToAdd, {
      lastIndexedAt: new Date()
    })
    const chunks = chunkIndexedWriteRecords(records, 20)
    const insertedRecords: TInserted[] = []
    let reconciledFiles = 0
    this.emitProgress(0, filesToAdd.length)

    await this.runQueue(
      chunks,
      async (chunk, chunkIndex) => {
        await this.waitForIdle()
        const chunkStart = this.now()
        const inserted = await this.upsertFiles(chunk, 'reconciliation.upsert')
        insertedRecords.push(...inserted)
        this.logDebug('Reconciliation chunk inserted', {
          chunk: `${chunkIndex + 1}/${chunks.length}`,
          size: chunk.length,
          duration: this.formatDuration(this.now() - chunkStart)
        })
        if (this.shouldEmitRecordBatch(context)) {
          await this.runtimeEmitter.emitBatch(inserted, context)
        } else {
          await this.runtimeEmitter.emitDeltas(inserted, context, { action: 'add' })
        }
        reconciledFiles += chunk.length
        this.runtimeEmitter.emitProgressSnapshot({
          current: reconciledFiles,
          total: filesToAdd.length
        })
      },
      {
        estimatedTaskTimeMs: 20,
        label: 'FileProvider::reconciliationInsert'
      }
    )

    return {
      inserted: insertedRecords,
      insertedCount: insertedRecords.length
    }
  }
}
