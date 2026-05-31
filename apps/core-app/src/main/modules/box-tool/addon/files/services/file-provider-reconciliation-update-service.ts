import { IndexedWriteRuntimeEmitterService } from '@talex-touch/utils/search'
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
  private readonly runtimeEmitter: IndexedWriteRuntimeEmitterService<TUpdated, TContext>

  constructor(deps: FileProviderReconciliationUpdateDeps<TUpdate, TUpdated, TContext>) {
    this.updateRecords = deps.updateRecords
    this.runtimeEmitter = new IndexedWriteRuntimeEmitterService({
      sourceId: deps.sourceId,
      mapRecord: deps.mapRecord,
      emitDelta: deps.emitDelta
    })
  }

  async execute(
    records: TUpdate[],
    context: TContext
  ): Promise<FileProviderReconciliationUpdateResult<TUpdated>> {
    if (records.length === 0) {
      return { updated: [], updatedCount: 0 }
    }

    const updated = await this.updateRecords(records)
    await this.runtimeEmitter.emitDeltas(updated, context, {
      action: 'change',
      reason: 'file-provider-reconciliation-update'
    })

    return {
      updated,
      updatedCount: records.length
    }
  }
}
