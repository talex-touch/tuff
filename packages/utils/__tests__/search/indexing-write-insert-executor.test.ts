import { describe, expect, it, vi } from "vitest";
import { IndexedWriteInsertExecutorService } from "../../search";

interface TestInsertRecord {
  path: string;
}

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe("indexing-write-insert-executor-service", () => {
  it("resolves only after the inserted side effect settles", async () => {
    const records: TestInsertRecord[] = [
      { path: "/tmp/a.txt" },
      { path: "/tmp/b.txt" },
    ];
    const inserted = records.map((record, index) => ({
      ...record,
      id: index + 1,
    }));
    const persist = vi.fn(async () => inserted);
    const dispatchGate = Promise.withResolvers<void>();
    const dispatchInserted = vi.fn(async () => {
      await dispatchGate.promise;
    });
    const logDebug = vi.fn();
    const service = new IndexedWriteInsertExecutorService({
      persist,
      dispatchInserted,
      logDebug,
      successMessage: "test insert completed",
    });

    let settled = false;
    const execution = service.execute(records).then((value) => {
      settled = true;
      return value;
    });
    await settleMicrotasks();

    // The insert must not be reported complete while its side effect is outstanding.
    expect(settled).toBe(false);

    dispatchGate.resolve(undefined);
    await expect(execution).resolves.toEqual(inserted);
    expect(logDebug).toHaveBeenCalledWith("test insert completed", {
      inserted: 2,
    });
  });

  it("returns empty result without persisting empty input", async () => {
    const persist = vi.fn();
    const dispatchInserted = vi.fn();
    const service = new IndexedWriteInsertExecutorService<
      TestInsertRecord,
      TestInsertRecord
    >({
      persist,
      dispatchInserted,
      logDebug: vi.fn(),
    });

    await expect(service.execute([])).resolves.toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    expect(dispatchInserted).not.toHaveBeenCalled();
  });
});
