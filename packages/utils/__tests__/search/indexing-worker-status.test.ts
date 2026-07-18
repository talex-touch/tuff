import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IndexedWorkerStatusSnapshotService,
  normalizeIndexedWorkerStatuses,
  summarizeIndexedWorkerStatus,
  type IndexedWorkerState,
  type IndexedWorkerStatusLike,
} from "../../search";

interface TestWorker extends IndexedWorkerStatusLike {
  name: string;
  metrics?: {
    pending: number;
  };
}

function worker(name: string, state: IndexedWorkerState): TestWorker {
  return { name, state };
}

describe("IndexedWorkerStatusSnapshotService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("summarizes worker states", () => {
    expect(
      summarizeIndexedWorkerStatus([
        worker("scan", "idle"),
        worker("index", "busy"),
        worker("icon", "offline"),
        worker("thumbnail", "idle"),
      ]),
    ).toEqual({
      total: 4,
      busy: 1,
      idle: 2,
      offline: 1,
    });
  });

  it("normalizes malformed worker status payloads", () => {
    expect(
      normalizeIndexedWorkerStatuses<TestWorker>([
        worker("scan", "busy"),
        null,
        "bad-worker",
        { name: "index", state: "sleeping" },
      ]),
    ).toEqual([worker("scan", "busy"), worker("index", "offline")]);
  });

  it("treats malformed worker states as offline in summaries", () => {
    expect(
      summarizeIndexedWorkerStatus([
        worker("scan", "idle"),
        { name: "index", state: "sleeping" } as unknown as TestWorker,
      ]),
    ).toEqual({
      total: 2,
      busy: 0,
      idle: 1,
      offline: 1,
    });
  });

  it("reuses snapshots inside the cache window", async () => {
    let now = 100;
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({
      now: () => now,
    });
    const loadWorkers = vi.fn(async () => [worker("scan", "idle")]);

    await service.getSnapshot(loadWorkers);
    now += 999;
    await service.getSnapshot(loadWorkers);

    expect(loadWorkers).toHaveBeenCalledTimes(1);
  });

  it("isolates cached worker snapshots from caller mutation", async () => {
    let now = 100;
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({
      now: () => now,
    });
    const workers = [{ ...worker("scan", "idle"), metrics: { pending: 1 } }];
    const loadWorkers = vi.fn(async () => workers);

    const first = await service.getSnapshot(loadWorkers);
    workers[0]!.state = "busy";
    workers[0]!.metrics!.pending = 99;
    first.summary.total = 99;
    first.workers[0]!.state = "offline";
    first.workers[0]!.metrics!.pending = 100;

    now += 100;
    await expect(service.getSnapshot(loadWorkers)).resolves.toEqual({
      summary: { total: 1, busy: 0, idle: 1, offline: 0 },
      workers: [{ ...worker("scan", "idle"), metrics: { pending: 1 } }],
    });
    expect(loadWorkers).toHaveBeenCalledTimes(1);
  });

  it("isolates nested worker metrics when structuredClone is unavailable", async () => {
    vi.stubGlobal("structuredClone", undefined);
    let now = 100;
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({
      now: () => now,
    });
    const workers = [{ ...worker("scan", "idle"), metrics: { pending: 1 } }];
    const loadWorkers = vi.fn(async () => workers);

    const first = await service.getSnapshot(loadWorkers);
    workers[0]!.metrics!.pending = 99;
    first.workers[0]!.metrics!.pending = 100;

    now += 100;
    await expect(service.getSnapshot(loadWorkers)).resolves.toEqual({
      summary: { total: 1, busy: 0, idle: 1, offline: 0 },
      workers: [{ ...worker("scan", "idle"), metrics: { pending: 1 } }],
    });
  });

  it("deduplicates concurrent snapshot loads", async () => {
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>();
    let resolveWorkers!: (workers: TestWorker[]) => void;
    const loadWorkers = vi.fn(
      () =>
        new Promise<TestWorker[]>((resolve) => {
          resolveWorkers = resolve;
        }),
    );

    const first = service.getSnapshot(loadWorkers);
    const second = service.getSnapshot(loadWorkers);

    expect(loadWorkers).toHaveBeenCalledTimes(1);
    resolveWorkers([worker("scan", "busy")]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        summary: { total: 1, busy: 1, idle: 0, offline: 0 },
        workers: [worker("scan", "busy")],
      },
      {
        summary: { total: 1, busy: 1, idle: 0, offline: 0 },
        workers: [worker("scan", "busy")],
      },
    ]);
  });

  it("does not let cleared in-flight worker loads repopulate the cache", async () => {
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>();
    let resolveFirstWorkers!: (workers: TestWorker[]) => void;
    const loadWorkers = vi
      .fn<() => Promise<TestWorker[]>>()
      .mockImplementationOnce(
        () =>
          new Promise<TestWorker[]>((resolve) => {
            resolveFirstWorkers = resolve;
          }),
      )
      .mockResolvedValueOnce([worker("scan", "busy")]);

    const first = service.getSnapshot(loadWorkers);
    service.clear();
    resolveFirstWorkers([worker("scan", "idle")]);

    await expect(first).resolves.toEqual({
      summary: { total: 1, busy: 0, idle: 1, offline: 0 },
      workers: [worker("scan", "idle")],
    });
    await expect(service.getSnapshot(loadWorkers)).resolves.toEqual({
      summary: { total: 1, busy: 1, idle: 0, offline: 0 },
      workers: [worker("scan", "busy")],
    });
    expect(loadWorkers).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed snapshot loads", async () => {
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>();
    const loadWorkers = vi
      .fn<() => Promise<TestWorker[]>>()
      .mockRejectedValueOnce(new Error("metrics unavailable"))
      .mockResolvedValueOnce([worker("scan", "idle")]);

    await expect(service.getSnapshot(loadWorkers)).rejects.toThrow(
      "metrics unavailable",
    );
    const next = await service.getSnapshot(loadWorkers);

    expect(loadWorkers).toHaveBeenCalledTimes(2);
    expect(next.summary).toEqual({
      total: 1,
      busy: 0,
      idle: 1,
      offline: 0,
    });
  });

  it("drops malformed worker entries before caching snapshots", async () => {
    let now = 100;
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({
      now: () => now,
    });
    const loadWorkers = vi.fn(
      async () =>
        [
          worker("scan", "busy"),
          undefined,
          { name: "index", state: "sleeping", metrics: { pending: 3 } },
        ] as unknown as TestWorker[],
    );

    await expect(service.getSnapshot(loadWorkers)).resolves.toEqual({
      summary: { total: 2, busy: 1, idle: 0, offline: 1 },
      workers: [
        worker("scan", "busy"),
        { name: "index", state: "offline", metrics: { pending: 3 } },
      ],
    });

    now += 100;
    await expect(service.getSnapshot(loadWorkers)).resolves.toEqual({
      summary: { total: 2, busy: 1, idle: 0, offline: 1 },
      workers: [
        worker("scan", "busy"),
        { name: "index", state: "offline", metrics: { pending: 3 } },
      ],
    });
    expect(loadWorkers).toHaveBeenCalledTimes(1);
  });

  it("treats non-array worker loads as an empty snapshot", async () => {
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>();
    const loadWorkers = vi.fn(
      async () => ({ name: "scan", state: "busy" }) as unknown as TestWorker[],
    );

    await expect(service.getSnapshot(loadWorkers)).resolves.toEqual({
      summary: { total: 0, busy: 0, idle: 0, offline: 0 },
      workers: [],
    });
  });

  it("refreshes snapshots after the cache window", async () => {
    let now = 100;
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({
      now: () => now,
    });
    const loadWorkers = vi
      .fn<() => Promise<TestWorker[]>>()
      .mockResolvedValueOnce([worker("scan", "idle")])
      .mockResolvedValueOnce([worker("scan", "busy")]);

    await service.getSnapshot(loadWorkers);
    now += 1_001;
    const next = await service.getSnapshot(loadWorkers);

    expect(loadWorkers).toHaveBeenCalledTimes(2);
    expect(next.summary).toEqual({
      total: 1,
      busy: 1,
      idle: 0,
      offline: 0,
    });
  });
});
