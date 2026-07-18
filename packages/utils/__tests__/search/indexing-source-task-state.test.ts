import { describe, expect, it } from "vitest";
import {
  buildIndexedSourceReconcileTaskState,
  buildIndexedSourceResetTaskState,
  buildIndexedSourceScanTaskState,
  buildIndexedSourceWatchTaskState,
  updateIndexedSourceTaskState,
} from "../../search";
import type { IndexedSourceRuntimeTaskState } from "../../search";

describe("indexing source task state", () => {
  it("updates the selected last task field and prepends history", () => {
    const state: IndexedSourceRuntimeTaskState = {
      recentTasks: [
        {
          kind: "watch",
          status: "succeeded",
          completedAt: 2,
        },
      ],
    };

    expect(
      updateIndexedSourceTaskState({
        state,
        key: "lastScan",
        value: {
          startedAt: 1,
          completedAt: 3,
          batches: 2,
          records: 5,
          indexedRecords: 5,
        },
        historyEntry: {
          kind: "scan",
          status: "succeeded",
          startedAt: 1,
          completedAt: 3,
          summary: {
            batches: 2,
            records: 5,
            indexedRecords: 5,
          },
        },
      }),
    ).toEqual({
      lastScan: {
        startedAt: 1,
        completedAt: 3,
        batches: 2,
        records: 5,
        indexedRecords: 5,
      },
      recentTasks: [
        {
          kind: "scan",
          status: "succeeded",
          startedAt: 1,
          completedAt: 3,
          summary: {
            batches: 2,
            records: 5,
            indexedRecords: 5,
          },
        },
        {
          kind: "watch",
          status: "succeeded",
          completedAt: 2,
        },
      ],
    });
  });

  it("keeps bounded recent task history", () => {
    const state: IndexedSourceRuntimeTaskState = {
      recentTasks: [
        { kind: "scan", status: "succeeded", completedAt: 3 },
        { kind: "scan", status: "succeeded", completedAt: 2 },
      ],
    };

    const next = updateIndexedSourceTaskState({
      state,
      key: "lastReset",
      value: {
        startedAt: 4,
        completedAt: 5,
        reason: "manual-rebuild",
        clearedSearchIndex: true,
        clearedScanProgress: true,
      },
      historyEntry: {
        kind: "reset",
        status: "succeeded",
        completedAt: 5,
      },
      historyLimit: 2,
    });

    expect(next.recentTasks).toEqual([
      { kind: "reset", status: "succeeded", completedAt: 5 },
      { kind: "scan", status: "succeeded", completedAt: 3 },
    ]);
  });

  it("does not append task history entries with invalid completedAt values", () => {
    const state: IndexedSourceRuntimeTaskState = {
      recentTasks: [{ kind: "scan", status: "succeeded", completedAt: 2 }],
    };

    const next = updateIndexedSourceTaskState({
      state,
      key: "lastWatch",
      value: {
        occurredAt: 3,
        completedAt: 4,
        action: "change",
        path: "/tmp/a",
        deltas: 1,
        appliedDeltas: 1,
        failedDeltas: 0,
      },
      historyEntry: {
        kind: "watch",
        status: "failed",
        completedAt: Number.POSITIVE_INFINITY,
        error: "bad persisted timestamp",
      },
    });

    expect(next.lastWatch).toMatchObject({
      action: "change",
      completedAt: 4,
    });
    expect(next.recentTasks).toEqual([
      { kind: "scan", status: "succeeded", completedAt: 2 },
    ]);
    expect(next.recentTasks).not.toBe(state.recentTasks);
  });

  it("does not mutate existing state", () => {
    const state: IndexedSourceRuntimeTaskState = {};

    const next = updateIndexedSourceTaskState({
      state,
      key: "lastWatch",
      value: {
        occurredAt: 1,
        completedAt: 2,
        action: "change",
        path: "/tmp/a",
        deltas: 1,
        appliedDeltas: 1,
        failedDeltas: 0,
      },
      historyEntry: {
        kind: "watch",
        status: "succeeded",
        completedAt: 2,
      },
    });

    expect(state).toEqual({});
    expect(next).not.toBe(state);
  });

  it("isolates updated last task snapshots from caller mutation", () => {
    const value: NonNullable<IndexedSourceRuntimeTaskState["lastScan"]> & {
      nested: { attempts: number };
    } = {
      startedAt: 1,
      completedAt: 2,
      batches: 1,
      records: 2,
      indexedRecords: 2,
      nested: {
        attempts: 1,
      },
    };

    const next = updateIndexedSourceTaskState({
      state: {},
      key: "lastScan",
      value,
      historyEntry: {
        kind: "scan",
        status: "succeeded",
        completedAt: 2,
      },
    });

    value.records = 99;
    value.nested.attempts = 99;

    expect(next.lastScan).toMatchObject({
      records: 2,
      nested: {
        attempts: 1,
      },
    });
    expect(next.lastScan).not.toBe(value);
    expect((next.lastScan as typeof value).nested).not.toBe(value.nested);
  });

  it("builds scan task state with job identity and summary", () => {
    expect(
      buildIndexedSourceScanTaskState({
        sourceId: "file-provider",
        startedAt: 10,
        completedAt: 20,
        batches: 2,
        records: 5,
        job: {
          id: "file-provider:scan:1",
          sourceId: "file-provider",
          kind: "scan",
          queuedAt: 9,
        },
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastScan",
      value: {
        startedAt: 10,
        completedAt: 20,
        jobId: "file-provider:scan:1",
        queuedAt: 9,
        batches: 2,
        records: 5,
        indexedRecords: 5,
        error: undefined,
      },
      historyEntry: {
        kind: "scan",
        status: "succeeded",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        jobId: "file-provider:scan:1",
        queuedAt: 9,
        summary: {
          durationMs: 10,
          batches: 2,
          records: 5,
          indexedRecords: 5,
          phase: undefined,
        },
      },
    });
  });

  it("builds skipped scan task state with normalized skip error", () => {
    expect(
      buildIndexedSourceScanTaskState({
        sourceId: "browser-bookmarks",
        startedAt: 10,
        completedAt: 10,
        status: "skipped",
        skipReason: "health:disabled",
      }),
    ).toEqual({
      sourceId: "browser-bookmarks",
      key: "lastScan",
      value: {
        startedAt: 10,
        completedAt: 10,
        jobId: undefined,
        queuedAt: undefined,
        batches: 0,
        records: 0,
        indexedRecords: 0,
        error: "skipped:health:disabled",
      },
      historyEntry: {
        kind: "scan",
        status: "skipped",
        startedAt: 10,
        completedAt: 10,
        durationMs: 0,
        errorMessage: "skipped:health:disabled",
        error: "skipped:health:disabled",
        summary: {
          durationMs: 0,
        },
      },
    });
  });

  it("builds failed scan task state with phase summary", () => {
    expect(
      buildIndexedSourceScanTaskState({
        sourceId: "file-provider",
        startedAt: 10,
        completedAt: 20,
        status: "failed",
        phase: "store",
        batches: 1,
        records: 10,
        indexedRecords: 8,
        error: "sqlite busy",
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastScan",
      value: {
        startedAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        batches: 1,
        records: 10,
        indexedRecords: 8,
        phase: "store",
        error: "sqlite busy",
      },
      historyEntry: {
        kind: "scan",
        status: "failed",
        startedAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        durationMs: 10,
        errorMessage: "sqlite busy",
        error: "sqlite busy",
        summary: {
          durationMs: 10,
          batches: 1,
          records: 10,
          indexedRecords: 8,
          phase: "store",
          errorMessage: "sqlite busy",
        },
      },
    });
  });

  it("normalizes task builder timestamps before they enter runtime state", () => {
    const scan = buildIndexedSourceScanTaskState({
      sourceId: "file-provider",
      startedAt: Number.NaN,
      completedAt: 30,
      now: 100,
      job: {
        id: "file-provider:scan:bad-time",
        sourceId: "file-provider",
        kind: "scan",
        queuedAt: 150,
      },
    });
    const watch = buildIndexedSourceWatchTaskState({
      sourceId: "file-provider",
      occurredAt: -50,
      completedAt: -40,
      now: 100,
      action: "change",
      path: "/tmp/report.md",
    });
    const reconcile = buildIndexedSourceReconcileTaskState({
      sourceId: "file-provider",
      startedAt: 90,
      completedAt: 200,
      now: 100,
    });
    const reset = buildIndexedSourceResetTaskState({
      sourceId: "file-provider",
      startedAt: Number.POSITIVE_INFINITY,
      completedAt: Number.NaN,
      now: 100,
      reason: "integrity-repair",
      clearedSearchIndex: false,
      clearedScanProgress: false,
    });

    expect(scan.value).toMatchObject({
      startedAt: 30,
      completedAt: 30,
      queuedAt: 100,
    });
    expect(scan.historyEntry).toMatchObject({
      startedAt: 30,
      completedAt: 30,
      queuedAt: 30,
    });
    expect(watch.value).toMatchObject({
      occurredAt: 0,
      completedAt: 0,
    });
    expect(reconcile.value).toMatchObject({
      startedAt: 90,
      completedAt: 100,
    });
    expect(reset.value).toMatchObject({
      startedAt: 100,
      completedAt: 100,
    });
    expect(reset.historyEntry).toMatchObject({
      startedAt: 100,
      completedAt: 100,
    });
  });

  it("normalizes task builder counters before they enter runtime state", () => {
    const scan = buildIndexedSourceScanTaskState({
      sourceId: "file-provider",
      startedAt: 10,
      completedAt: 20,
      batches: -1,
      records: Number.NaN,
      indexedRecords: Number.POSITIVE_INFINITY,
    });
    const watch = buildIndexedSourceWatchTaskState({
      sourceId: "file-provider",
      occurredAt: 10,
      completedAt: 20,
      action: "change",
      path: "/tmp/report.md",
      deltas: -1,
      appliedDeltas: Number.NaN,
      failedDeltas: Number.POSITIVE_INFINITY,
      skippedDeltas: -2,
    });
    const reconcile = buildIndexedSourceReconcileTaskState({
      sourceId: "file-provider",
      startedAt: 10,
      completedAt: 20,
      added: -1,
      changed: Number.NaN,
      deleted: Number.POSITIVE_INFINITY,
      skipped: 2,
      errors: -3,
      rootCount: -4,
      deltas: Number.NaN,
      appliedDeltas: 3,
      failedDeltas: -5,
      skippedDeltas: Number.POSITIVE_INFINITY,
    });
    const reset = buildIndexedSourceResetTaskState({
      sourceId: "file-provider",
      startedAt: 10,
      completedAt: 20,
      reason: "manual-rebuild",
      clearedSearchIndex: true,
      clearedSearchIndexRows: -1,
      clearedScanProgress: true,
      scanProgressRows: Number.NaN,
    });

    expect(scan.value).toMatchObject({
      batches: 0,
      records: 0,
      indexedRecords: 0,
    });
    expect(scan.historyEntry.summary).toEqual({
      durationMs: 10,
      batches: 0,
      records: 0,
      indexedRecords: 0,
      phase: undefined,
    });
    expect(watch.value).toMatchObject({
      deltas: 0,
      appliedDeltas: 0,
      failedDeltas: 0,
      skippedDeltas: 0,
    });
    expect(watch.historyEntry.summary).toEqual({
      durationMs: 10,
      trigger: "change",
      action: "change",
      deltas: 0,
      appliedDeltas: 0,
      failedDeltas: 0,
      skippedDeltas: 0,
    });
    expect(reconcile.value).toMatchObject({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 2,
      errors: 0,
      appliedDeltas: 3,
    });
    expect(reconcile.value.rootCount).toBeUndefined();
    expect(reconcile.value.deltas).toBeUndefined();
    expect(reconcile.value.failedDeltas).toBeUndefined();
    expect(reconcile.value.skippedDeltas).toBeUndefined();
    expect(reset.value.clearedSearchIndexRows).toBeUndefined();
    expect(reset.value.scanProgressRows).toBeUndefined();
    expect(reset.historyEntry.summary).toEqual({
      durationMs: 10,
      reason: "manual-rebuild",
      clearedSearchIndex: true,
      clearedSearchIndexRows: undefined,
      clearedScanProgress: true,
      scanProgressRows: undefined,
    });
  });

  it("builds watch task state with job identity and summary", () => {
    expect(
      buildIndexedSourceWatchTaskState({
        sourceId: "file-provider",
        occurredAt: 10,
        completedAt: 20,
        action: "change",
        path: "/tmp/report.md",
        deltas: 2,
        appliedDeltas: 2,
        failedDeltas: 0,
        job: {
          id: "file-provider:watch:1",
          sourceId: "file-provider",
          kind: "watch",
          queuedAt: 9,
        },
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastWatch",
      value: {
        occurredAt: 10,
        completedAt: 20,
        jobId: "file-provider:watch:1",
        queuedAt: 9,
        action: "change",
        path: "/tmp/report.md",
        deltas: 2,
        appliedDeltas: 2,
        failedDeltas: 0,
        skippedDeltas: 0,
        error: undefined,
      },
      historyEntry: {
        kind: "watch",
        status: "succeeded",
        occurredAt: 10,
        completedAt: 20,
        durationMs: 10,
        jobId: "file-provider:watch:1",
        queuedAt: 9,
        summary: {
          durationMs: 10,
          trigger: "change",
          action: "change",
          deltas: 2,
          appliedDeltas: 2,
          failedDeltas: 0,
          skippedDeltas: 0,
        },
      },
    });
  });

  it("replaces blank watch paths with an explicit placeholder", () => {
    const watch = buildIndexedSourceWatchTaskState({
      sourceId: "file-provider",
      occurredAt: 10,
      completedAt: 20,
      action: "change",
      path: "   ",
    });

    expect(watch.value.path).toBe("<unknown>");
    expect(watch.value.path.trim().length).toBeGreaterThan(0);
  });

  it("preserves non-blank watch paths without trimming", () => {
    const watch = buildIndexedSourceWatchTaskState({
      sourceId: "file-provider",
      occurredAt: 10,
      completedAt: 20,
      action: "change",
      path: "/tmp/report with trailing space ",
    });

    expect(watch.value.path).toBe("/tmp/report with trailing space ");
  });

  it("builds skipped watch task state with normalized skip error", () => {
    expect(
      buildIndexedSourceWatchTaskState({
        sourceId: "browser-bookmarks",
        occurredAt: 10,
        completedAt: 20,
        action: "change",
        path: "/browser/Default/Bookmarks",
        status: "skipped",
        skipReason: "health:disabled",
        summary: {
          action: "change",
        },
      }),
    ).toEqual({
      sourceId: "browser-bookmarks",
      key: "lastWatch",
      value: {
        occurredAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        action: "change",
        path: "/browser/Default/Bookmarks",
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: 0,
        skippedDeltas: 0,
        error: "skipped:health:disabled",
      },
      historyEntry: {
        kind: "watch",
        status: "skipped",
        occurredAt: 10,
        completedAt: 20,
        durationMs: 10,
        errorMessage: "skipped:health:disabled",
        error: "skipped:health:disabled",
        summary: {
          durationMs: 10,
          trigger: "change",
          action: "change",
          errorMessage: "skipped:health:disabled",
        },
      },
    });
  });

  it("builds reconcile task state with job identity and summary", () => {
    expect(
      buildIndexedSourceReconcileTaskState({
        sourceId: "file-provider",
        startedAt: 10,
        completedAt: 20,
        added: 1,
        changed: 2,
        deleted: 3,
        skipped: 4,
        errors: 0,
        reason: "manual-repair",
        rootCount: 2,
        deltas: 6,
        appliedDeltas: 6,
        failedDeltas: 0,
        job: {
          id: "file-provider:reconcile:1",
          sourceId: "file-provider",
          kind: "reconcile",
          queuedAt: 9,
        },
        summary: {
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 0,
          reason: "manual-repair",
          rootCount: 2,
        },
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastReconcile",
      value: {
        startedAt: 10,
        completedAt: 20,
        added: 1,
        changed: 2,
        deleted: 3,
        skipped: 4,
        errors: 0,
        reason: "manual-repair",
        rootCount: 2,
        jobId: "file-provider:reconcile:1",
        queuedAt: 9,
        deltas: 6,
        appliedDeltas: 6,
        failedDeltas: 0,
        skippedDeltas: undefined,
        error: undefined,
      },
      historyEntry: {
        kind: "reconcile",
        status: "succeeded",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        reason: "manual-repair",
        jobId: "file-provider:reconcile:1",
        queuedAt: 9,
        summary: {
          durationMs: 10,
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 0,
          reason: "manual-repair",
          rootCount: 2,
        },
      },
    });
  });

  it("sanitizes caller-provided task history summaries before returning builder output", () => {
    const reconcile = buildIndexedSourceReconcileTaskState({
      sourceId: "file-provider",
      startedAt: 10,
      completedAt: 20,
      added: 1,
      changed: 2,
      deleted: 3,
      status: "failed",
      error: "store failed",
      summary: {
        kept: "yes",
        ok: true,
        count: 2,
        missing: undefined,
        badObject: { nested: true } as never,
        badArray: ["nested"] as never,
        badNumber: Number.NaN,
      },
    });

    expect(reconcile.historyEntry.summary).toEqual({
      durationMs: 10,
      kept: "yes",
      ok: true,
      count: 2,
      missing: undefined,
      errorMessage: "store failed",
    });
  });

  it("builds skipped reconcile task state with normalized skip error", () => {
    expect(
      buildIndexedSourceReconcileTaskState({
        sourceId: "browser-bookmarks",
        startedAt: 10,
        completedAt: 20,
        status: "skipped",
        skipReason: "health:permission-required",
        skipped: 1,
      }),
    ).toEqual({
      sourceId: "browser-bookmarks",
      key: "lastReconcile",
      value: {
        startedAt: 10,
        completedAt: 20,
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 1,
        errors: 0,
        reason: undefined,
        rootCount: undefined,
        jobId: undefined,
        queuedAt: undefined,
        deltas: undefined,
        appliedDeltas: undefined,
        failedDeltas: undefined,
        skippedDeltas: undefined,
        error: "skipped:health:permission-required",
      },
      historyEntry: {
        kind: "reconcile",
        status: "skipped",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        errorMessage: "skipped:health:permission-required",
        error: "skipped:health:permission-required",
        summary: {
          durationMs: 10,
          errorMessage: "skipped:health:permission-required",
        },
      },
    });
  });

  it("builds reset task state with job identity and summary", () => {
    expect(
      buildIndexedSourceResetTaskState({
        sourceId: "file-provider",
        startedAt: 10,
        completedAt: 20,
        reason: "manual-rebuild",
        clearedSearchIndex: true,
        clearedSearchIndexRows: 4,
        clearedScanProgress: true,
        scanProgressRows: 3,
        job: {
          id: "file-provider:reset:1",
          sourceId: "file-provider",
          kind: "reset",
          queuedAt: 9,
        },
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastReset",
      value: {
        startedAt: 10,
        completedAt: 20,
        reason: "manual-rebuild",
        jobId: "file-provider:reset:1",
        queuedAt: 9,
        clearedSearchIndex: true,
        clearedSearchIndexRows: 4,
        clearedScanProgress: true,
        scanProgressRows: 3,
        error: undefined,
      },
      historyEntry: {
        kind: "reset",
        status: "succeeded",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        reason: "manual-rebuild",
        jobId: "file-provider:reset:1",
        queuedAt: 9,
        summary: {
          durationMs: 10,
          reason: "manual-rebuild",
          clearedSearchIndex: true,
          clearedSearchIndexRows: 4,
          clearedScanProgress: true,
          scanProgressRows: 3,
        },
      },
    });
  });

  it("builds failed reset task state with error", () => {
    expect(
      buildIndexedSourceResetTaskState({
        sourceId: "file-provider",
        startedAt: 10,
        completedAt: 20,
        reason: "integrity-repair",
        clearedSearchIndex: false,
        clearedScanProgress: false,
        error: "reset failed",
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastReset",
      value: {
        startedAt: 10,
        completedAt: 20,
        reason: "integrity-repair",
        jobId: undefined,
        queuedAt: undefined,
        clearedSearchIndex: false,
        clearedSearchIndexRows: undefined,
        clearedScanProgress: false,
        scanProgressRows: undefined,
        error: "reset failed",
      },
      historyEntry: {
        kind: "reset",
        status: "failed",
        startedAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        durationMs: 10,
        reason: "integrity-repair",
        errorMessage: "reset failed",
        error: "reset failed",
        summary: {
          durationMs: 10,
          reason: "integrity-repair",
          clearedSearchIndex: false,
          clearedSearchIndexRows: undefined,
          clearedScanProgress: false,
          scanProgressRows: undefined,
          errorMessage: "reset failed",
        },
      },
    });
  });

  it("builds skipped reset task state with explicit skip reason", () => {
    expect(
      buildIndexedSourceResetTaskState({
        sourceId: "file-provider",
        startedAt: 10,
        completedAt: 20,
        reason: "manual-rebuild",
        clearedSearchIndex: false,
        clearedScanProgress: false,
        status: "skipped",
        skipReason: "already-running",
      }),
    ).toEqual({
      sourceId: "file-provider",
      key: "lastReset",
      value: {
        startedAt: 10,
        completedAt: 20,
        reason: "manual-rebuild",
        jobId: undefined,
        queuedAt: undefined,
        clearedSearchIndex: false,
        clearedSearchIndexRows: undefined,
        clearedScanProgress: false,
        scanProgressRows: undefined,
        error: "skipped:already-running",
      },
      historyEntry: {
        kind: "reset",
        status: "skipped",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        reason: "manual-rebuild",
        errorMessage: "skipped:already-running",
        error: "skipped:already-running",
        summary: {
          durationMs: 10,
          reason: "manual-rebuild",
          clearedSearchIndex: false,
          clearedSearchIndexRows: undefined,
          clearedScanProgress: false,
          scanProgressRows: undefined,
          errorMessage: "skipped:already-running",
        },
      },
    });
  });
});
