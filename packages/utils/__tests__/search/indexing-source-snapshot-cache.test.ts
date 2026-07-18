import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedSourceSnapshotCacheService } from "../../search";

describe("IndexedSourceSnapshotCacheService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses snapshots inside the cache window", async () => {
    let now = 100;
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>({
      now: () => now,
    });
    const loadSnapshot = vi.fn(() => ({ value: 1 }));

    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 1,
    });
    now += 499;
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 1,
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("isolates cached snapshots from caller mutation", async () => {
    let now = 100;
    const service = new IndexedSourceSnapshotCacheService<{
      value: number;
      nested: { status: string };
    }>({ now: () => now });
    const input = { value: 1, nested: { status: "ready" } };
    const loadSnapshot = vi.fn(() => input);

    const first = await service.getSnapshot(loadSnapshot);
    input.value = 99;
    input.nested.status = "mutated-input";
    first.value = 100;
    first.nested.status = "mutated-return";

    now += 100;
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 1,
      nested: { status: "ready" },
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent snapshot loads", async () => {
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>();
    let resolveSnapshot!: (snapshot: { value: number }) => void;
    const loadSnapshot = vi.fn(
      () =>
        new Promise<{ value: number }>((resolve) => {
          resolveSnapshot = resolve;
        }),
    );

    const first = service.getSnapshot(loadSnapshot);
    const second = service.getSnapshot(loadSnapshot);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    resolveSnapshot({ value: 2 });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: 2 },
      { value: 2 },
    ]);
  });

  it("does not let cleared in-flight loads repopulate the cache", async () => {
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>();
    let resolveFirstSnapshot!: (snapshot: { value: number }) => void;
    const loadSnapshot = vi
      .fn<() => { value: number } | Promise<{ value: number }>>()
      .mockImplementationOnce(
        () =>
          new Promise<{ value: number }>((resolve) => {
            resolveFirstSnapshot = resolve;
          }),
      )
      .mockReturnValueOnce({ value: 2 });

    const first = service.getSnapshot(loadSnapshot);
    service.clear();
    resolveFirstSnapshot({ value: 1 });

    await expect(first).resolves.toEqual({ value: 1 });
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 2,
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed loads", async () => {
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>();
    const loadSnapshot = vi
      .fn<() => { value: number } | Promise<{ value: number }>>()
      .mockRejectedValueOnce(new Error("snapshot failed"))
      .mockReturnValueOnce({ value: 3 });

    await expect(service.getSnapshot(loadSnapshot)).rejects.toThrow(
      "snapshot failed",
    );
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 3,
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("refreshes snapshots after the cache window and supports clear", async () => {
    let now = 100;
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>({
      now: () => now,
    });
    const loadSnapshot = vi
      .fn<() => { value: number }>()
      .mockReturnValueOnce({ value: 1 })
      .mockReturnValueOnce({ value: 2 })
      .mockReturnValueOnce({ value: 3 });

    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 1,
    });
    now += 501;
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 2,
    });
    service.clear();
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 3,
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(3);
  });

  it("isolates primed snapshots from caller mutation", () => {
    const service = new IndexedSourceSnapshotCacheService<{
      value: number;
      nested: { status: string };
    }>();
    const input = { value: 1, nested: { status: "ready" } };

    const primed = service.prime(input);
    input.value = 99;
    input.nested.status = "mutated-input";
    primed.value = 100;
    primed.nested.status = "mutated-return";

    return expect(
      service.getSnapshot(() => ({ value: 2, nested: { status: "stale" } })),
    ).resolves.toEqual({
      value: 1,
      nested: { status: "ready" },
    });
  });

  it("isolates nested cached snapshots when structuredClone is unavailable", async () => {
    vi.stubGlobal("structuredClone", undefined);
    let now = 100;
    const service = new IndexedSourceSnapshotCacheService<{
      value: number;
      nested: { status: string };
    }>({ now: () => now });
    const input = { value: 1, nested: { status: "ready" } };
    const loadSnapshot = vi.fn(() => input);

    const first = await service.getSnapshot(loadSnapshot);
    input.nested.status = "mutated-input";
    first.nested.status = "mutated-return";

    now += 100;
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({
      value: 1,
      nested: { status: "ready" },
    });
  });
});
