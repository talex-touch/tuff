export type IndexingWatchDeltaAction = "add" | "change" | "delete";

export interface IndexingWatchDeltaBasePayload<
  TAction extends string = IndexingWatchDeltaAction,
> {
  action: TAction;
  rawPath: string;
}

export type IndexingWatchDeltaEntry<
  TPayload extends IndexingWatchDeltaBasePayload,
> = [string, TPayload];

export interface IndexingWatchDeltaCoalesceInput<
  TPayload extends IndexingWatchDeltaBasePayload,
> {
  key: string;
  previous: TPayload | undefined;
  next: TPayload;
}

export interface IndexingWatchDeltaQueueServiceDeps<
  TPayload extends IndexingWatchDeltaBasePayload,
> {
  normalizeKey: (rawPath: string) => string;
  shouldAccept: (rawPath: string) => boolean;
  prepareFlush: () => Promise<boolean>;
  processEntries: (
    entries: IndexingWatchDeltaEntry<TPayload>[],
  ) => Promise<void>;
  logError: (
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>,
  ) => void;
  coalesce?: (input: IndexingWatchDeltaCoalesceInput<TPayload>) => TPayload;
  /**
   * Trailing-edge window that merges the burst of watcher events a single filesystem change
   * produces (an app install emits ~16) into one flush. Omit or set to 0 to keep the historic
   * behaviour, where the queue only serializes and coalesces whatever arrives while a flush is
   * already in flight. At most one timer exists at a time and it is released when the window
   * closes, so an idle queue holds none.
   */
  debounceMs?: number;
}

export function coalesceIndexingWatchDelta<
  TPayload extends IndexingWatchDeltaBasePayload,
>(previous: TPayload | undefined, next: TPayload): TPayload {
  if (next.action === "delete") {
    return next;
  }

  if (previous?.action === "delete") {
    return previous;
  }

  if (!previous) {
    return next;
  }

  const nextAction = previous.action === "add" ? previous.action : next.action;
  const nextRawPath = next.action === "add" ? next.rawPath : previous.rawPath;
  return {
    ...previous,
    ...next,
    action: nextAction,
    rawPath: nextRawPath,
  };
}

export class IndexingWatchDeltaQueueService<
  TPayload extends IndexingWatchDeltaBasePayload,
> {
  private taskChain: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, TPayload>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deps: IndexingWatchDeltaQueueServiceDeps<TPayload>,
  ) {}

  getPendingSize(): number {
    return this.pending.size;
  }

  hasPendingWindow(): boolean {
    return this.debounceTimer !== null;
  }

  /** Drops any open coalescing window; pending entries stay queued for the next flush. */
  dispose(): void {
    this.clearDebounceWindow();
  }

  enqueue(
    rawPath: string,
    action: TPayload["action"],
    metadata?: Omit<
      TPayload,
      keyof IndexingWatchDeltaBasePayload<TPayload["action"]>
    >,
  ): void {
    if (!this.deps.shouldAccept(rawPath)) {
      return;
    }

    const key = this.deps.normalizeKey(rawPath);
    const previous = this.pending.get(key);
    const next = {
      ...(metadata ?? {}),
      action,
      rawPath,
    } as TPayload;
    const coalesced = this.deps.coalesce
      ? this.deps.coalesce({ key, previous, next })
      : coalesceIndexingWatchDelta(previous, next);

    this.pending.set(key, coalesced);
    this.schedule();
  }

  /** Bypasses the coalescing window — callers use this to drain on demand. */
  flushSoon(): void {
    this.clearDebounceWindow();
    this.chainFlush();
  }

  private schedule(): void {
    if (this.pending.size === 0) {
      return;
    }

    const debounceMs = this.deps.debounceMs ?? 0;
    if (debounceMs <= 0) {
      this.chainFlush();
      return;
    }

    // Trailing edge: the first event of a burst opens the window and every later event lands in
    // the same pending map, so the whole burst costs one timer and one flush.
    if (this.debounceTimer !== null) {
      return;
    }
    const timer = setTimeout(() => {
      if (this.debounceTimer === timer) {
        this.debounceTimer = null;
      }
      this.chainFlush();
    }, debounceMs);
    timer.unref?.();
    this.debounceTimer = timer;
  }

  private chainFlush(): void {
    if (this.pending.size === 0) {
      return;
    }

    this.taskChain = this.taskChain
      .then(() => this.flush())
      .catch((error) => {
        this.deps.logError("Failed to process watch delta updates.", error);
      });
  }

  private clearDebounceWindow(): void {
    if (this.debounceTimer === null) {
      return;
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private async flush(): Promise<void> {
    if (this.pending.size === 0) {
      return;
    }

    if (!(await this.deps.prepareFlush())) {
      return;
    }

    const entries = Array.from(this.pending.entries());
    await this.deps.processEntries(entries);
    this.deleteProcessedEntries(entries);
  }

  private deleteProcessedEntries(
    entries: IndexingWatchDeltaEntry<TPayload>[],
  ): void {
    for (const [key, payload] of entries) {
      if (this.pending.get(key) === payload) {
        this.pending.delete(key);
      }
    }
  }
}
