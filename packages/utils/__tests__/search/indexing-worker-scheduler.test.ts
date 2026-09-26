import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { IndexedWorkerSchedulerService } from "../../search";

interface ServiceHarness {
  dispatch: Mock;
  logWarn: Mock;
  service: IndexedWorkerSchedulerService<number>;
}

function createService(
  options: {
    context?: string | null;
    config?: { chunkSize?: number; maxInFlight?: number; maxPendingBatches?: number };
  } = {},
): ServiceHarness {
  const context = Object.prototype.hasOwnProperty.call(options, "context")
    ? options.context
    : "worker-context";
  const dispatch = vi.fn(async () => undefined);
  const logWarn = vi.fn();
  const service = new IndexedWorkerSchedulerService<number>({
    getWorkerContext: () => context ?? null,
    dispatch,
    logWarn,
    config: {
      chunkSize: 2,
      maxInFlight: 1,
      maxPendingBatches: 2,
      ...options.config,
    },
  });

  return { dispatch, logWarn, service };
}

/** Flushes chained microtasks so an admitted dispatch has actually been invoked. */
async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve();
  }
}

interface GatedDispatch {
  dispatch: (context: string, payload: number[]) => Promise<unknown>;
  release: (key: number) => void;
  calls: number[][];
}

/**
 * A consumer that parks every chunk until released, keyed by the chunk's first payload value.
 * Mirrors a stalled persistence path with no wall-clock dependency.
 */
function createGatedDispatch(): GatedDispatch {
  const gates = new Map<number, () => void>();
  const calls: number[][] = [];
  return {
    calls,
    dispatch: async (_context: string, payload: number[]) => {
      calls.push([...payload]);
      await new Promise<void>((resolve) => {
        gates.set(payload[0]!, resolve);
      });
    },
    release: (key: number) => {
      const release = gates.get(key);
      if (!release) throw new Error(`no parked dispatch for ${key}`);
      release();
    },
  };
}

