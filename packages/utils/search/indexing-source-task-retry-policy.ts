import type {
  IndexedSourceTaskHistoryEntry,
  IndexedSourceTaskHistoryKind,
} from "./indexing-source";

export interface IndexedSourceTaskRetryPolicyOptions {
  now?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  failureWindowMs?: number;
}

export interface IndexedSourceTaskRetryDecision {
  allowed: boolean;
  reason: "allowed" | "retry-window";
  failedAttempts: number;
  lastFailedAt?: number;
  nextRetryAt?: number;
}

const DEFAULT_BASE_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 15 * 60_000;
const DEFAULT_FAILURE_WINDOW_MS = 60 * 60_000;

export function resolveIndexedSourceTaskRetryDecision(
  recentTasks: IndexedSourceTaskHistoryEntry[] | undefined,
  kind: IndexedSourceTaskHistoryKind,
  options: IndexedSourceTaskRetryPolicyOptions = {},
): IndexedSourceTaskRetryDecision {
  const now = normalizeClock(options.now);
  const baseDelayMs = normalizeDelay(
    options.baseDelayMs,
    DEFAULT_BASE_DELAY_MS,
  );
  const maxDelayMs = normalizeDelay(options.maxDelayMs, DEFAULT_MAX_DELAY_MS);
  const failureWindowMs = normalizeDelay(
    options.failureWindowMs,
    DEFAULT_FAILURE_WINDOW_MS,
  );
  const failures = collectRecentFailures(
    recentTasks,
    kind,
    now,
    failureWindowMs,
  );

  if (failures.length === 0) {
    return {
      allowed: true,
      reason: "allowed",
      failedAttempts: 0,
    };
  }

  const failedAttempts = failures.length;
  const lastFailedAt = failures.reduce(
    (latest, task) => Math.max(latest, task.completedAt),
    0,
  );
  const retryDelayMs = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, failedAttempts - 1),
  );
  const nextRetryAt = lastFailedAt + retryDelayMs;

  return {
    allowed: now >= nextRetryAt,
    reason: now >= nextRetryAt ? "allowed" : "retry-window",
    failedAttempts,
    lastFailedAt,
    nextRetryAt,
  };
}

function collectRecentFailures(
  recentTasks: IndexedSourceTaskHistoryEntry[] | undefined,
  kind: IndexedSourceTaskHistoryKind,
  now: number,
  failureWindowMs: number,
): IndexedSourceTaskHistoryEntry[] {
  if (!recentTasks?.length) {
    return [];
  }

  const failures: IndexedSourceTaskHistoryEntry[] = [];
  const latestSuccessAt = getLatestSuccessAt(recentTasks, kind, now);
  for (const task of recentTasks) {
    if (task.kind !== kind || task.status !== "failed") {
      continue;
    }
    if (!Number.isFinite(task.completedAt) || task.completedAt > now) {
      continue;
    }
    if (latestSuccessAt !== undefined && task.completedAt <= latestSuccessAt) {
      continue;
    }
    if (now - task.completedAt > failureWindowMs) {
      continue;
    }
    failures.push(task);
  }
  return failures;
}

function getLatestSuccessAt(
  recentTasks: IndexedSourceTaskHistoryEntry[],
  kind: IndexedSourceTaskHistoryKind,
  now: number,
): number | undefined {
  let latestSuccessAt: number | undefined;
  for (const task of recentTasks) {
    if (task.kind !== kind || task.status !== "succeeded") {
      continue;
    }
    if (!Number.isFinite(task.completedAt) || task.completedAt > now) {
      continue;
    }
    latestSuccessAt =
      latestSuccessAt === undefined
        ? task.completedAt
        : Math.max(latestSuccessAt, task.completedAt);
  }
  return latestSuccessAt;
}

function normalizeDelay(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0
    ? Math.floor(value)
    : fallback;
}

function normalizeClock(value: number | undefined): number {
  const clock = value ?? Date.now();
  return Number.isFinite(clock) && clock >= 0 ? Math.floor(clock) : 0;
}
