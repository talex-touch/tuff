import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexedWorkerSchedulerService } from "../../search";

function createService(options: { context?: string | null } = {}) {
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
      deferredDelayMs: 20,
    },
  });

  return {
    dispatch,
    logWarn,
    service,
  };
}

describe("indexing-worker-scheduler-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips scheduling when context is unavailable", () => {
    const { dispatch, service } = createService({ context: null });

    service.schedule({ payload: [1], reason: "test" });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("chunks immediate payloads after scheduler drain", async () => {
    const { dispatch, service } = createService();

    service.schedule({ payload: [1, 2, 3], reason: "immediate" });
    await service.drain();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, "worker-context", [1, 2]);
    expect(dispatch).toHaveBeenNthCalledWith(2, "worker-context", [3]);
  });

  it("defers scheduled payloads", async () => {
    const { dispatch, service } = createService();

    service.schedule({ payload: [1], reason: "background", deferred: true });

    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);

    expect(dispatch).toHaveBeenCalledWith("worker-context", [1]);
  });

  it("reports worker failures through drain after logging", async () => {
    const error = new Error("worker failed");
    const { dispatch, logWarn, service } = createService();
    dispatch.mockRejectedValueOnce(error);

    service.schedule({ payload: [1], reason: "test" });
    await expect(service.drain()).rejects.toMatchObject({ errors: [error] });

    expect(logWarn).toHaveBeenCalledWith("Index worker failed", error, {
      reason: "test",
      size: 1,
    });
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

  it("cancels only its scope's deferred work", async () => {
    const { dispatch, service } = createService();

    service.schedule({
      payload: [1],
      reason: "cancelled",
      scopeId: "cancelled-scope",
      deferred: true,
    });
    service.schedule({
      payload: [2],
      reason: "healthy",
      scopeId: "healthy-scope",
      deferred: true,
    });
    service.cancelPending("cancelled-scope");

    await vi.advanceTimersByTimeAsync(20);
    await service.drain(100, "healthy-scope");

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("worker-context", [2]);
  });
});
