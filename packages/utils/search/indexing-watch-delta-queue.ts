export type IndexingWatchDeltaAction = 'add' | 'change' | 'delete'

export interface IndexingWatchDeltaBasePayload<TAction extends string = IndexingWatchDeltaAction> {
  action: TAction
  rawPath: string
}

export type IndexingWatchDeltaEntry<TPayload extends IndexingWatchDeltaBasePayload> = [
  string,
  TPayload
]

export interface IndexingWatchDeltaCoalesceInput<TPayload extends IndexingWatchDeltaBasePayload> {
  key: string
  previous: TPayload | undefined
  next: TPayload
}

export interface IndexingWatchDeltaQueueServiceDeps<
  TPayload extends IndexingWatchDeltaBasePayload
> {
  normalizeKey: (rawPath: string) => string
  shouldAccept: (rawPath: string) => boolean
  prepareFlush: () => Promise<boolean>
  processEntries: (entries: IndexingWatchDeltaEntry<TPayload>[]) => Promise<void>
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  coalesce?: (input: IndexingWatchDeltaCoalesceInput<TPayload>) => TPayload
}

export function coalesceIndexingWatchDelta<TPayload extends IndexingWatchDeltaBasePayload>(
  previous: TPayload | undefined,
  next: TPayload
): TPayload {
  if (next.action === 'delete') {
    return next
  }

  if (previous?.action === 'delete') {
    return previous
  }

  if (!previous) {
    return next
  }

  const nextAction = previous.action === 'add' ? previous.action : next.action
  const nextRawPath = next.action === 'add' ? next.rawPath : previous.rawPath
  return {
    ...previous,
    ...next,
    action: nextAction,
    rawPath: nextRawPath
  }
}

export class IndexingWatchDeltaQueueService<TPayload extends IndexingWatchDeltaBasePayload> {
  private taskChain: Promise<void> = Promise.resolve()
  private readonly pending = new Map<string, TPayload>()

  constructor(private readonly deps: IndexingWatchDeltaQueueServiceDeps<TPayload>) {}

  getPendingSize(): number {
    return this.pending.size
  }

  enqueue(
    rawPath: string,
    action: TPayload['action'],
    metadata?: Omit<TPayload, keyof IndexingWatchDeltaBasePayload<TPayload['action']>>
  ): void {
    if (!this.deps.shouldAccept(rawPath)) {
      return
    }

    const key = this.deps.normalizeKey(rawPath)
    const previous = this.pending.get(key)
    const next = {
      ...(metadata ?? {}),
      action,
      rawPath
    } as TPayload
    const coalesced = this.deps.coalesce
      ? this.deps.coalesce({ key, previous, next })
      : coalesceIndexingWatchDelta(previous, next)

    this.pending.set(key, coalesced)
    this.schedule()
  }

  flushSoon(): void {
    this.schedule()
  }

  private schedule(): void {
    if (this.pending.size === 0) {
      return
    }

    this.taskChain = this.taskChain
      .then(() => this.flush())
      .catch((error) => {
        this.deps.logError('Failed to process watch delta updates.', error)
      })
  }

  private async flush(): Promise<void> {
    if (this.pending.size === 0) {
      return
    }

    if (!(await this.deps.prepareFlush())) {
      return
    }

    const entries = Array.from(this.pending.entries())
    await this.deps.processEntries(entries)
    this.deleteProcessedEntries(entries)
  }

  private deleteProcessedEntries(entries: IndexingWatchDeltaEntry<TPayload>[]): void {
    for (const [key, payload] of entries) {
      if (this.pending.get(key) === payload) {
        this.pending.delete(key)
      }
    }
  }
}