describe("indexing-worker-scheduler-service", () => {
  it("bounds admission at the configured batch ceiling while the consumer is stalled", async () => {
    const gate = Promise.withResolvers<void>();
    const dispatch = vi.fn(async (_context: string, payload: number[]) => {
      if (payload[0] === 0) await gate.promise;
    });
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch,
      logWarn: vi.fn(),
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 2 },
    });

    let accepted = 0;
    let deferred = 0;
    for (let index = 0; index < 100; index += 1) {
      const result = service.schedule({ payload: [index], reason: "burst" });
      accepted += result.accepted;
      deferred += result.deferred;
    }
    await settleMicrotasks();

    // The 100-batch OOM shape admitted every scheduled batch while nothing completed. Only the
    // bounded window may reach the worker.
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("worker-context", [0]);

    const snapshot = service.getSnapshot();
    expect(snapshot.activeBatches).toBe(1);
    expect(snapshot.activeBatches + snapshot.queuedBatches).toBe(2);
    expect(snapshot.pendingRecords).toBe(1);
    expect(accepted).toBe(2);
    expect(deferred).toBe(98);
    expect(snapshot.deferredRecords).toBe(98);

    gate.resolve();
    await service.drain(1_000);

    // Deferred overflow is not retained by the scheduler, so only admitted batches dispatch.
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map((call) => call[1][0])).toEqual([0, 1]);
    expect(service.getSnapshot()).toMatchObject({
      activeBatches: 0,
      queuedBatches: 0,
      pendingRecords: 0,
    });
  });

  it("releases retained batches in FIFO order as the active batch completes", async () => {
    const gated = createGatedDispatch();
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch: gated.dispatch,
      logWarn: vi.fn(),
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 3 },
    });

    for (let index = 0; index < 10; index += 1) {
      service.schedule({ payload: [index], reason: "fifo" });
    }
    await settleMicrotasks();

    expect(gated.calls.map((call) => call[0])).toEqual([0]);
    expect(service.getSnapshot()).toMatchObject({
      activeBatches: 1,
      queuedBatches: 2,
      pendingRecords: 2,
    });

    gated.release(0);
    await settleMicrotasks();
    expect(gated.calls.map((call) => call[0])).toEqual([0, 1]);

    gated.release(1);
    await settleMicrotasks();
    expect(gated.calls.map((call) => call[0])).toEqual([0, 1, 2]);

    gated.release(2);
    await service.drain(1_000);
    expect(gated.calls.map((call) => call[0])).toEqual([0, 1, 2]);
  });

  it("reports deferred totals cumulatively without presenting them as current backlog", async () => {
    const gate = Promise.withResolvers<void>();
    const dispatch = vi.fn(async (_context: string, payload: number[]) => {
      if (payload[0] === 0) await gate.promise;
    });
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch,
      logWarn: vi.fn(),
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 2 },
    });

    for (let index = 0; index < 5; index += 1) {
      service.schedule({ payload: [index], reason: "cumulative" });
    }
    await settleMicrotasks();

    expect(service.getSnapshot()).toMatchObject({
      activeBatches: 1,
      queuedBatches: 1,
      pendingRecords: 1,
      deferredRecords: 3,
    });

    gate.resolve();
    await service.drain(1_000);

    // Backlog counters drain to zero; the cumulative deferred counter intentionally does not.
    expect(service.getSnapshot()).toMatchObject({
      activeBatches: 0,
      queuedBatches: 0,
      pendingRecords: 0,
      deferredRecords: 3,
    });
  });

  it("holds the global bound even when a burst arrives under distinct scopes", async () => {
    const gate = Promise.withResolvers<void>();
    const dispatch = vi.fn(async (_context: string, payload: number[]) => {
      if (payload[0] === 0) await gate.promise;
    });
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch,
      logWarn: vi.fn(),
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 2 },
    });

    for (let index = 0; index < 50; index += 1) {
      service.schedule({ payload: [index], reason: "scoped", scopeId: `lease-${index}` });
    }
    await settleMicrotasks();

    expect(dispatch).toHaveBeenCalledTimes(1);

    gate.resolve();
    await service.drain(1_000);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("does not launch queued work for a cancelled scope", async () => {
    const gated = createGatedDispatch();
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch: gated.dispatch,
      logWarn: vi.fn(),
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 2 },
    });

    service.schedule({ payload: [0], reason: "active", scopeId: "lease-a" });
    service.schedule({ payload: [1], reason: "queued", scopeId: "lease-a" });
    service.schedule({ payload: [2], reason: "overflow", scopeId: "lease-a" });
    await settleMicrotasks();
    expect(gated.calls.map((call) => call[0])).toEqual([0]);

    service.cancelScope("lease-a");
    gated.release(0);
    await settleMicrotasks();

    // The queued batch belonged to a cancelled scope and must never reach the worker.
    expect(gated.calls.map((call) => call[0])).toEqual([0]);
    expect(service.hasPendingWork("lease-a")).toBe(false);
    await expect(service.drain(1_000, "lease-a")).resolves.toBeUndefined();
  });

  it("stops launching accepted-but-queued work once closed", async () => {
    const gated = createGatedDispatch();
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch: gated.dispatch,
      logWarn: vi.fn(),
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 2 },
    });

    service.schedule({ payload: [0], reason: "active" });
    service.schedule({ payload: [1], reason: "queued" });
    await settleMicrotasks();
    expect(gated.calls.map((call) => call[0])).toEqual([0]);

    service.close();
    gated.release(0);
    await settleMicrotasks();

    expect(gated.calls.map((call) => call[0])).toEqual([0]);
    expect(service.getSnapshot()).toMatchObject({
      activeBatches: 0,
      queuedBatches: 0,
      pendingRecords: 0,
    });
  });

  it("settles a failed batch, advances the queue, and leaves no retained backlog", async () => {
    const failure = new Error("worker failed");
    const dispatch = vi.fn(async (_context: string, payload: number[]) => {
      if (payload[0] === 0) throw failure;
    });
    const logWarn = vi.fn();
    const service = new IndexedWorkerSchedulerService<number>({
      getWorkerContext: () => "worker-context",
      dispatch,
      logWarn,
      config: { chunkSize: 1, maxInFlight: 1, maxPendingBatches: 2 },
    });

    service.schedule({ payload: [0], reason: "burst" });
    service.schedule({ payload: [1], reason: "burst" });
    service.schedule({ payload: [2], reason: "burst" });

    await expect(service.drain(1_000)).rejects.toMatchObject({ errors: [failure] });
    expect(logWarn).toHaveBeenCalledWith("Index worker failed", failure, {
      reason: "burst",
      size: 1,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(service.getSnapshot()).toMatchObject({
      activeBatches: 0,
      queuedBatches: 0,
      pendingRecords: 0,
    });

    // A failed batch must not poison admission for later work.
    expect(service.schedule({ payload: [9], reason: "after" })).toEqual({
      accepted: 1,
      deferred: 0,
    });
    await service.drain(1_000);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it("chunks immediate payloads at the configured chunk size after drain", async () => {
    const { dispatch, service } = createService();

    expect(service.schedule({ payload: [1, 2, 3], reason: "immediate" })).toEqual({
      accepted: 3,
      deferred: 0,
    });
    await service.drain();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, "worker-context", [1, 2]);
    expect(dispatch).toHaveBeenNthCalledWith(2, "worker-context", [3]);
  });

  it("reports records as deferred instead of accepted when the worker context is unavailable", () => {
    const { dispatch, service } = createService({ context: null });

    expect(service.schedule({ payload: [1, 2, 3], reason: "test" })).toEqual({
      accepted: 0,
      deferred: 3,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(service.hasPendingWork()).toBe(false);
  });

  it.each([
    ["closed", (service: IndexedWorkerSchedulerService<number>) => service.close()],
    [
      "cancelled",
      (service: IndexedWorkerSchedulerService<number>) => service.cancelScope("lease-a"),
    ],
  ])("admits nothing and never dispatches for a %s scheduler", async (label, prepare) => {
    const { dispatch, service } = createService();
    prepare(service);

    const scope = label === "cancelled" ? { scopeId: "lease-a" } : {};
    expect(service.schedule({ payload: [1, 2], reason: "test", ...scope })).toEqual({
      accepted: 0,
      deferred: 0,
    });

    await settleMicrotasks();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("admits nothing for an empty payload", () => {
    const { dispatch, service } = createService();

    expect(service.schedule({ payload: [], reason: "empty" })).toEqual({
      accepted: 0,
      deferred: 0,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ["before", true],
    ["after", false],
  ])(
    "keeps a failed scope's dispatch failure when the healthy scope drains %s it",
    async (_healthyDrainOrder, drainHealthyFirst) => {
      const failure = new Error("failed scope dispatch");
      const { dispatch, service } = createService();
      dispatch.mockRejectedValueOnce(failure);

      service.schedule({
        payload: [1],
        reason: "failed",
        scopeId: "failed-scope",
      });
      service.schedule({
        payload: [2],
        reason: "healthy",
        scopeId: "healthy-scope",
      });

      const healthyDrain = service.drain(100, "healthy-scope");
      const failedDrain = service.drain(100, "failed-scope");

      if (drainHealthyFirst) {
        await expect(healthyDrain).resolves.toBeUndefined();
        await expect(failedDrain).rejects.toBeInstanceOf(AggregateError);
      } else {
        await expect(failedDrain).rejects.toBeInstanceOf(AggregateError);
        await expect(healthyDrain).resolves.toBeUndefined();
      }

      await expect(failedDrain).rejects.toMatchObject({ errors: [failure] });
      expect(dispatch).toHaveBeenCalledWith("worker-context", [2]);
    },
  );
});
