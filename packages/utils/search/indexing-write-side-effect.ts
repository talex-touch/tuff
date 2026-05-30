export interface IndexedWriteSideEffectOptions {
  extensionContext: string
  indexReason: string
}

export interface IndexedWriteSideEffectServiceDeps<TRecord> {
  processExtensions: (records: TRecord[]) => Promise<void>
  scheduleIndexing: (records: TRecord[], reason: string) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  formatExtensionFailureMessage?: (context: string) => string
}

export class IndexedWriteSideEffectService<TRecord> {
  private readonly formatExtensionFailureMessage: (context: string) => string

  constructor(private readonly deps: IndexedWriteSideEffectServiceDeps<TRecord>) {
    this.formatExtensionFailureMessage =
      deps.formatExtensionFailureMessage ??
      ((context) => `processExtensions failed (${context})`)
  }

  dispatch(records: TRecord[], options: IndexedWriteSideEffectOptions): void {
    if (records.length === 0) {
      return
    }

    void this.deps
      .processExtensions(records)
      .catch((error) =>
        this.deps.logWarn(this.formatExtensionFailureMessage(options.extensionContext), error)
      )
    this.deps.scheduleIndexing(records, options.indexReason)
  }
}
