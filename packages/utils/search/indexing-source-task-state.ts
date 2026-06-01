import type {
  IndexedSourceDeltaAction,
  IndexedSourceDiagnostics,
  IndexedSourceResetReason,
  IndexedSourceTaskHistoryEntry
} from './indexing-source'
import type { IndexedSourceRuntimeTaskJob } from './indexing-source-runtime-task-job'
import {
  appendIndexedSourceTaskHistory,
  DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT
} from './indexing-source'

export type IndexedSourceRuntimeTaskState = Pick<
  IndexedSourceDiagnostics,
  'lastScan' | 'lastWatch' | 'lastReconcile' | 'lastReset' | 'recentTasks'
>

export type IndexedSourceRuntimeTaskStateKey = Exclude<
  keyof IndexedSourceRuntimeTaskState,
  'recentTasks'
>

export interface IndexedSourceTaskStateUpdateInput<
  TKey extends IndexedSourceRuntimeTaskStateKey
> {
  state: IndexedSourceRuntimeTaskState
  key: TKey
  value: NonNullable<IndexedSourceRuntimeTaskState[TKey]>
  historyEntry: IndexedSourceTaskHistoryEntry
  historyLimit?: number
}

export interface IndexedSourceScanTaskStateInput {
  sourceId: string
  startedAt: number
  completedAt: number
  batches?: number
  records?: number
  status?: Extract<IndexedSourceTaskHistoryEntry['status'], 'succeeded' | 'failed' | 'skipped'>
  error?: string
  skipReason?: string
  job?: IndexedSourceRuntimeTaskJob
}

export interface IndexedSourceScanTaskState {
  sourceId: string
  key: 'lastScan'
  value: NonNullable<IndexedSourceRuntimeTaskState['lastScan']>
  historyEntry: IndexedSourceTaskHistoryEntry
}

export interface IndexedSourceWatchTaskStateInput {
  sourceId: string
  occurredAt: number
  completedAt: number
  action: IndexedSourceDeltaAction
  path: string
  deltas?: number
  appliedDeltas?: number
  failedDeltas?: number
  status?: Extract<IndexedSourceTaskHistoryEntry['status'], 'succeeded' | 'failed' | 'skipped'>
  error?: string
  skipReason?: string
  job?: IndexedSourceRuntimeTaskJob
  summary?: IndexedSourceTaskHistoryEntry['summary']
}

export interface IndexedSourceWatchTaskState {
  sourceId: string
  key: 'lastWatch'
  value: NonNullable<IndexedSourceRuntimeTaskState['lastWatch']>
  historyEntry: IndexedSourceTaskHistoryEntry
}

export interface IndexedSourceReconcileTaskStateInput {
  sourceId: string
  startedAt: number
  completedAt: number
  added?: number
  changed?: number
  deleted?: number
  skipped?: number
  errors?: number
  reason?: string
  rootCount?: number
  deltas?: number
  appliedDeltas?: number
  failedDeltas?: number
  status?: Extract<IndexedSourceTaskHistoryEntry['status'], 'succeeded' | 'failed' | 'skipped'>
  error?: string
  skipReason?: string
  job?: IndexedSourceRuntimeTaskJob
  summary?: IndexedSourceTaskHistoryEntry['summary']
}

export interface IndexedSourceReconcileTaskState {
  sourceId: string
  key: 'lastReconcile'
  value: NonNullable<IndexedSourceRuntimeTaskState['lastReconcile']>
  historyEntry: IndexedSourceTaskHistoryEntry
}

export interface IndexedSourceResetTaskStateInput {
  sourceId: string
  startedAt: number
  completedAt: number
  reason: IndexedSourceResetReason
  clearedSearchIndex: boolean
  clearedScanProgress: boolean
  scanProgressRows?: number
  error?: string
  job?: IndexedSourceRuntimeTaskJob
}

export interface IndexedSourceResetTaskState {
  sourceId: string
  key: 'lastReset'
  value: NonNullable<IndexedSourceRuntimeTaskState['lastReset']>
  historyEntry: IndexedSourceTaskHistoryEntry
}

