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
