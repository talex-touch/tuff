export interface IndexedWorkerSchedulerConfig {
  chunkSize?: number;
  deferredDelayMs?: number;
}

export interface IndexedWorkerSchedulerDeps<TPayload> {
  getWorkerContext: () => string | null;
  dispatch: (context: string, payload: TPayload[]) => Promise<unknown>;
  logWarn: (
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>,
  ) => void;
  config?: IndexedWorkerSchedulerConfig;
}

export interface IndexedWorkerScheduleBatch<TPayload> {
  payload: TPayload[];
  reason: string;
  deferred?: boolean;
  scopeId?: string;
}

interface IndexedWorkerDispatchFailure {
  scopeId?: string;
  error: unknown;
}

interface IndexedWorkerIdleWaiter {
  scopeId?: string;
  resolve: () => void;
}

export class IndexedWorkerSchedulerService<TPayload> {
  private readonly chunkSize: number;
  private readonly deferredDelayMs: number;
  private readonly timers = new Map<ReturnType<typeof setTimeout>, string | undefined>();
  private readonly activeDispatches = new Map<Promise<void>, string | undefined>();
  private readonly dispatchFailures: IndexedWorkerDispatchFailure[] = [];
  private readonly cancelledScopes = new Set<string>();
  private readonly idleWaiters = new Set<IndexedWorkerIdleWaiter>();
  private closed = false;

  constructor(private readonly deps: IndexedWorkerSchedulerDeps<TPayload>) {
    this.chunkSize = deps.config?.chunkSize ?? 30;
    this.deferredDelayMs = deps.config?.deferredDelayMs ?? 5_000;
  }

  schedule(batch: IndexedWorkerScheduleBatch<TPayload>): void {
    if (
      this.closed ||
      batch.payload.length === 0 ||
      (batch.scopeId !== undefined && this.cancelledScopes.has(batch.scopeId)) ||
      !this.deps.getWorkerContext()
    ) {
      return;
    }

    if (batch.deferred) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.scheduleChunks(batch.payload, batch.reason, batch.scopeId);
        this.resolveIdleWaiters();
      }, this.deferredDelayMs);
      this.timers.set(timer, batch.scopeId);
      return;
    }

    this.scheduleChunks(batch.payload, batch.reason, batch.scopeId);
  }

  hasPendingWork(scopeId?: string): boolean {
    return (
      this.hasScheduledWork(scopeId) ||
      this.dispatchFailures.some((failure) => this.matchesScope(failure.scopeId, scopeId))
    );
  }

  async drain(timeoutMs = 15_000, scopeId?: string): Promise<void> {
    if (this.hasScheduledWork(scopeId)) {
      await new Promise<void>((resolve, reject) => {
        const waiter: IndexedWorkerIdleWaiter = {
          scopeId,
          resolve: () => {
            clearTimeout(timeout);
            this.idleWaiters.delete(waiter);
            resolve();
          },
        };
        const timeout = setTimeout(() => {
          this.idleWaiters.delete(waiter);
          reject(new Error("INDEXED_WORKER_SCHEDULER_DRAIN_TIMEOUT"));
        }, timeoutMs);
        this.idleWaiters.add(waiter);
      });
    }

    const failures = this.dispatchFailures.filter((failure) =>
      this.matchesScope(failure.scopeId, scopeId),
    );
    if (failures.length === 0) return;
    for (let index = this.dispatchFailures.length - 1; index >= 0; index -= 1) {
      const failure = this.dispatchFailures[index];
      if (failure && this.matchesScope(failure.scopeId, scopeId)) {
        this.dispatchFailures.splice(index, 1);
      }
    }
    throw new AggregateError(
      failures.map((failure) => failure.error),
      "INDEXED_WORKER_SCHEDULER_DISPATCH_FAILED",
    );
  }

  cancelScope(scopeId: string): void {
    this.cancelledScopes.add(scopeId);
    this.cancelPending(scopeId);
  }

  cancelPending(scopeId?: string): void {
    for (const [timer, timerScopeId] of this.timers) {
      if (!this.matchesScope(timerScopeId, scopeId)) continue;
      clearTimeout(timer);
      this.timers.delete(timer);
    }
    for (let index = this.dispatchFailures.length - 1; index >= 0; index -= 1) {
      const failure = this.dispatchFailures[index];
      if (failure && this.matchesScope(failure.scopeId, scopeId)) {
        this.dispatchFailures.splice(index, 1);
      }
    }
    this.resolveIdleWaiters();
  }

  close(): void {
    this.closed = true;
    this.cancelPending();
  }

  private scheduleChunks(payload: TPayload[], reason: string, scopeId?: string): void {
    const context = this.deps.getWorkerContext();
    if (this.closed || !context || payload.length === 0) {
      return;
    }

    for (let i = 0; i < payload.length; i += this.chunkSize) {
      const chunk = payload.slice(i, i + this.chunkSize);
      const dispatch = Promise.resolve()
        .then(async () => {
          if (scopeId !== undefined && this.cancelledScopes.has(scopeId)) return
          await this.deps.dispatch(context, chunk)
        })
        .then(() => undefined)
        .catch((error) => {
          if (scopeId !== undefined && this.cancelledScopes.has(scopeId)) return;
          this.dispatchFailures.push({ scopeId, error });
          this.deps.logWarn("Index worker failed", error, {
            reason,
            size: chunk.length,
            ...(scopeId ? { scopeId } : {}),
          });
        })
        .finally(() => {
          this.activeDispatches.delete(dispatch);
          this.resolveIdleWaiters();
        });
      this.activeDispatches.set(dispatch, scopeId);
    }
  }
  private resolveIdleWaiters(): void {
    for (const waiter of this.idleWaiters) {
      if (!this.hasScheduledWork(waiter.scopeId)) waiter.resolve();
    }
  }

  private hasScheduledWork(scopeId?: string): boolean {
    for (const timerScopeId of this.timers.values()) {
      if (this.matchesScope(timerScopeId, scopeId)) return true;
    }
    for (const dispatchScopeId of this.activeDispatches.values()) {
      if (this.matchesScope(dispatchScopeId, scopeId)) return true;
    }
    return false;
  }

  private matchesScope(candidate: string | undefined, scopeId: string | undefined): boolean {
    return scopeId === undefined || candidate === scopeId;
  }

}
