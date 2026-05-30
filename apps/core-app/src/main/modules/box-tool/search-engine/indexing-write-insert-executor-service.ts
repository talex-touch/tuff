export interface IndexedWriteInsertExecutorDeps<TInsert, TInserted> {
  persist: (records: TInsert[]) => Promise<TInserted[]>
  dispatchInserted: (records: TInserted[]) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  successMessage?: string
}

export class IndexedWriteInsertExecutorService<TInsert, TInserted> {
  private readonly persist: IndexedWriteInsertExecutorDeps<TInsert, TInserted>['persist']
  private readonly dispatchInserted: IndexedWriteInsertExecutorDeps<
    TInsert,
    TInserted
  >['dispatchInserted']
  private readonly logDebug: IndexedWriteInsertExecutorDeps<TInsert, TInserted>['logDebug']
  private readonly successMessage: string

  constructor(deps: IndexedWriteInsertExecutorDeps<TInsert, TInserted>) {
    this.persist = deps.persist
    this.dispatchInserted = deps.dispatchInserted
    this.logDebug = deps.logDebug
    this.successMessage = deps.successMessage ?? 'Indexed write insert completed'
  }

  async execute(records: TInsert[]): Promise<TInserted[]> {
    if (records.length === 0) {
      return []
    }

    const inserted = await this.persist(records)
    this.dispatchInserted(inserted)
    if (inserted.length > 0) {
      this.logDebug(this.successMessage, { inserted: inserted.length })
    }
    return inserted
  }
}
