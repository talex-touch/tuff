import { IndexedWriteRuntimeEmitterService } from '@talex-touch/utils/search'
import type { IndexedSourceDelta } from '@talex-touch/utils/search'
import type {
  IndexedWriteDeleteExecutorResult,
  IndexedWriteDeleteRecord
} from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderReconciliationDeleteResult<TRecord extends IndexedWriteDeleteRecord> {
  deleted: TRecord[]
  deletedCount: number
  deletedPaths: string[]
}

export interface FileProviderReconciliationDeleteDeps<
  TRecord extends IndexedWriteDeleteRecord,
  TContext
> {
  sourceId: string
  deleteRecords: (records: TRecord[]) => Promise<IndexedWriteDeleteExecutorResult<TRecord>>
  emitDelta: (delta: IndexedSourceDelta, context: TContext) => Promise<void>
}

export class FileProviderReconciliationDeleteService<
  TRecord extends IndexedWriteDeleteRecord,
  TContext
> {
  private readonly deleteRecords: FileProviderReconciliationDeleteDeps<
    TRecord,
    TContext
  >['deleteRecords']
  private readonly runtimeEmitter: IndexedWriteRuntimeEmitterService<TRecord, TContext>

  constructor(deps: FileProviderReconciliationDeleteDeps<TRecord, TContext>) {
    this.deleteRecords = deps.deleteRecords
    this.runtimeEmitter = new IndexedWriteRuntimeEmitterService({
      sourceId: deps.sourceId,
      emitDelta: deps.emitDelta
    })
  }

  async execute(
    records: TRecord[],
    context: TContext
  ): Promise<FileProviderReconciliationDeleteResult<TRecord>> {
    if (records.length === 0) {
      return { deleted: [], deletedCount: 0, deletedPaths: [] }
    }

    const deleteResult = await this.deleteRecords(records)
    await this.runtimeEmitter.emitDeleteDeltas(deleteResult.deletedPaths, context, {
      reason: 'file-provider-reconciliation-delete'
    })

    return {
      deleted: deleteResult.deleted,
      deletedCount: deleteResult.deleted.length,
      deletedPaths: deleteResult.deletedPaths
    }
  }
}
