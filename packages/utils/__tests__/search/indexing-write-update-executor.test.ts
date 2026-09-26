import { describe, expect, it, vi } from "vitest";
import { IndexedWriteUpdateExecutorService } from "../../search";

interface TestUpdateRecord {
  id: number;
  value: string;
}

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe("indexing-write-update-executor-service", () => {
  it("updates every record and dispatches one side effect per chunk", async () => {
    const updates: TestUpdateRecord[] = [
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: 3, value: "c" },
    ];
    const updateOne = vi.fn(async () => {});
    const dispatchUpdated = vi.fn();
    const runQueue = vi.fn(async (chunks, handler) => {
      for (const chunk of chunks) {
        await handler(chunk);
      }
    });
    let now = 0;
    const service = new IndexedWriteUpdateExecutorService<
      TestUpdateRecord,
      TestUpdateRecord
    >({
      waitBeforeChunk: vi.fn(async () => {}),
      updateOne,
      refreshUpdated: async (chunk) =>
        chunk.map((record) => ({
          ...record,
          value: record.value.toUpperCase(),
        })),
      dispatchUpdated,
      runQueue,
      now: () => {
        now += 5;
        return now;
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn(),
      logInterval: 2,
      label: "test-update-executor",
    });

    await expect(service.execute(updates, 2)).resolves.toEqual([
      { id: 1, value: "A" },
      { id: 2, value: "B" },
      { id: 3, value: "C" },
    ]);
    expect(updateOne).toHaveBeenCalledTimes(3);
    expect(dispatchUpdated).toHaveBeenCalledTimes(2);
  });

  it("waits for the updated-side-effect dispatch before resolving", async () => {
    const updates: TestUpdateRecord[] = [{ id: 1, value: "a" }];
    const dispatchGate = Promise.withResolvers<void>();
    const service = new IndexedWriteUpdateExecutorService<
      TestUpdateRecord,
      TestUpdateRecord
    >({
      waitBeforeChunk: vi.fn(async () => {}),
      updateOne: vi.fn(async () => {}),
      refreshUpdated: async (chunk) => chunk,
      dispatchUpdated: async () => {
        await dispatchGate.promise;
      },
      runQueue: async (chunks, handler) => {
        for (const chunk of chunks) {
          await handler(chunk);
        }
      },
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn(),
    });

    let settled = false;
    const execution = service.execute(updates, 1).then((value) => {
      settled = true;
      return value;
    });
    await settleMicrotasks();
    expect(settled).toBe(false);

    dispatchGate.resolve(undefined);
    await expect(execution).resolves.toEqual(updates);
  });

  it("uses a chunk writer once per chunk before refresh and side effects", async () => {
    const updates: TestUpdateRecord[] = [
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: 3, value: "c" },
    ];
    const order: string[] = [];
    const updateChunk = vi.fn(async (chunk: TestUpdateRecord[]) => {
      order.push(`update:${chunk.map((record) => record.id).join(",")}`);
    });
    const runQueue = vi.fn(async (chunks, handler) => {
      for (const chunk of chunks) await handler(chunk);
    });
    const service = new IndexedWriteUpdateExecutorService<
      TestUpdateRecord,
      TestUpdateRecord
    >({
      waitBeforeChunk: vi.fn(async () => {}),
      updateChunk,
      refreshUpdated: async (chunk) => {
        order.push(`refresh:${chunk.map((record) => record.id).join(",")}`);
        return chunk;
      },
      dispatchUpdated: (chunk) => {
        order.push(`dispatch:${chunk.map((record) => record.id).join(",")}`);
      },
      runQueue,
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn(),
    });

    await expect(service.execute(updates, 2)).resolves.toEqual(updates);
    expect(updateChunk).toHaveBeenCalledTimes(2);
    expect(order).toEqual([
      "update:1,2",
      "refresh:1,2",
      "dispatch:1,2",
      "update:3",
      "refresh:3",
      "dispatch:3",
    ]);
  });

  it("returns empty result without running queue for empty input", async () => {
    const runQueue = vi.fn();
    const service = new IndexedWriteUpdateExecutorService<
      TestUpdateRecord,
      TestUpdateRecord
    >({
      waitBeforeChunk: vi.fn(),
      updateOne: vi.fn(),
      refreshUpdated: vi.fn(),
      dispatchUpdated: vi.fn(),
      runQueue,
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn(),
    });

    await expect(service.execute([])).resolves.toEqual([]);
    expect(runQueue).not.toHaveBeenCalled();
  });
});
