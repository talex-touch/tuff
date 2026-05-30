export interface IndexedWorkerSchedulerConfig {
  chunkSize?: number
  deferredDelayMs?: number
}

export interface IndexedWorkerSchedulerDeps<TPayload> {
  getWorkerContext: () => string | null
  dispatch: (context: string, payload: TPayload[]) => Promise<unknown>
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: IndexedWorkerSchedulerConfig
}

export interface IndexedWorkerScheduleBatch<TPayload> {
  payload: TPayload[]
  reason: string
  deferred?: boolean
}

export class IndexedWorkerSchedulerService<TPayload> {
  private readonly chunkSize: number
  private readonly deferredDelayMs: number

  constructor(private readonly deps: IndexedWorkerSchedulerDeps<TPayload>) {
    this.chunkSize = deps.config?.chunkSize ?? 30
    this.deferredDelayMs = deps.config?.deferredDelayMs ?? 5_000
  }

  schedule(batch: IndexedWorkerScheduleBatch<TPayload>): void {
    if (batch.payload.length === 0 || !this.deps.getWorkerContext()) {
      return
    }

    if (batch.deferred) {
      setTimeout(() => {
        this.scheduleChunks(batch.payload, batch.reason)
      }, this.deferredDelayMs)
      return
    }

    this.scheduleChunks(batch.payload, batch.reason)
  }

  private scheduleChunks(payload: TPayload[], reason: string): void {
    const context = this.deps.getWorkerContext()
    if (!context || payload.length === 0) {
      return
    }

    for (let i = 0; i < payload.length; i += this.chunkSize) {
      const chunk = payload.slice(i, i + this.chunkSize)
      void this.deps.dispatch(context, chunk).catch((error) => {
        this.deps.logWarn('Index worker failed', error, {
          reason,
          size: chunk.length
        })
      })
    }
  }
}
