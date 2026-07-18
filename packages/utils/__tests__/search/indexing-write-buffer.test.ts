import { describe, expect, it } from "vitest";
import {
  IndexedEntryKeyedWriteBufferService,
  IndexedWriteBufferService,
} from "../../search";

describe("indexing-write-buffer-service", () => {
  it("tracks pending and inflight entries across enqueue, take, commit, and rollback", () => {
    const pending = new Map<number, string>();
    const inflight = new Map<number, string>();
    const buffer = new IndexedWriteBufferService(pending, inflight);

    expect(buffer.enqueue(1, "one")).toBe(1);
    expect(buffer.enqueue(2, "two")).toBe(2);
    expect(buffer.pendingSize).toBe(2);
    expect(buffer.inflightSize).toBe(0);

    const batch = buffer.take(1);
    expect(batch).toEqual({ entries: ["one"], keys: [1] });
    expect(buffer.pendingSize).toBe(1);
    expect(buffer.inflightSize).toBe(1);

    buffer.rollback(batch.keys);
    expect(buffer.pendingSize).toBe(2);
    expect(buffer.inflightSize).toBe(0);

    const retryBatch = buffer.take(2);
    expect(retryBatch.entries).toEqual(["two", "one"]);
    buffer.commit(retryBatch.keys);
    expect(buffer.pendingSize).toBe(0);
    expect(buffer.inflightSize).toBe(0);
  });

  it("keeps newer pending entry when rollback sees the same key already pending", () => {
    const pending = new Map<number, string>([[1, "old"]]);
    const inflight = new Map<number, string>();
    const buffer = new IndexedWriteBufferService(pending, inflight);

    const batch = buffer.take(1);
    expect(batch).toEqual({ entries: ["old"], keys: [1] });

    buffer.enqueue(1, "new");
    buffer.rollback(batch.keys);

    expect(pending.get(1)).toBe("new");
    expect(buffer.pendingSize).toBe(1);
    expect(buffer.inflightSize).toBe(0);
  });

  it("supports entry-keyed enqueue for worker payload buffers", () => {
    const pending = new Map<number, { id: number; value: string }>();
    const inflight = new Map<number, { id: number; value: string }>();
    const buffer = new IndexedEntryKeyedWriteBufferService(
      pending,
      inflight,
      (entry) => entry.id,
    );

    expect(buffer.enqueue({ id: 1, value: "one" })).toBe(1);
    expect(buffer.enqueue({ id: 1, value: "newer-one" })).toBe(1);
    expect(buffer.enqueue({ id: 2, value: "two" })).toBe(2);

    const batch = buffer.take(2);
    expect(batch.keys).toEqual([1, 2]);
    expect(batch.entries.map((entry) => entry.value)).toEqual([
      "newer-one",
      "two",
    ]);

    buffer.rollback([1]);
    expect(pending.get(1)?.value).toBe("newer-one");
    expect(inflight.has(2)).toBe(true);

    buffer.commit([2]);
    expect(buffer.pendingSize).toBe(1);
    expect(buffer.inflightSize).toBe(0);
  });
});
