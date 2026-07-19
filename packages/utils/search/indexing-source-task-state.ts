import type {
  IndexedSourceDeltaAction,
  IndexedSourceDiagnostics,
  IndexedSourceResetReason,
  IndexedSourceTaskHistoryEntry,
} from "./indexing-source";
import type { IndexedSourceRuntimeTaskJob } from "./indexing-source-runtime-task-job";
import {
  appendIndexedSourceTaskHistory,
  DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT,
} from "./indexing-source";
import { cloneIndexingSnapshotValue } from "./indexing-snapshot-clone";

export type IndexedSourceRuntimeTaskState = Pick<
  IndexedSourceDiagnostics,
  "lastScan" | "lastWatch" | "lastReconcile" | "lastReset" | "recentTasks"
>;

export type IndexedSourceRuntimeTaskStateKey = Exclude<
  keyof IndexedSourceRuntimeTaskState,
  "recentTasks"
>;

export interface IndexedSourceTaskStateUpdateInput<
  TKey extends IndexedSourceRuntimeTaskStateKey,
> {
  state: IndexedSourceRuntimeTaskState;
  key: TKey;
  value: NonNullable<IndexedSourceRuntimeTaskState[TKey]>;
  historyEntry: IndexedSourceTaskHistoryEntry;
  historyLimit?: number;
}

export interface IndexedSourceScanTaskStateInput {
  sourceId: string;
  startedAt: number;
  completedAt: number;
  now?: number;
  reason?: string;
  trigger?: string;
  attempt?: number;
  batches?: number;
  records?: number;
  indexedRecords?: number;
  phase?: string;
  status?: Extract<
    IndexedSourceTaskHistoryEntry["status"],
    "succeeded" | "failed" | "skipped"
  >;
  error?: string;
  errorCode?: string;
  skipReason?: string;
  job?: IndexedSourceRuntimeTaskJob;
}

export interface IndexedSourceScanTaskState {
  sourceId: string;
  key: "lastScan";
  value: NonNullable<IndexedSourceRuntimeTaskState["lastScan"]>;
  historyEntry: IndexedSourceTaskHistoryEntry;
}

export interface IndexedSourceWatchTaskStateInput {
  sourceId: string;
  occurredAt: number;
  completedAt: number;
  now?: number;
  action: IndexedSourceDeltaAction;
  path: string;
  deltas?: number;
  appliedDeltas?: number;
  failedDeltas?: number;
  skippedDeltas?: number;
  status?: Extract<
    IndexedSourceTaskHistoryEntry["status"],
    "succeeded" | "failed" | "skipped"
  >;
  error?: string;
  errorCode?: string;
  skipReason?: string;
  job?: IndexedSourceRuntimeTaskJob;
  summary?: IndexedSourceTaskHistoryEntry["summary"];
}

export interface IndexedSourceWatchTaskState {
  sourceId: string;
  key: "lastWatch";
  value: NonNullable<IndexedSourceRuntimeTaskState["lastWatch"]>;
  historyEntry: IndexedSourceTaskHistoryEntry;
}

export interface IndexedSourceReconcileTaskStateInput {
  sourceId: string;
  startedAt: number;
  completedAt: number;
  now?: number;
  added?: number;
  changed?: number;
  deleted?: number;
  skipped?: number;
  errors?: number;
  reason?: string;
  rootCount?: number;
  deltas?: number;
  appliedDeltas?: number;
  failedDeltas?: number;
  skippedDeltas?: number;
  trigger?: string;
  attempt?: number;
  status?: Extract<
    IndexedSourceTaskHistoryEntry["status"],
    "succeeded" | "failed" | "skipped"
  >;
  error?: string;
  errorCode?: string;
  skipReason?: string;
  job?: IndexedSourceRuntimeTaskJob;
  summary?: IndexedSourceTaskHistoryEntry["summary"];
}

export interface IndexedSourceReconcileTaskState {
  sourceId: string;
  key: "lastReconcile";
  value: NonNullable<IndexedSourceRuntimeTaskState["lastReconcile"]>;
  historyEntry: IndexedSourceTaskHistoryEntry;
}

