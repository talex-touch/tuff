import { describe, expect, it, vi } from "vitest";
import { IndexedWriteSideEffectService } from "../../search";

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe("indexing-write-side-effect-service", () => {
  it("skips empty record batches", async () => {
    const processExtensions = vi.fn(async () => undefined);
    const scheduleIndexing = vi.fn();
    const logWarn = vi.fn();
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    });

    await service.dispatch([], {
      extensionContext: "incremental",
      indexReason: "incremental-insert",
    });

    expect(processExtensions).not.toHaveBeenCalled();
    expect(scheduleIndexing).not.toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("awaits indexing scheduling before running extension processing", async () => {
    const records = [{ id: 1, path: "/tmp/a.txt" }];
    const order: string[] = [];
    const scheduleGate = Promise.withResolvers<void>();
    const scheduleIndexing = vi.fn(async () => {
      order.push("schedule-indexing");
      await scheduleGate.promise;
    });
    const processExtensions = vi.fn(async () => {
      order.push("process-extensions");
    });
    const logWarn = vi.fn();
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
    });

    let settled = false;
    const dispatch = service
      .dispatch(records, {
        extensionContext: "file-update",
        indexReason: "file-update",
        mutationLeaseId: "lease-1",
      })
      .then(() => {
        settled = true;
      });
    await settleMicrotasks();

    // The side effect must be waited on, not fired-and-forgotten.
    expect(order).toEqual(["schedule-indexing"]);
    expect(settled).toBe(false);

    scheduleGate.resolve(undefined);
    await dispatch;

    expect(order).toEqual(["schedule-indexing", "process-extensions"]);
  });

  it("logs an extension processing failure without rejecting the dispatch", async () => {
    const records = [{ id: 1, path: "/tmp/a.txt" }];
    const error = new Error("extension failed");
    const processExtensions = vi.fn(async () => {
      throw error;
    });
    const scheduleIndexing = vi.fn();
    const logWarn = vi.fn();
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
      formatExtensionFailureMessage: (context) =>
        `processFileExtensions failed (${context})`,
    });

    await expect(
      service.dispatch(records, {
        extensionContext: "reconciliation",
        indexReason: "reconciliation-insert",
      }),
    ).resolves.toBeUndefined();

    expect(logWarn).toHaveBeenCalledWith(
      "processFileExtensions failed (reconciliation)",
      error,
    );
  });
});
