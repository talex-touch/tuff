import type { IndexedWriteFlushBuffer } from './indexing-write-buffer-service'

export type IndexedWriteFlushExecutorStatus = 'idle' | 'flushed' | 'not-ready'

export interface IndexedWriteFlushExecutorResult {
  status: IndexedWriteFlushExecutorStatus
  entries: number
  pending: number
  inflight: number
  reason?: string
  error?: string
  metadata?: Record<string, unknown>
  durationMs?: number
}

export interface IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry> {
  buffer: IndexedWriteFlushBuffer<TKey, TEntry>
  getBatchSize: () => number
  isAvailable: () => boolean
  ensureReady: () => Promise<boolean>
  buildPersistEntries: (entries: TEntry[]) => TPersistEntry[]
  persist: (entries: TPersistEntry[]) => Promise<void>
  waitForCapacity: () => Promise<void>
  recordDuration: (durationMs: number) => void
  now: () => number
  onBatchTaken?: (entries: TEntry[]) => void
  resolveBatchMetadata?: (entries: TEntry[]) => Record<string, unknown> | undefined
}

export class IndexedWriteFlushExecutorService<TKey, TEntry, TPersistEntry> {
  private readonly buffer: IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry>['buffer']
  private readonly getBatchSize: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['getBatchSize']
  private readonly isAvailable: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['isAvailable']
  private readonly ensureReady: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['ensureReady']
  private readonly buildPersistEntries: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['buildPersistEntries']
  private readonly persist: IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry>['persist']
  private readonly waitForCapacity: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['waitForCapacity']
  private readonly recordDuration: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['recordDuration']
  private readonly now: IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry>['now']
  private readonly onBatchTaken: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['onBatchTaken']
  private readonly resolveBatchMetadata: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry
  >['resolveBatchMetadata']

  constructor(deps: IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry>) {
    this.buffer = deps.buffer
    this.getBatchSize = deps.getBatchSize
    this.isAvailable = deps.isAvailable
    this.ensureReady = deps.ensureReady
    this.buildPersistEntries = deps.buildPersistEntries
    this.persist = deps.persist
    this.waitForCapacity = deps.waitForCapacity
    this.recordDuration = deps.recordDuration
    this.now = deps.now
    this.onBatchTaken = deps.onBatchTaken
    this.resolveBatchMetadata = deps.resolveBatchMetadata
  }

  async execute(): Promise<IndexedWriteFlushExecutorResult> {
    if (!this.isAvailable() || this.buffer.pendingSize === 0) {
      return this.buildIdleResult()
    }

    const { entries, keys } = this.buffer.take(this.getBatchSize())
    if (entries.length === 0) {
      return this.buildIdleResult()
    }

    this.onBatchTaken?.(entries)
    const metadata = this.resolveBatchMetadata?.(entries)

    try {
      const ready = await this.ensureReady()
      if (!ready) {
        this.buffer.rollback(keys)
        return this.buildNotReadyResult(entries.length, metadata)
      }

      await this.waitForCapacity()
      const persistEntries = this.buildPersistEntries(entries)
      const flushStart = this.now()
      await this.persist(persistEntries)
      const durationMs = this.now() - flushStart
      this.recordDuration(durationMs)
      this.buffer.commit(keys)
      return {
        status: 'flushed',
        entries: entries.length,
        pending: this.buffer.pendingSize,
        inflight: this.buffer.inflightSize,
        reason: 'persisted',
        metadata,
        durationMs
      }
    } catch (error) {
      this.buffer.rollback(keys)
      const flushError = error instanceof Error ? error.message : String(error)
      throw Object.assign(error instanceof Error ? error : new Error(flushError), {
        flushResult: {
          status: 'idle',
          entries: entries.length,
          pending: this.buffer.pendingSize,
          inflight: this.buffer.inflightSize,
          reason: 'persist-failed',
          error: flushError,
          metadata
        } satisfies IndexedWriteFlushExecutorResult
      })
    }
  }

  private buildIdleResult(): IndexedWriteFlushExecutorResult {
    return {
      status: 'idle',
      entries: 0,
      pending: this.buffer.pendingSize,
      inflight: this.buffer.inflightSize,
      reason: this.buffer.pendingSize === 0 ? 'no-pending' : 'unavailable'
    }
  }

  private buildNotReadyResult(
    entries: number,
    metadata: Record<string, unknown> | undefined
  ): IndexedWriteFlushExecutorResult {
    return {
      status: 'not-ready',
      entries,
      pending: this.buffer.pendingSize,
      inflight: this.buffer.inflightSize,
      reason: 'not-ready',
      metadata
    }
  }
}
