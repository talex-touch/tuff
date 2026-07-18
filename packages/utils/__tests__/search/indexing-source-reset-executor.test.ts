import { describe, expect, it, vi } from "vitest";
import {
  buildIndexedSourceResetOperationReason,
  buildIndexedSourceResetOperationReasonPrefix,
  IndexedSourceResetExecutorService,
  IndexedSourceResetReasons,
} from "../../search";

function createExecutor(
  options: {
    clearSearchIndex?: (
      reason: string,
    ) => Promise<void | { cleared?: boolean; rows?: number }>;
    clearScanProgress?: (
      reason: string,
    ) => Promise<{ cleared: boolean; rows?: number }>;
    operationReasonNamespace?: string;
    nowValues?: number[];
  } = {},
) {
  const nowValues = options.nowValues ?? [100, 150];
  const clearSearchIndex = vi.fn(
    options.clearSearchIndex ?? (async () => undefined),
  );
  const clearScanProgress = vi.fn(
    options.clearScanProgress ?? (async () => ({ cleared: true, rows: 3 })),
  );
  const now = vi.fn(() => nowValues.shift() ?? 150);

  return {
    clearScanProgress,
    clearSearchIndex,
    executor: new IndexedSourceResetExecutorService({
      sourceId: "test-source",
      clearSearchIndex,
      clearScanProgress,
      operationReasonNamespace: options.operationReasonNamespace,
      now,
    }),
    now,
  };
}

describe("IndexedSourceResetExecutorService", () => {
  it("clears search index and scan progress when requested", async () => {
    const { clearSearchIndex, clearScanProgress, executor } = createExecutor();

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.IntegrityRepair,
        clearSearchIndex: true,
        clearScanProgress: true,
      },
      operationReasonPrefix: "test.integrity",
    });

    expect(clearSearchIndex).toHaveBeenCalledWith(
      "test.integrity.remove-by-provider",
    );
    expect(clearScanProgress).toHaveBeenCalledWith(
      "test.integrity.scan-progress-reset",
    );
    expect(result).toEqual({
      sourceId: "test-source",
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearedSearchIndex: true,
      clearedSearchIndexRows: 0,
      clearedScanProgress: true,
      scanProgressRows: 3,
      startedAt: 100,
      completedAt: 150,
    });
  });

  it("skips scan progress cleanup when request disables it", async () => {
    const { clearScanProgress, clearSearchIndex, executor } = createExecutor();

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.SchemaMigration,
        clearScanProgress: false,
      },
    });

    expect(clearSearchIndex).not.toHaveBeenCalled();
    expect(clearScanProgress).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      clearedSearchIndex: false,
      clearedSearchIndexRows: 0,
      clearedScanProgress: false,
      scanProgressRows: 0,
    });
  });

  it("uses explicit input overrides before request flags", async () => {
    const { clearSearchIndex, clearScanProgress, executor } = createExecutor({
      clearScanProgress: async () => ({ cleared: false, rows: 0 }),
    });

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: true,
      },
      clearSearchIndex: false,
      clearScanProgress: true,
    });

    expect(clearSearchIndex).not.toHaveBeenCalled();
    expect(clearScanProgress).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      clearedSearchIndex: false,
      clearedSearchIndexRows: 0,
      clearedScanProgress: false,
      scanProgressRows: 0,
    });
  });

  it("records search index rows from the clear operation when available", async () => {
    const { executor } = createExecutor({
      clearSearchIndex: async () => ({ cleared: true, rows: 7 }),
    });

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: false,
      },
    });

    expect(result).toMatchObject({
      clearedSearchIndex: true,
      clearedSearchIndexRows: 7,
      clearedScanProgress: false,
      scanProgressRows: 0,
    });
  });

  it("normalizes malformed reset row counts from clear operations", async () => {
    const { executor } = createExecutor({
      clearSearchIndex: async () => ({
        cleared: true,
        rows: Number.POSITIVE_INFINITY,
      }),
      clearScanProgress: async () => ({ cleared: true, rows: -4.5 }),
    });

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: true,
      },
    });

    expect(result).toMatchObject({
      clearedSearchIndex: true,
      clearedSearchIndexRows: 0,
      clearedScanProgress: true,
      scanProgressRows: 0,
    });
  });

  it("normalizes reset timestamps when the clock is malformed or moves backwards", async () => {
    const { executor } = createExecutor({
      nowValues: [50, 25],
    });

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.HealthRepair,
      },
    });

    expect(result).toMatchObject({
      startedAt: 50,
      completedAt: 50,
    });
  });

  it("builds operation reasons from the constructor namespace by default", async () => {
    const { clearSearchIndex, clearScanProgress, executor } = createExecutor({
      operationReasonNamespace: "file-index",
    });

    const result = await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.ManualRebuild,
        clearSearchIndex: true,
        clearScanProgress: true,
      },
    });

    expect(clearSearchIndex).toHaveBeenCalledWith(
      "file-index.manual-rebuild.remove-by-provider",
    );
    expect(clearScanProgress).toHaveBeenCalledWith(
      "file-index.manual-rebuild.scan-progress-reset",
    );
    expect(result.reason).toBe(IndexedSourceResetReasons.ManualRebuild);
  });

  it("lets reset input override the constructor operation reason namespace", async () => {
    const { clearSearchIndex, executor } = createExecutor({
      operationReasonNamespace: "file-index",
    });

    await executor.reset({
      request: {
        sourceId: "test-source",
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: false,
      },
      operationReasonNamespace: "custom-index",
    });

    expect(clearSearchIndex).toHaveBeenCalledWith(
      "custom-index.user-clear.remove-by-provider",
    );
  });
});

describe("indexed source reset operation reason helpers", () => {
  it("build reset operation reason prefixes and operation labels", () => {
    expect(
      buildIndexedSourceResetOperationReasonPrefix({
        reason: IndexedSourceResetReasons.HealthRepair,
      }),
    ).toBe("indexed-source.health-repair");
    expect(
      buildIndexedSourceResetOperationReasonPrefix({
        reason: IndexedSourceResetReasons.UserClear,
        namespace: "file-index",
      }),
    ).toBe("file-index.user-clear");
    expect(
      buildIndexedSourceResetOperationReason({
        reason: IndexedSourceResetReasons.UserClear,
        namespace: "file-index",
        operation: "scan-progress-reset",
      }),
    ).toBe("file-index.user-clear.scan-progress-reset");
    expect(
      buildIndexedSourceResetOperationReason({
        reason: IndexedSourceResetReasons.UserClear,
        prefix: "custom.reset",
        operation: "remove-by-provider",
      }),
    ).toBe("custom.reset.remove-by-provider");
  });
});
