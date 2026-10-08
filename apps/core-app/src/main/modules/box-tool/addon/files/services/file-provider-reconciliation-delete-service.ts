import type {
  IndexedWriteDeleteExecutorResult,
  IndexedWriteDeleteRecord
} from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderReconciliationDeleteResult<TRecord extends IndexedWriteDeleteRecord> {
  deleted: TRecord[]
  deletedCount: number
  deletedPaths: string[]
  deferred: boolean
}

export interface FileProviderReconciliationDeleteDeps<
  TRecord extends IndexedWriteDeleteRecord,
  TContext
> {
  sourceId: string
  /** Owns atomic derived-data deletion and its one post-commit publication. */
  deleteRecords: (
    records: TRecord[],
    context: TContext
  ) => Promise<IndexedWriteDeleteExecutorResult<TRecord> & { deferred: boolean }>
}

export class FileProviderReconciliationDeleteService<
  TRecord extends IndexedWriteDeleteRecord,
  TContext
> {
  constructor(private readonly deps: FileProviderReconciliationDeleteDeps<TRecord, TContext>) {}

  async execute(
    records: TRecord[],
    context: TContext
  ): Promise<FileProviderReconciliationDeleteResult<TRecord>> {
    const result = await this.deps.deleteRecords(records, context)
    return {
      deleted: result.deleted,
      deletedCount: result.deleted.length,
      deletedPaths: result.deletedPaths,
      deferred: result.deferred
    }
  }
}
