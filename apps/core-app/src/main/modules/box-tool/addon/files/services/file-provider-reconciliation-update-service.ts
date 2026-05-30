import type { IndexedSourceDelta, IndexedSourceRecord } from '@talex-touch/utils/search'

export interface FileProviderReconciliationUpdateResult<TUpdated> {
  updated: TUpdated[]
  updatedCount: number
}

export interface FileProviderReconciliationUpdateDeps<
  TUpdate,
  TUpdated extends { path: string },
  TContext
> {
  updateRecords: (records: TUpdate[]) => Promise<TUpdated[]>
  emitDelta: (delta: IndexedSourceDelta, context: TContext) => Promise<void>
  mapRecord: (record: TUpdated) => IndexedSourceRecord
  sourceId: string
}

export class FileProviderReconciliationUpdateService<
  TUpdate,
  TUpdated extends { path: string },
  TContext
> {
  private readonly updateRecords: FileProviderReconciliationUpdateDeps<
    TUpdate,
    TUpdated,
    TContext
  >['updateRecords']
  private readonly emitDelta: FileProviderReconciliationUpdateDeps<
    TUpdate,
    TUpdated,
    TContext
  >['emitDelta']
  private readonly mapRecord: FileProviderReconciliationUpdateDeps<
    TUpdate,
    TUpdated,
    TContext
  >['mapRecord']
  private readonly sourceId: string

  constructor(deps: FileProviderReconciliationUpdateDeps<TUpdate, TUpdated, TContext>) {
    this.updateRecords = deps.updateRecords
    this.emitDelta = deps.emitDelta
    this.mapRecord = deps.mapRecord
    this.sourceId = deps.sourceId
  }

  async execute(
    records: TUpdate[],
    context: TContext
  ): Promise<FileProviderReconciliationUpdateResult<TUpdated>> {
    if (records.length === 0) {
      return { updated: [], updatedCount: 0 }
    }

    const updated = await this.updateRecords(records)
    for (const file of updated) {
      await this.emitDelta(
        {
          sourceId: this.sourceId,
          action: 'change',
          record: this.mapRecord(file),
          path: file.path,
          reason: 'file-provider-reconciliation-update'
        },
        context
      )
    }

    return {
      updated,
      updatedCount: records.length
    }
  }
}