export interface IndexedSourceResetTaskStateInput {
  sourceId: string;
  startedAt: number;
  completedAt: number;
  now?: number;
  reason: IndexedSourceResetReason;
  clearedSearchIndex: boolean;
  clearedSearchIndexRows?: number;
  clearedScanProgress: boolean;
  scanProgressRows?: number;
  trigger?: string;
  attempt?: number;
  status?: Extract<
    IndexedSourceTaskHistoryEntry["status"],
    "succeeded" | "failed" | "skipped"
  >;
  error?: string;
  errorCode?: string;
  skipReason?: string;
  job?: IndexedSourceRuntimeTaskJob;
}

export interface IndexedSourceResetTaskState {
  sourceId: string;
  key: "lastReset";
  value: NonNullable<IndexedSourceRuntimeTaskState["lastReset"]>;
  historyEntry: IndexedSourceTaskHistoryEntry;
}

const UNKNOWN_INDEXED_SOURCE_WATCH_PATH = "<unknown>";

export function updateIndexedSourceTaskState<
  TKey extends IndexedSourceRuntimeTaskStateKey,
>(
  input: IndexedSourceTaskStateUpdateInput<TKey>,
): IndexedSourceRuntimeTaskState {
  const historyLimit =
    input.historyLimit ?? DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT;
  return {
    ...input.state,
    [input.key]: cloneIndexingSnapshotValue(input.value),
    recentTasks: appendIndexedSourceTaskHistory(
      input.state.recentTasks,
      input.historyEntry,
      historyLimit,
    ),
  };
}

export function buildIndexedSourceScanTaskState(
  input: IndexedSourceScanTaskStateInput,
): IndexedSourceScanTaskState {
  const status = input.status ?? "succeeded";
  const error =
    status === "skipped"
      ? `skipped:${input.skipReason ?? input.error ?? "unknown"}`
      : input.error;
  const timestamps = normalizeTaskInterval(
    input.startedAt,
    input.completedAt,
    input.now,
  );
  const queuedAt = normalizeOptionalTaskTimestamp(
    input.job?.queuedAt,
    input.now,
  );
  const durationMs = calculateDurationMs(timestamps);
  const reason = normalizeOptionalTaskText(input.reason);
  const trigger = normalizeOptionalTaskText(input.trigger);
  const attempt = normalizeOptionalTaskCount(input.attempt);
  const errorCode = normalizeOptionalTaskText(input.errorCode);
  const batches = normalizeTaskCount(input.batches);
  const records = normalizeTaskCount(input.records);
  const indexedRecords = normalizeTaskCount(input.indexedRecords ?? records);
  const value = {
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    jobId: input.job?.id,
    queuedAt,
    batches,
    records,
    indexedRecords,
    ...(typeof input.phase === "string" ? { phase: input.phase } : {}),
    error,
  };
  const summary =
    status === "succeeded" || status === "failed"
      ? {
          durationMs,
          ...(reason ? { reason } : {}),
          ...(trigger ? { trigger } : {}),
          ...(attempt !== undefined ? { attempt } : {}),
          batches,
          records,
          indexedRecords,
          phase: input.phase,
          ...(errorCode ? { errorCode } : {}),
          ...(error ? { errorMessage: error } : {}),
        }
      : {
          durationMs,
          ...(reason ? { reason } : {}),
          ...(trigger ? { trigger } : {}),
          ...(attempt !== undefined ? { attempt } : {}),
        };
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: "scan",
    status,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    durationMs,
    ...(reason ? { reason } : {}),
    ...(trigger ? { trigger } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    jobId: input.job?.id,
    queuedAt,
    ...(errorCode ? { errorCode } : {}),
    ...(error ? { errorMessage: error } : {}),
    error,
    summary,
  };

  return {
    sourceId: input.sourceId,
    key: "lastScan",
    value,
    historyEntry: normalizeHistoryEntry(historyEntry),
  };
}

