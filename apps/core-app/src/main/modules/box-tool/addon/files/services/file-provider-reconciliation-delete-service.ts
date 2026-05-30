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
  private readonly sourceId: string
  private readonly deleteRecords: FileProviderReconciliationDeleteDeps<
    TRecord,
    TContext
  >['deleteRecords']
  private readonly emitDelta: FileProviderReconciliationDeleteDeps<TRecord, TContext>['emitDelta']

  constructor(deps: FileProviderReconciliationDeleteDeps<TRecord, TContext>) {
    this.sourceId = deps.sourceId
    this.deleteRecords = deps.deleteRecords
    this.emitDelta = deps.emitDelta
  }

  async execute(
    records: TRecord[],
    context: TContext
  ): Promise<FileProviderReconciliationDeleteResult<TRecord>> {
    if (records.length === 0) {
      return { deleted: [], deletedCount: 0, deletedPaths: [] }
    }

    const deleteResult = await this.deleteRecords(records)
    for (const removedPath of deleteResult.deletedPaths) {
      await this.emitDelta(
        {
          sourceId: this.sourceId,
          action: 'delete',
          stableKey: removedPath,
          path: removedPath,
          reason: 'file-provider-reconciliation-delete'
        },
        context
      )
    }

    return {
      deleted: deleteResult.deleted,
      deletedCount: deleteResult.deleted.length,
      deletedPaths: deleteResult.deletedPaths
    }
  }
}
