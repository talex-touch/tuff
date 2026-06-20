import type { IndexedWriteFlushBuffer } from './indexing-write-buffer'

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

export interface IndexedWriteFlushExecutorResultMapOptions<
  TStatus extends string,
  TMetric extends string = never
> {
  statusMap?: Record<IndexedWriteFlushExecutorStatus, TStatus>
  numericMetadataKeys?: readonly TMetric[]
}

export interface IndexedWriteFlushBatchMetric<TEntry> {
  key: string
  count: (entry: TEntry) => boolean
}

export type IndexedWriteFlushExecutorMappedResult<
  TStatus extends string,
  TMetric extends string = never
> =
  IndexedWriteFlushExecutorResult & {
    status: TStatus
  } & Record<TMetric, number>

export function mapIndexedWriteFlushExecutorResult<TMetric extends string = never>(
  result: IndexedWriteFlushExecutorResult,
  options?: {
    numericMetadataKeys?: readonly TMetric[]
  }
): IndexedWriteFlushExecutorMappedResult<IndexedWriteFlushExecutorStatus, TMetric>
export function mapIndexedWriteFlushExecutorResult<
  TStatus extends string,
  TMetric extends string = never
>(
  result: IndexedWriteFlushExecutorResult,
  options: {
    statusMap: Record<IndexedWriteFlushExecutorStatus, TStatus>
    numericMetadataKeys?: readonly TMetric[]
  }
): IndexedWriteFlushExecutorMappedResult<TStatus, TMetric>
export function mapIndexedWriteFlushExecutorResult<
  TStatus extends string,
  TMetric extends string = never
>(
  result: IndexedWriteFlushExecutorResult,
  options: IndexedWriteFlushExecutorResultMapOptions<TStatus, TMetric> = {}
): IndexedWriteFlushExecutorMappedResult<TStatus | IndexedWriteFlushExecutorStatus, TMetric> {
  const mappedStatus = options.statusMap?.[result.status] ?? result.status
  const numericMetadata = Object.fromEntries(
    (options.numericMetadataKeys ?? []).map((key) => [
      key,
      normalizeNonNegativeNumber(result.metadata?.[key])
    ])
  )

  return {
    ...result,
    ...numericMetadata,
    status: mappedStatus
  } as IndexedWriteFlushExecutorMappedResult<TStatus | IndexedWriteFlushExecutorStatus, TMetric>
}

export function buildIndexedWriteFlushBatchMetrics<TEntry, TMetric extends string>(
  entries: TEntry[],
  metrics: readonly (IndexedWriteFlushBatchMetric<TEntry> & { key: TMetric })[]
): Record<TMetric, number> {
  return Object.fromEntries(
    metrics.map((metric) => [
      metric.key,
      entries.reduce((count, entry) => count + (metric.count(entry) ? 1 : 0), 0)
    ])
  ) as Record<TMetric, number>
}

export interface IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry, TPersistResult = void> {
  buffer: IndexedWriteFlushBuffer<TKey, TEntry>
  getBatchSize: () => number
  isAvailable: () => boolean
  ensureReady: () => Promise<boolean>
  buildPersistEntries: (entries: TEntry[]) => TPersistEntry[]
  persist: (entries: TPersistEntry[]) => Promise<TPersistResult>
  waitForCapacity: () => Promise<void>
  recordDuration: (durationMs: number) => void
  now: () => number
  onBatchTaken?: (entries: TEntry[]) => void
  resolveBatchMetadata?: (entries: TEntry[]) => Record<string, unknown> | undefined
  resolvePersistMetadata?: (
    result: TPersistResult,
    entries: TPersistEntry[]
  ) => Record<string, unknown> | undefined
}

export class IndexedWriteFlushExecutorService<TKey, TEntry, TPersistEntry, TPersistResult = void> {
  private readonly buffer: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['buffer']
  private readonly getBatchSize: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['getBatchSize']
  private readonly isAvailable: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['isAvailable']
  private readonly ensureReady: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['ensureReady']
  private readonly buildPersistEntries: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['buildPersistEntries']
  private readonly persist: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['persist']
  private readonly waitForCapacity: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['waitForCapacity']
  private readonly recordDuration: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['recordDuration']
  private readonly now: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['now']
  private readonly onBatchTaken: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['onBatchTaken']
  private readonly resolveBatchMetadata: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['resolveBatchMetadata']
  private readonly resolvePersistMetadata: IndexedWriteFlushExecutorDeps<
    TKey,
    TEntry,
    TPersistEntry,
    TPersistResult
  >['resolvePersistMetadata']

  constructor(deps: IndexedWriteFlushExecutorDeps<TKey, TEntry, TPersistEntry, TPersistResult>) {
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
    this.resolvePersistMetadata = deps.resolvePersistMetadata
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
      const persistResult = await this.persist(persistEntries)
      const durationMs = calculateDurationMs(flushStart, this.now())
      this.recordDuration(durationMs)
      this.buffer.commit(keys)
      const persistMetadata = this.resolvePersistMetadata?.(persistResult, persistEntries)
      const combinedMetadata = persistMetadata
        ? {
            ...(metadata ?? {}),
            ...persistMetadata
          }
        : metadata
      return {
        status: 'flushed',
        entries: entries.length,
        pending: this.buffer.pendingSize,
        inflight: this.buffer.inflightSize,
        reason: 'persisted',
        metadata: combinedMetadata,
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

function calculateDurationMs(startedAt: number, completedAt: number): number {
  return normalizeNonNegativeNumber(completedAt - startedAt)
}

function normalizeNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}