export function buildIndexedSourceReconcileTaskState(
  input: IndexedSourceReconcileTaskStateInput,
): IndexedSourceReconcileTaskState {
  const status = input.status ?? "succeeded";
  const error =
    status === "skipped"
      ? `skipped:${input.skipReason ?? input.error ?? "unknown"}`
      : input.error;
  const timestamps = normalizeTaskInterval(
    input.startedAt,
    input.completedAt,
    input.now,
  );
  const queuedAt = normalizeOptionalTaskTimestamp(
    input.job?.queuedAt,
    input.now,
  );
  const durationMs = calculateDurationMs(timestamps);
  const trigger = normalizeOptionalTaskText(input.trigger);
  const attempt = normalizeOptionalTaskCount(input.attempt);
  const errorCode = normalizeOptionalTaskText(input.errorCode);
  const added = normalizeTaskCount(input.added);
  const changed = normalizeTaskCount(input.changed);
  const deleted = normalizeTaskCount(input.deleted);
  const skipped = normalizeTaskCount(input.skipped);
  const errors = normalizeTaskCount(input.errors);
  const rootCount = normalizeOptionalTaskCount(input.rootCount);
  const deltas = normalizeOptionalTaskCount(input.deltas);
  const appliedDeltas = normalizeOptionalTaskCount(input.appliedDeltas);
  const failedDeltas = normalizeOptionalTaskCount(input.failedDeltas);
  const skippedDeltas = normalizeOptionalTaskCount(input.skippedDeltas);
  const value = {
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    added,
    changed,
    deleted,
    skipped,
    errors,
    reason: input.reason,
    rootCount,
    jobId: input.job?.id,
    queuedAt,
    deltas,
    appliedDeltas,
    failedDeltas,
    skippedDeltas,
    error,
  };
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: "reconcile",
    status,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    durationMs,
    reason: input.reason,
    ...(trigger ? { trigger } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    jobId: input.job?.id,
    queuedAt,
    ...(errorCode ? { errorCode } : {}),
    ...(error ? { errorMessage: error } : {}),
    error,
    summary: withTaskAuditSummary(input.summary, {
      durationMs,
      reason: input.reason,
      trigger,
      attempt,
      errorCode,
      errorMessage: error,
    }),
  };

  return {
    sourceId: input.sourceId,
    key: "lastReconcile",
    value,
    historyEntry: normalizeHistoryEntry(historyEntry),
  };
}

export function buildIndexedSourceWatchTaskState(
  input: IndexedSourceWatchTaskStateInput,
): IndexedSourceWatchTaskState {
  const status = input.status ?? "succeeded";
  const error =
    status === "skipped"
      ? `skipped:${input.skipReason ?? input.error ?? "unknown"}`
      : input.error;
  const timestamps = normalizeTaskInterval(
    input.occurredAt,
    input.completedAt,
    input.now,
  );
  const queuedAt = normalizeOptionalTaskTimestamp(
    input.job?.queuedAt,
    input.now,
  );
  const durationMs = calculateDurationMs(timestamps);
  const errorCode = normalizeOptionalTaskText(input.errorCode);
  const deltas = normalizeTaskCount(input.deltas);
  const appliedDeltas = normalizeTaskCount(input.appliedDeltas);
  const failedDeltas = normalizeTaskCount(input.failedDeltas);
  const skippedDeltas = normalizeTaskCount(input.skippedDeltas);
  const path = normalizeWatchPath(input.path);
  const value = {
    occurredAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    jobId: input.job?.id,
    queuedAt,
    action: input.action,
    path,
    deltas,
    appliedDeltas,
    failedDeltas,
    skippedDeltas,
    error,
  };
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: "watch",
    status,
    occurredAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    durationMs,
    jobId: input.job?.id,
    queuedAt,
    ...(errorCode ? { errorCode } : {}),
    ...(error ? { errorMessage: error } : {}),
    error,
    summary: withTaskAuditSummary(
      input.summary ?? {
        action: input.action,
        deltas,
        appliedDeltas,
        failedDeltas,
        skippedDeltas,
      },
      {
        durationMs,
        trigger: input.action,
        errorCode,
        errorMessage: error,
      },
    ),
  };

  return {
    sourceId: input.sourceId,
    key: "lastWatch",
    value,
    historyEntry: normalizeHistoryEntry(historyEntry),
  };
}

