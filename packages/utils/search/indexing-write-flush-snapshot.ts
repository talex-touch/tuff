export type IndexedWriteFlushSnapshotStatus = 'idle' | 'flushed' | 'not-ready' | 'failed'

export interface IndexedWriteFlushSnapshotBase {
  status: string
  entries: number
  pending: number
  inflight: number
  reason?: string
  error?: string
  metadata?: Record<string, unknown>
  durationMs?: number
  checkedAt: number
}

export interface IndexedWriteFlushSnapshot extends IndexedWriteFlushSnapshotBase {
  status: IndexedWriteFlushSnapshotStatus
}

export class IndexedWriteFlushSnapshotService<
  TSnapshot extends IndexedWriteFlushSnapshotBase = IndexedWriteFlushSnapshot
> {
  private lastSnapshot: TSnapshot | null = null

  getSnapshot(): TSnapshot | null {
    return this.lastSnapshot
  }

  record(snapshot: Omit<TSnapshot, 'checkedAt'>): TSnapshot {
    this.lastSnapshot = {
      ...snapshot,
      checkedAt: Date.now()
    } as TSnapshot
    return this.lastSnapshot
  }
}

export interface IndexedWriteFlushFailureSnapshotInput<
  TResult extends Partial<IndexedWriteFlushSnapshotBase> = Partial<IndexedWriteFlushSnapshotBase>
> {
  error: unknown
  flushResult?: TResult | null
  pendingSize: number
  inflightSize: number
  metadata?: Record<string, unknown>
  stringifyError?: (error: unknown) => string
}

export function getIndexedWriteFlushResultFromError<
  TResult extends Partial<IndexedWriteFlushSnapshotBase> = Partial<IndexedWriteFlushSnapshotBase>
>(error: unknown): TResult | null {
  if (!error || typeof error !== 'object' || !('flushResult' in error)) {
    return null
  }

  const result = (error as { flushResult?: unknown }).flushResult
  if (!result || typeof result !== 'object') {
    return null
  }

  return result as TResult
}

export function buildIndexedWriteFlushFailureSnapshot<
  TSnapshot extends IndexedWriteFlushSnapshotBase = IndexedWriteFlushSnapshotBase,
  TResult extends Partial<TSnapshot> = Partial<TSnapshot>
>(input: IndexedWriteFlushFailureSnapshotInput<TResult>): Omit<TSnapshot, 'checkedAt'> {
  const flushResult = input.flushResult ?? getIndexedWriteFlushResultFromError<TResult>(input.error)
  const stringifyError = input.stringifyError ?? defaultIndexedWriteFlushErrorStringifier

  return {
    status: 'failed',
    entries: flushResult?.entries ?? 0,
    pending: flushResult?.pending ?? input.pendingSize,
    inflight: flushResult?.inflight ?? input.inflightSize,
    reason: flushResult?.reason ?? 'flush-failed',
    error: flushResult?.error ?? stringifyError(input.error),
    metadata: {
      ...(flushResult?.metadata ?? {}),
      ...(input.metadata ?? {})
    },
    durationMs: flushResult?.durationMs
  } as Omit<TSnapshot, 'checkedAt'>
}

function defaultIndexedWriteFlushErrorStringifier(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
