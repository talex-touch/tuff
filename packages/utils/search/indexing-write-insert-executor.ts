export interface IndexedWriteInsertExecutorDeps<TInsert, TInserted> {
  persist: (records: TInsert[]) => Promise<TInserted[]>;
  dispatchInserted: (records: TInserted[]) => void;
  logDebug: (message: string, meta?: Record<string, unknown>) => void;
  successMessage?: string;
}

export interface IndexedWriteInsertExecutorOptions {
  dispatchSideEffects?: boolean;
}

export class IndexedWriteInsertExecutorService<TInsert, TInserted> {
  private readonly persist: IndexedWriteInsertExecutorDeps<
    TInsert,
    TInserted
  >["persist"];
  private readonly dispatchInserted: IndexedWriteInsertExecutorDeps<
    TInsert,
    TInserted
  >["dispatchInserted"];
  private readonly logDebug: IndexedWriteInsertExecutorDeps<
    TInsert,
    TInserted
  >["logDebug"];
  private readonly successMessage: string;

  constructor(deps: IndexedWriteInsertExecutorDeps<TInsert, TInserted>) {
    this.persist = deps.persist;
    this.dispatchInserted = deps.dispatchInserted;
    this.logDebug = deps.logDebug;
    this.successMessage =
      deps.successMessage ?? "Indexed write insert completed";
  }

  async execute(
    records: TInsert[],
    options: IndexedWriteInsertExecutorOptions = {},
  ): Promise<TInserted[]> {
    if (records.length === 0) {
      return [];
    }

    const inserted = await this.persist(records);
    if (options.dispatchSideEffects !== false) this.dispatchInserted(inserted);
    if (inserted.length > 0) {
      this.logDebug(this.successMessage, { inserted: inserted.length });
    }
    return inserted;
  }
}