export function buildIndexedSourceResetTaskState(
  input: IndexedSourceResetTaskStateInput,
): IndexedSourceResetTaskState {
  const status = input.status ?? (input.error ? "failed" : "succeeded");
  const error =
    status === "skipped"
      ? `skipped:${input.skipReason ?? input.error ?? "unknown"}`
      : input.error;
  const timestamps = normalizeTaskInterval(
    input.startedAt,
    input.completedAt,
    input.now,
  );
  const queuedAt = normalizeOptionalTaskTimestamp(
    input.job?.queuedAt,
    input.now,
  );
  const durationMs = calculateDurationMs(timestamps);
  const trigger = normalizeOptionalTaskText(input.trigger);
  const attempt = normalizeOptionalTaskCount(input.attempt);
  const errorCode = normalizeOptionalTaskText(input.errorCode);
  const clearedSearchIndexRows = normalizeOptionalTaskCount(
    input.clearedSearchIndexRows,
  );
  const scanProgressRows = normalizeOptionalTaskCount(input.scanProgressRows);
  const value = {
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    reason: input.reason,
    jobId: input.job?.id,
    queuedAt,
    clearedSearchIndex: input.clearedSearchIndex,
    clearedSearchIndexRows,
    clearedScanProgress: input.clearedScanProgress,
    scanProgressRows,
    error,
  };
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: "reset",
    status,
    startedAt: timestamps.startedAt,
    completedAt: timestamps.completedAt,
    durationMs,
    reason: input.reason,
    ...(trigger ? { trigger } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    jobId: input.job?.id,
    queuedAt,
    ...(errorCode ? { errorCode } : {}),
    ...(error ? { errorMessage: error } : {}),
    error,
    summary: {
      durationMs,
      reason: input.reason,
      ...(trigger ? { trigger } : {}),
      ...(attempt !== undefined ? { attempt } : {}),
      clearedSearchIndex: input.clearedSearchIndex,
      clearedSearchIndexRows,
      clearedScanProgress: input.clearedScanProgress,
      scanProgressRows,
      ...(errorCode ? { errorCode } : {}),
      ...(error ? { errorMessage: error } : {}),
    },
  };

  return {
    sourceId: input.sourceId,
    key: "lastReset",
    value,
    historyEntry: normalizeHistoryEntry(historyEntry),
  };
}

function normalizeWatchPath(path: string): string {
  return path.trim().length > 0 ? path : UNKNOWN_INDEXED_SOURCE_WATCH_PATH;
}

function normalizeHistoryEntry(
  entry: IndexedSourceTaskHistoryEntry,
): IndexedSourceTaskHistoryEntry {
  return appendIndexedSourceTaskHistory([], entry, 1)[0] ?? entry;
}

function normalizeTaskInterval(
  startedAt: number,
  completedAt: number,
  now?: number,
): { startedAt: number; completedAt: number } {
  const clock = normalizeClock(now);
  const normalizedStartedAt = normalizeTaskTimestamp(
    startedAt,
    completedAt,
    clock,
  );
  const normalizedCompletedAt = Math.max(
    normalizedStartedAt,
    normalizeTaskTimestamp(completedAt, normalizedStartedAt, clock),
  );

  return {
    startedAt: normalizedStartedAt,
    completedAt: normalizedCompletedAt,
  };
}

function calculateDurationMs(timestamps: {
  startedAt: number;
  completedAt: number;
}): number {
  return Math.max(0, timestamps.completedAt - timestamps.startedAt);
}

function normalizeOptionalTaskTimestamp(
  value: number | undefined,
  now?: number,
): number | undefined {
  const timestamp = normalizeFiniteTimestamp(value);
  if (timestamp === undefined) return undefined;
  return Math.min(Math.max(0, timestamp), normalizeClock(now));
}

function normalizeTaskTimestamp(
  value: number,
  fallback: number,
  now: number,
): number {
  return Math.min(
    Math.max(
      0,
      normalizeFiniteTimestamp(value) ??
        normalizeFiniteTimestamp(fallback) ??
        now,
    ),
    now,
  );
}

function normalizeTaskCount(value: number | undefined): number {
  return normalizeOptionalTaskCount(value) ?? 0;
}

function normalizeOptionalTaskCount(
  value: number | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizeOptionalTaskText(
  value: string | undefined,
): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function withTaskAuditSummary(
  summary: IndexedSourceTaskHistoryEntry["summary"],
  audit: {
    durationMs: number;
    reason?: string;
    trigger?: string;
    attempt?: number;
    errorCode?: string;
    errorMessage?: string;
  },
): IndexedSourceTaskHistoryEntry["summary"] {
  return {
    durationMs: audit.durationMs,
    ...(audit.reason ? { reason: audit.reason } : {}),
    ...(audit.trigger ? { trigger: audit.trigger } : {}),
    ...(audit.attempt !== undefined ? { attempt: audit.attempt } : {}),
    ...(summary ?? {}),
    ...(audit.errorCode ? { errorCode: audit.errorCode } : {}),
    ...(audit.errorMessage ? { errorMessage: audit.errorMessage } : {}),
  };
}

function normalizeClock(now: number | undefined): number {
  return (
    normalizeFiniteTimestamp(now) ?? normalizeFiniteTimestamp(Date.now()) ?? 0
  );
}

function normalizeFiniteTimestamp(
  value: number | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
