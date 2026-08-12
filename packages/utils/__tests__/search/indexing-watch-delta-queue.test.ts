import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexingWatchDeltaQueueService } from "../../search";

interface TestDeltaPayload {
  action: "add" | "change" | "delete";
  rawPath: string;
  manual?: boolean;
  source?: string;
}

function createService(
  options: {
    shouldAccept?: (rawPath: string) => boolean;
    prepareFlush?: () => Promise<boolean>;
  } = {},
) {
  const processEntries = vi.fn(async () => undefined);
  const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
    normalizeKey: (rawPath) => rawPath.toLowerCase(),
    shouldAccept: options.shouldAccept ?? (() => true),
    prepareFlush: options.prepareFlush ?? (async () => true),
    processEntries,
    logError: vi.fn(),
  });

  return {
    processEntries,
    service,
  };
}

async function settleQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function settleTaskChain(): Promise<void> {
  await settleQueue();
  await settleQueue();
}

describe("indexing-watch-delta-queue-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores rejected paths", async () => {
    const { processEntries, service } = createService({
      shouldAccept: () => false,
    });

    service.enqueue("/tmp/a.txt", "add");
    await settleQueue();

    expect(service.getPendingSize()).toBe(0);
    expect(processEntries).not.toHaveBeenCalled();
  });

  it("coalesces add and change for the same normalized key", async () => {
    const { processEntries, service } = createService();

    service.enqueue("/Tmp/A.txt", "add", { manual: false });
    service.enqueue("/tmp/a.txt", "change", { manual: false });
    await settleQueue();

    expect(processEntries).toHaveBeenCalledWith([
      ["/tmp/a.txt", { action: "add", rawPath: "/Tmp/A.txt", manual: false }],
    ]);
  });

  it("keeps delete as the final action for a pending key", async () => {
    const { processEntries, service } = createService();

    service.enqueue("/tmp/a.txt", "add");
    service.enqueue("/tmp/a.txt", "delete");
    service.enqueue("/tmp/a.txt", "change");
    await settleQueue();

    expect(processEntries).toHaveBeenCalledWith([
      ["/tmp/a.txt", { action: "delete", rawPath: "/tmp/a.txt" }],
    ]);
  });

  it("keeps pending entries when flush preparation is not ready", async () => {
    const { processEntries, service } = createService({
      prepareFlush: async () => false,
    });

    service.enqueue("/tmp/a.txt", "add");
    await settleQueue();

    expect(service.getPendingSize()).toBe(1);
    expect(processEntries).not.toHaveBeenCalled();
  });

  it("keeps pending entries when flush processing fails", async () => {
    const processEntries = vi
      .fn()
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(undefined);
    const logError = vi.fn();
    const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
      normalizeKey: (rawPath) => rawPath.toLowerCase(),
      shouldAccept: () => true,
      prepareFlush: async () => true,
      processEntries,
      logError,
    });

    service.enqueue("/tmp/a.txt", "add");
    await settleTaskChain();

    expect(service.getPendingSize()).toBe(1);
    expect(logError).toHaveBeenCalledWith(
      "Failed to process watch delta updates.",
      expect.any(Error),
    );

    service.flushSoon();
    await settleTaskChain();

    expect(processEntries).toHaveBeenCalledTimes(2);
    expect(processEntries).toHaveBeenLastCalledWith([
      ["/tmp/a.txt", { action: "add", rawPath: "/tmp/a.txt" }],
    ]);
    expect(service.getPendingSize()).toBe(0);
  });

  it("serializes flush processing", async () => {
    let releaseFirstFlush!: () => void;
    const firstFlush = new Promise<void>((resolve) => {
      releaseFirstFlush = resolve;
    });
    const processEntries = vi
      .fn()
      .mockImplementationOnce(async () => firstFlush)
      .mockImplementationOnce(async () => undefined);
    const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
      normalizeKey: (rawPath) => rawPath.toLowerCase(),
      shouldAccept: () => true,
      prepareFlush: async () => true,
      processEntries,
      logError: vi.fn(),
    });

    service.enqueue("/tmp/a.txt", "add");
    await settleQueue();
    service.enqueue("/tmp/b.txt", "change");
    await settleQueue();

    expect(processEntries).toHaveBeenCalledTimes(1);

    releaseFirstFlush();
    await settleTaskChain();

    expect(processEntries).toHaveBeenCalledTimes(2);
    expect(processEntries).toHaveBeenLastCalledWith([
      ["/tmp/b.txt", { action: "change", rawPath: "/tmp/b.txt" }],
    ]);
  });

  it("keeps same-key updates enqueued while an older payload is processing", async () => {
    let releaseFirstFlush!: () => void;
    const firstFlush = new Promise<void>((resolve) => {
      releaseFirstFlush = resolve;
    });
    const processEntries = vi
      .fn()
      .mockImplementationOnce(async () => firstFlush)
      .mockImplementationOnce(async () => undefined);
    const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
      normalizeKey: (rawPath) => rawPath.toLowerCase(),
      shouldAccept: () => true,
      prepareFlush: async () => true,
      processEntries,
      logError: vi.fn(),
    });

    service.enqueue("/tmp/a.txt", "change");
    await settleQueue();
    service.enqueue("/tmp/a.txt", "change", { manual: true });
    await settleQueue();

    expect(processEntries).toHaveBeenCalledTimes(1);

    releaseFirstFlush();
    await settleTaskChain();

    expect(processEntries).toHaveBeenCalledTimes(2);
    expect(processEntries).toHaveBeenLastCalledWith([
      ["/tmp/a.txt", { action: "change", rawPath: "/tmp/a.txt", manual: true }],
    ]);
    expect(service.getPendingSize()).toBe(0);
  });

  it("supports source-specific metadata coalescing", async () => {
    const processEntries = vi.fn(async () => undefined);
    const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
      normalizeKey: (rawPath) => rawPath.toLowerCase(),
      shouldAccept: () => true,
      prepareFlush: async () => true,
      processEntries,
      logError: vi.fn(),
      coalesce: ({ previous, next }) => ({
        ...next,
        manual: previous?.manual === true || next.manual === true,
        source: previous?.source ?? next.source,
      }),
    });

    service.enqueue("/tmp/a.txt", "change", {
      manual: true,
      source: "watcher",
    });
    service.enqueue("/tmp/a.txt", "change", {
      manual: false,
      source: "manual",
    });
    await settleQueue();

    expect(processEntries).toHaveBeenCalledWith([
      [
        "/tmp/a.txt",
        {
          action: "change",
          rawPath: "/tmp/a.txt",
          manual: true,
          source: "watcher",
        },
      ],
    ]);
  });

  describe("debounce window", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function createDebouncedService(debounceMs: number) {
      const processEntries = vi.fn(async () => undefined);
      const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
        normalizeKey: (rawPath) => rawPath.toLowerCase(),
        shouldAccept: () => true,
        prepareFlush: async () => true,
        processEntries,
        logError: vi.fn(),
        coalesce: ({ next }) => next,
        debounceMs,
      });
      return { processEntries, service };
    }

    it("merges an event burst for one key into a single flush", async () => {
      const { processEntries, service } = createDebouncedService(400);

      // Stands in for the ~16 watcher events one app install emits.
      for (let index = 0; index < 16; index += 1) {
        service.enqueue("/Applications/Probe.app", "change");
      }
      await settleTaskChain();

      expect(processEntries).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(400);
      await settleTaskChain();

      expect(processEntries).toHaveBeenCalledTimes(1);
      expect(processEntries).toHaveBeenCalledWith([
        [
          "/applications/probe.app",
          { action: "change", rawPath: "/Applications/Probe.app" },
        ],
      ]);
    });

    it("holds one timer for the open window and releases it when the window closes", async () => {
      const { service } = createDebouncedService(400);

      service.enqueue("/tmp/a.txt", "add");
      service.enqueue("/tmp/b.txt", "add");
      expect(service.hasPendingWindow()).toBe(true);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(400);
      await settleTaskChain();

      expect(service.hasPendingWindow()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(service.getPendingSize()).toBe(0);
    });

    it("opens no window while idle", () => {
      const { service } = createDebouncedService(400);

      expect(service.hasPendingWindow()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("flushes immediately when a caller bypasses the window", async () => {
      const { processEntries, service } = createDebouncedService(400);

      service.enqueue("/tmp/a.txt", "add");
      service.flushSoon();
      await settleTaskChain();

      expect(processEntries).toHaveBeenCalledTimes(1);
      expect(service.hasPendingWindow()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("drops the open window on dispose without losing pending entries", async () => {
      const { processEntries, service } = createDebouncedService(400);

      service.enqueue("/tmp/a.txt", "add");
      service.dispose();

      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(400);
      await settleTaskChain();

      expect(processEntries).not.toHaveBeenCalled();
      expect(service.getPendingSize()).toBe(1);
    });

    it("flushes without waiting when no window is configured", async () => {
      const { processEntries, service } = createDebouncedService(0);

      service.enqueue("/tmp/a.txt", "add");
      await settleTaskChain();

      expect(processEntries).toHaveBeenCalledTimes(1);
    });
  });
});
