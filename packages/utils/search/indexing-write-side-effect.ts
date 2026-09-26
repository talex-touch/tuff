export interface IndexedWriteSideEffectOptions {
  extensionContext: string
  indexReason: string
  mutationLeaseId?: string
}

export interface IndexedWriteSideEffectServiceDeps<TRecord> {
  processExtensions: (records: TRecord[]) => Promise<void>
  scheduleIndexing: (records: TRecord[], reason: string, mutationLeaseId?: string) => void | Promise<unknown>
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  formatExtensionFailureMessage?: (context: string) => string
}

export class IndexedWriteSideEffectService<TRecord> {
  private readonly formatExtensionFailureMessage: (context: string) => string

  constructor(private readonly deps: IndexedWriteSideEffectServiceDeps<TRecord>) {
    this.formatExtensionFailureMessage =
      deps.formatExtensionFailureMessage ?? (context => `processExtensions failed (${context})`)
  }

  async dispatch(records: TRecord[], options: IndexedWriteSideEffectOptions): Promise<void> {
    if (records.length === 0) {
      return
    }

    await this.deps.scheduleIndexing(records, options.indexReason, options.mutationLeaseId)
    await this.deps
      .processExtensions(records)
      .catch(error => this.deps.logWarn(this.formatExtensionFailureMessage(options.extensionContext), error))
  }
}