export function updateIndexedSourceTaskState<
  TKey extends IndexedSourceRuntimeTaskStateKey
>(
  input: IndexedSourceTaskStateUpdateInput<TKey>
): IndexedSourceRuntimeTaskState {
  const historyLimit = input.historyLimit ?? DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT
  return {
    ...input.state,
    [input.key]: input.value,
    recentTasks: appendIndexedSourceTaskHistory(
      input.state.recentTasks,
      input.historyEntry,
      historyLimit
    )
  }
}

export function buildIndexedSourceScanTaskState(
  input: IndexedSourceScanTaskStateInput
): IndexedSourceScanTaskState {
  const status = input.status ?? 'succeeded'
  const error = status === 'skipped' ? `skipped:${input.skipReason ?? input.error ?? 'unknown'}` : input.error
  const batches = input.batches ?? 0
  const records = input.records ?? 0
  const value = {
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    batches,
    records,
    error
  }
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: 'scan',
    status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    error,
    summary:
      status === 'succeeded'
        ? {
            batches,
            records
          }
        : undefined
  }

  return {
    sourceId: input.sourceId,
    key: 'lastScan',
    value,
    historyEntry
  }
}

export function buildIndexedSourceReconcileTaskState(
  input: IndexedSourceReconcileTaskStateInput
): IndexedSourceReconcileTaskState {
  const status = input.status ?? 'succeeded'
  const error = status === 'skipped' ? `skipped:${input.skipReason ?? input.error ?? 'unknown'}` : input.error
  const added = input.added ?? 0
  const changed = input.changed ?? 0
  const deleted = input.deleted ?? 0
  const skipped = input.skipped ?? 0
  const errors = input.errors ?? 0
  const value = {
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    added,
    changed,
    deleted,
    skipped,
    errors,
    reason: input.reason,
    rootCount: input.rootCount,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    deltas: input.deltas,
    appliedDeltas: input.appliedDeltas,
    failedDeltas: input.failedDeltas,
    error
  }
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: 'reconcile',
    status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    error,
    summary: input.summary
  }

  return {
    sourceId: input.sourceId,
    key: 'lastReconcile',
    value,
    historyEntry
  }
}

export function buildIndexedSourceWatchTaskState(
  input: IndexedSourceWatchTaskStateInput
): IndexedSourceWatchTaskState {
  const status = input.status ?? 'succeeded'
  const error = status === 'skipped' ? `skipped:${input.skipReason ?? input.error ?? 'unknown'}` : input.error
  const deltas = input.deltas ?? 0
  const appliedDeltas = input.appliedDeltas ?? 0
  const failedDeltas = input.failedDeltas ?? 0
  const value = {
    occurredAt: input.occurredAt,
    completedAt: input.completedAt,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    action: input.action,
    path: input.path,
    deltas,
    appliedDeltas,
    failedDeltas,
    error
  }
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: 'watch',
    status,
    occurredAt: input.occurredAt,
    completedAt: input.completedAt,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    error,
    summary:
      input.summary ??
      {
        action: input.action,
        deltas,
        appliedDeltas,
        failedDeltas
      }
  }

  return {
    sourceId: input.sourceId,
    key: 'lastWatch',
    value,
    historyEntry
  }
}

export function buildIndexedSourceResetTaskState(
  input: IndexedSourceResetTaskStateInput
): IndexedSourceResetTaskState {
  const value = {
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    reason: input.reason,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    clearedSearchIndex: input.clearedSearchIndex,
    clearedScanProgress: input.clearedScanProgress,
    scanProgressRows: input.scanProgressRows,
    error: input.error
  }
  const historyEntry: IndexedSourceTaskHistoryEntry = {
    kind: 'reset',
    status: input.error ? 'failed' : 'succeeded',
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    jobId: input.job?.id,
    queuedAt: input.job?.queuedAt,
    error: input.error,
    summary: {
      reason: input.reason,
      clearedSearchIndex: input.clearedSearchIndex,
      clearedScanProgress: input.clearedScanProgress,
      scanProgressRows: input.scanProgressRows
    }
  }

  return {
    sourceId: input.sourceId,
    key: 'lastReset',
    value,
    historyEntry
  }
}
