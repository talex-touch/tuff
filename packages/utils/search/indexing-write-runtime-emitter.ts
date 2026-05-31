import type {
  IndexedSourceDelta,
  IndexedSourceDeltaAction,
  IndexedSourceRecord,
  IndexedSourceRecordBatch
} from './indexing-source'

export interface IndexedWriteRuntimeEmitterDeps<TRecord, TContext> {
  sourceId: string
  mapRecord?: (record: TRecord) => IndexedSourceRecord
  getPath?: (record: TRecord) => string | undefined
  emitRecordBatch?: (
    batch: IndexedSourceRecordBatch,
    context: TContext
  ) => Promise<void> | void
  emitDelta?: (delta: IndexedSourceDelta, context: TContext) => Promise<void> | void
  emitProgress?: (current: number, total: number) => void
}

export interface IndexedWriteRuntimeEmitterDeltaOptions {
  action: IndexedSourceDeltaAction
  reason?: string
}

export interface IndexedWriteRuntimeEmitterDeleteOptions {
  reason?: string
}

export interface IndexedWriteRuntimeEmitterProgressOptions {
  current: number
  total: number
}

export interface IndexedWriteRuntimeEmitterBatchOptions {
  done?: boolean
}

export class IndexedWriteRuntimeEmitterService<TRecord, TContext = unknown> {
  private readonly sourceId: string
  private readonly mapRecord?: IndexedWriteRuntimeEmitterDeps<
    TRecord,
    TContext
  >['mapRecord']
  private readonly getPath: NonNullable<
    IndexedWriteRuntimeEmitterDeps<TRecord, TContext>['getPath']
  >
  private readonly emitRecordBatch?: IndexedWriteRuntimeEmitterDeps<
    TRecord,
    TContext
  >['emitRecordBatch']
  private readonly emitDelta?: IndexedWriteRuntimeEmitterDeps<
    TRecord,
    TContext
  >['emitDelta']
  private readonly emitProgress?: IndexedWriteRuntimeEmitterDeps<
    TRecord,
    TContext
  >['emitProgress']

  constructor(deps: IndexedWriteRuntimeEmitterDeps<TRecord, TContext>) {
    this.sourceId = deps.sourceId
    this.mapRecord = deps.mapRecord
    this.getPath =
      deps.getPath ??
      ((record) => {
        const value = (record as { path?: unknown }).path
        return typeof value === 'string' ? value : undefined
      })
    this.emitRecordBatch = deps.emitRecordBatch
    this.emitDelta = deps.emitDelta
    this.emitProgress = deps.emitProgress
  }

  async emitBatch(records: TRecord[], context: TContext): Promise<void> {
    if (!this.emitRecordBatch || records.length === 0) {
      return
    }

    await this.emitRecordBatch(this.buildBatch(records), context)
  }

  buildBatch(
    records: TRecord[],
    options: IndexedWriteRuntimeEmitterBatchOptions = {}
  ): IndexedSourceRecordBatch {
    const batch: IndexedSourceRecordBatch = {
      sourceId: this.sourceId,
      records: records.map((record) => this.mapIndexedRecord(record))
    }

    if (options.done !== undefined) {
      batch.done = options.done
    }

    return batch
  }

  async emitDeltas(
    records: TRecord[],
    context: TContext,
    options: IndexedWriteRuntimeEmitterDeltaOptions
  ): Promise<void> {
    if (!this.emitDelta || records.length === 0) {
      return
    }

    for (const record of records) {
      await this.emitDelta(this.buildDelta(record, options), context)
    }
  }

  buildDelta(
    record: TRecord,
    options: IndexedWriteRuntimeEmitterDeltaOptions
  ): IndexedSourceDelta {
    const indexedRecord = this.mapIndexedRecord(record)
    return {
      sourceId: this.sourceId,
      action: options.action,
      record: indexedRecord,
      path: this.getPath(record) ?? indexedRecord.path,
      reason: options.reason
    }
  }

  async emitDeleteDeltas(
    paths: string[],
    context: TContext,
    options: IndexedWriteRuntimeEmitterDeleteOptions = {}
  ): Promise<void> {
    if (!this.emitDelta || paths.length === 0) {
      return
    }

    for (const removedPath of paths) {
      await this.emitDelta(this.buildDeleteDelta(removedPath, options), context)
    }
  }

  buildDeleteDelta(
    path: string,
    options: IndexedWriteRuntimeEmitterDeleteOptions = {}
  ): IndexedSourceDelta {
    return {
      sourceId: this.sourceId,
      action: 'delete',
      stableKey: path,
      path,
      reason: options.reason
    }
  }

  emitProgressSnapshot(options: IndexedWriteRuntimeEmitterProgressOptions): void {
    this.emitProgress?.(options.current, options.total)
  }

  private mapIndexedRecord(record: TRecord): IndexedSourceRecord {
    if (!this.mapRecord) {
      throw new Error('IndexedWriteRuntimeEmitterService requires mapRecord for record emission')
    }

    return this.mapRecord(record)
  }
}
