export interface IndexedWriteBufferBatch<TKey, TEntry> {
  entries: TEntry[]
  keys: TKey[]
}

export interface IndexedWriteFlushBuffer<TKey, TEntry> {
  readonly pendingSize: number
  readonly inflightSize: number
  take: (maxEntries: number) => IndexedWriteBufferBatch<TKey, TEntry>
  commit: (keys: TKey[]) => void
  rollback: (keys: TKey[]) => void
}

export interface IndexedWriteBuffer<TKey, TEntry> extends IndexedWriteFlushBuffer<TKey, TEntry> {
  enqueue: (key: TKey, entry: TEntry) => number
}

export class IndexedWriteBufferService<TKey, TEntry> implements IndexedWriteBuffer<TKey, TEntry> {
  constructor(
    private readonly pending: Map<TKey, TEntry>,
    private readonly inflight: Map<TKey, TEntry>
  ) {}

  get pendingSize(): number {
    return this.pending.size
  }

  get inflightSize(): number {
    return this.inflight.size
  }

  enqueue(key: TKey, entry: TEntry): number {
    this.pending.set(key, entry)
    return this.pending.size
  }

  take(maxEntries: number): IndexedWriteBufferBatch<TKey, TEntry> {
    const entries: TEntry[] = []
    const keys: TKey[] = []

    for (const [key, entry] of this.pending) {
      entries.push(entry)
      keys.push(key)
      this.pending.delete(key)
      this.inflight.set(key, entry)
      if (entries.length >= maxEntries) {
        break
      }
    }

    return { entries, keys }
  }

  commit(keys: TKey[]): void {
    for (const key of keys) {
      this.inflight.delete(key)
    }
  }

  rollback(keys: TKey[]): void {
    for (const key of keys) {
      const inflightEntry = this.inflight.get(key)
      if (!inflightEntry) {
        continue
      }
      if (!this.pending.has(key)) {
        this.pending.set(key, inflightEntry)
      }
      this.inflight.delete(key)
    }
  }
}
