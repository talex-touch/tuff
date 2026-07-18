import { describe, expect, it, vi } from "vitest";
import { IndexedWriteUpdateExecutorService } from "../../search";

interface TestUpdateRecord {
  id: number;
  value: string;
}

describe("indexing-write-update-executor-service", () => {
  it("updates records in chunks, refreshes updated rows, and dispatches side effects", async () => {
    const updates: TestUpdateRecord[] = [
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: 3, value: "c" },
    ];
    const updateOne = vi.fn(async () => {});
    const dispatchUpdated = vi.fn();
    const waitBeforeChunk = vi.fn(async () => {});
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
      waitBeforeChunk,
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

    const result = await service.execute(updates, 2);

    expect(runQueue).toHaveBeenCalledWith(
      [[updates[0], updates[1]], [updates[2]]],
      expect.any(Function),
      {
        estimatedTaskTimeMs: 20,
        label: "test-update-executor",
      },
    );
    expect(waitBeforeChunk).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenCalledTimes(3);
    expect(dispatchUpdated).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { id: 1, value: "A" },
      { id: 2, value: "B" },
      { id: 3, value: "C" },
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
