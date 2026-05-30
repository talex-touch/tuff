export interface IndexedWriteSideEffectOptions {
  extensionContext: string
  indexReason: string
}

export interface IndexedWriteSideEffectServiceDeps<TRecord> {
  processExtensions: (records: TRecord[]) => Promise<void>
  scheduleIndexing: (records: TRecord[], reason: string) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class IndexedWriteSideEffectService<TRecord> {
  constructor(private readonly deps: IndexedWriteSideEffectServiceDeps<TRecord>) {}

  dispatch(records: TRecord[], options: IndexedWriteSideEffectOptions): void {
    if (records.length === 0) {
      return
    }

    void this.deps
      .processExtensions(records)
      .catch((error) =>
        this.deps.logWarn(`processFileExtensions failed (${options.extensionContext})`, error)
      )
    this.deps.scheduleIndexing(records, options.indexReason)
  }
}
