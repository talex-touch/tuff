export interface FileProviderReconciliationUpdateResult {
  updatedCount: number
}

export interface FileProviderReconciliationUpdateDeps<TUpdate, TContext> {
  /** Publishes only after the metadata and search document committed together. */
  persistAndPublish: (records: TUpdate[], context: TContext) => Promise<{ updatedCount: number }>
}

export class FileProviderReconciliationUpdateService<TUpdate, TContext> {
  constructor(private readonly deps: FileProviderReconciliationUpdateDeps<TUpdate, TContext>) {}

  async execute(
    records: TUpdate[],
    context: TContext
  ): Promise<FileProviderReconciliationUpdateResult> {
    let updatedCount = 0
    for (let offset = 0; offset < records.length; offset += 10) {
      const result = await this.deps.persistAndPublish(records.slice(offset, offset + 10), context)
      updatedCount += result.updatedCount
    }
    return { updatedCount }
  }
}
