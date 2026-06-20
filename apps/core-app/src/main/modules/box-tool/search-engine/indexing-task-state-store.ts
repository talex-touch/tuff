import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  IndexedSourceDeltaAction,
  IndexedSourceResetReason,
  IndexedSourceTaskHistoryEntry,
  IndexedSourceRuntimeTaskState
} from '@talex-touch/utils/search'
import {
  DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT,
  IndexedSourceResetReasons
} from '@talex-touch/utils/search'
import { eq, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'

const taskHistoryKinds = new Set<IndexedSourceTaskHistoryEntry['kind']>([
  'scan',
  'watch',
  'reconcile',
  'reset'
])
const taskHistoryStatuses = new Set<IndexedSourceTaskHistoryEntry['status']>([
  'succeeded',
  'failed',
  'skipped'
])
const deltaActions = new Set<IndexedSourceDeltaAction>(['add', 'change', 'delete'])
const resetReasons = new Set<IndexedSourceResetReason>([
  IndexedSourceResetReasons.ManualRebuild,
  IndexedSourceResetReasons.SchemaMigration,
  IndexedSourceResetReasons.IntegrityRepair,
  IndexedSourceResetReasons.HealthRepair,
  IndexedSourceResetReasons.UserClear
])

export interface IndexingTaskStateStore {
  load(sourceId: string): Promise<IndexedSourceRuntimeTaskState | undefined>
  save(sourceId: string, state: IndexedSourceRuntimeTaskState): Promise<void>
  delete(sourceId: string): Promise<void>
  clear(): Promise<void>
}

export class MemoryIndexingTaskStateStore implements IndexingTaskStateStore {
  private readonly states = new Map<string, IndexedSourceRuntimeTaskState>()

  async load(sourceId: string): Promise<IndexedSourceRuntimeTaskState | undefined> {
    return cloneTaskState(this.states.get(sourceId))
  }

  async save(sourceId: string, state: IndexedSourceRuntimeTaskState): Promise<void> {
    this.states.set(sourceId, sanitizeTaskState(state) ?? {})
  }

  async delete(sourceId: string): Promise<void> {
    this.states.delete(sourceId)
  }

  async clear(): Promise<void> {
    this.states.clear()
  }
}

export class SqliteIndexingTaskStateStore implements IndexingTaskStateStore {
  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async load(sourceId: string): Promise<IndexedSourceRuntimeTaskState | undefined> {
    await this.ensureReady()
    const row = await this.db
      .select({ stateJson: schema.indexedSourceTaskState.stateJson })
      .from(schema.indexedSourceTaskState)
      .where(eq(schema.indexedSourceTaskState.sourceId, sourceId))
      .limit(1)

    return row[0] ? parseTaskState(row[0].stateJson) : undefined
  }

  async save(sourceId: string, state: IndexedSourceRuntimeTaskState): Promise<void> {
    const stateJson = JSON.stringify(sanitizeTaskState(state) ?? {})
    const updatedAt = new Date()
    await dbWriteScheduler.schedule(
      'indexing.task-state.save',
      () =>
        withSqliteRetry(
          async () => {
            await this.ensureReady()
            await this.db
              .insert(schema.indexedSourceTaskState)
              .values({
                sourceId,
                stateJson,
                updatedAt
              })
              .onConflictDoUpdate({
                target: schema.indexedSourceTaskState.sourceId,
                set: {
                  stateJson,
                  updatedAt
                }
              })
          },
          { label: 'indexing.task-state.save' }
        ),
      {
        priority: 'best_effort',
        dropPolicy: 'latest_wins',
        budgetKey: sourceId,
        maxQueueWaitMs: 10_000
      }
    )
  }

  async delete(sourceId: string): Promise<void> {
    await dbWriteScheduler.schedule(
      'indexing.task-state.delete',
      () =>
        withSqliteRetry(
          async () => {
            await this.ensureReady()
            await this.db
              .delete(schema.indexedSourceTaskState)
              .where(eq(schema.indexedSourceTaskState.sourceId, sourceId))
          },
          { label: 'indexing.task-state.delete' }
        ),
      { priority: 'best_effort', maxQueueWaitMs: 10_000 }
    )
  }

  async clear(): Promise<void> {
    await dbWriteScheduler.schedule(
      'indexing.task-state.clear',
      () =>
        withSqliteRetry(
          async () => {
            await this.ensureReady()
            await this.db.delete(schema.indexedSourceTaskState)
          },
          { label: 'indexing.task-state.clear' }
        ),
      { priority: 'best_effort', maxQueueWaitMs: 10_000 }
    )
  }

  private async ensureReady(): Promise<void> {
    await this.db.run(sql`
      CREATE TABLE IF NOT EXISTS indexed_source_task_state (
        source_id text PRIMARY KEY NOT NULL,
        state_json text NOT NULL,
        updated_at integer NOT NULL
      )
    `)
    await this.db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_indexed_source_task_state_updated_at
      ON indexed_source_task_state (updated_at)
    `)
  }
}

function cloneTaskState(
  state: IndexedSourceRuntimeTaskState | undefined
): IndexedSourceRuntimeTaskState | undefined {
  if (!state) return undefined
  const cloned: IndexedSourceRuntimeTaskState = { ...state }
  if (state.lastScan) {
    cloned.lastScan = { ...state.lastScan }
  }
  if (state.lastWatch) {
    cloned.lastWatch = { ...state.lastWatch }
  }
  if (state.lastReconcile) {
    cloned.lastReconcile = { ...state.lastReconcile }
  }
  if (state.lastReset) {
    cloned.lastReset = { ...state.lastReset }
  }
  if (state.recentTasks) {
    cloned.recentTasks = state.recentTasks.map(cloneTaskHistoryEntry)
  }
  return cloned
}

function parseTaskState(value: string): IndexedSourceRuntimeTaskState | undefined {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }
    return sanitizeTaskState(parsed)
  } catch {
    return undefined
  }
}

function sanitizeTaskState(value: unknown): IndexedSourceRuntimeTaskState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const input = value as IndexedSourceRuntimeTaskState
  const now = normalizePersistedClock()
  const recentTasks = sanitizeRecentTasks(input.recentTasks, now)
  const state: IndexedSourceRuntimeTaskState = {}

  const lastScan = sanitizeLastScan(input.lastScan, now)
  if (lastScan) {
    state.lastScan = lastScan
  }
  const lastWatch = sanitizeLastWatch(input.lastWatch, now)
  if (lastWatch) {
    state.lastWatch = lastWatch
  }
  const lastReconcile = sanitizeLastReconcile(input.lastReconcile, now)
  if (lastReconcile) {
    state.lastReconcile = lastReconcile
  }
  const lastReset = sanitizeLastReset(input.lastReset, now)
  if (lastReset) {
    state.lastReset = lastReset
  }
  if (recentTasks.length > 0) {
    state.recentTasks = recentTasks
  }

  return Object.keys(state).length > 0 ? state : undefined
}

function sanitizeLastScan(
  value: unknown,
  now: number
): NonNullable<IndexedSourceRuntimeTaskState['lastScan']> | undefined {
  if (!isObject(value)) return undefined
  const interval = sanitizeTaskInterval(value.startedAt, value.completedAt, now)
  if (!interval) return undefined
  return {
    startedAt: interval.startedAt,
    completedAt: interval.completedAt,
    ...optionalString('jobId', value.jobId),
    ...optionalTimestamp('queuedAt', value.queuedAt, now),
    batches: nonNegativeFiniteNumberOrZero(value.batches),
    records: nonNegativeFiniteNumberOrZero(value.records),
    indexedRecords: nonNegativeFiniteNumberOrZero(value.indexedRecords),
    ...optionalString('phase', value.phase),
    ...optionalString('error', value.error)
  }
}

function sanitizeLastWatch(
  value: unknown,
  now: number
): NonNullable<IndexedSourceRuntimeTaskState['lastWatch']> | undefined {
  if (!isObject(value)) return undefined
  const interval = sanitizeTaskInterval(value.occurredAt, value.completedAt, now)
  if (!interval) return undefined
  if (!deltaActions.has(value.action as IndexedSourceDeltaAction)) return undefined
  if (typeof value.path !== 'string' || value.path.trim().length === 0) return undefined
  return {
    occurredAt: interval.startedAt,
    completedAt: interval.completedAt,
    ...optionalString('jobId', value.jobId),
    ...optionalTimestamp('queuedAt', value.queuedAt, now),
    action: value.action as IndexedSourceDeltaAction,
    path: value.path,
    deltas: nonNegativeFiniteNumberOrZero(value.deltas),
    appliedDeltas: nonNegativeFiniteNumberOrZero(value.appliedDeltas),
    failedDeltas: nonNegativeFiniteNumberOrZero(value.failedDeltas),
    ...optionalNonNegativeNumber('skippedDeltas', value.skippedDeltas),
    ...optionalString('error', value.error)
  }
}

function sanitizeLastReconcile(
  value: unknown,
  now: number
): NonNullable<IndexedSourceRuntimeTaskState['lastReconcile']> | undefined {
  if (!isObject(value)) return undefined
  const interval = sanitizeTaskInterval(value.startedAt, value.completedAt, now)
  if (!interval) return undefined
  return {
    startedAt: interval.startedAt,
    completedAt: interval.completedAt,
    added: nonNegativeFiniteNumberOrZero(value.added),
    changed: nonNegativeFiniteNumberOrZero(value.changed),
    deleted: nonNegativeFiniteNumberOrZero(value.deleted),
    skipped: nonNegativeFiniteNumberOrZero(value.skipped),
    errors: nonNegativeFiniteNumberOrZero(value.errors),
    ...optionalString('reason', value.reason),
    ...optionalNonNegativeNumber('rootCount', value.rootCount),
    ...optionalString('jobId', value.jobId),
    ...optionalTimestamp('queuedAt', value.queuedAt, now),
    ...optionalNonNegativeNumber('deltas', value.deltas),
    ...optionalNonNegativeNumber('appliedDeltas', value.appliedDeltas),
    ...optionalNonNegativeNumber('failedDeltas', value.failedDeltas),
    ...optionalNonNegativeNumber('skippedDeltas', value.skippedDeltas),
    ...optionalString('error', value.error)
  }
}

function sanitizeLastReset(
  value: unknown,
  now: number
): NonNullable<IndexedSourceRuntimeTaskState['lastReset']> | undefined {
  if (!isObject(value)) return undefined
  const interval = sanitizeTaskInterval(value.startedAt, value.completedAt, now)
  if (!interval) return undefined
  if (!resetReasons.has(value.reason as IndexedSourceResetReason)) return undefined
  if (typeof value.clearedSearchIndex !== 'boolean') return undefined
  if (typeof value.clearedScanProgress !== 'boolean') return undefined
  return {
    startedAt: interval.startedAt,
    completedAt: interval.completedAt,
    reason: value.reason as IndexedSourceResetReason,
    ...optionalString('jobId', value.jobId),
    ...optionalTimestamp('queuedAt', value.queuedAt, now),
    clearedSearchIndex: value.clearedSearchIndex,
    ...optionalNonNegativeNumber('clearedSearchIndexRows', value.clearedSearchIndexRows),
    clearedScanProgress: value.clearedScanProgress,
    ...optionalNonNegativeNumber('scanProgressRows', value.scanProgressRows),
    ...optionalString('error', value.error)
  }
}

function sanitizeRecentTasks(value: unknown, now: number): IndexedSourceTaskHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isTaskHistoryEntry)
    .map((task) => sanitizeTaskHistoryEntry(task, now))
    .filter((task): task is IndexedSourceTaskHistoryEntry => Boolean(task))
    .sort((left, right) => right.completedAt - left.completedAt)
    .slice(0, DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT)
    .map(cloneTaskHistoryEntry)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonNegativeFiniteNumberOrZero(value: unknown): number {
  return isFiniteNumber(value) && value >= 0 ? value : 0
}

function optionalNonNegativeNumber<TKey extends string>(
  key: TKey,
  value: unknown
): Partial<Record<TKey, number>> {
  return isFiniteNumber(value) && value >= 0 ? ({ [key]: value } as Record<TKey, number>) : {}
}

function optionalTimestamp<TKey extends string>(
  key: TKey,
  value: unknown,
  now: number
): Partial<Record<TKey, number>> {
  const timestamp = sanitizeTaskTimestamp(value, now)
  return timestamp === undefined ? {} : ({ [key]: timestamp } as Record<TKey, number>)
}

function optionalString<TKey extends string>(
  key: TKey,
  value: unknown
): Partial<Record<TKey, string>> {
  return typeof value === 'string' ? ({ [key]: value } as Record<TKey, string>) : {}
}

function isTaskHistoryEntry(value: unknown): value is IndexedSourceTaskHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<IndexedSourceTaskHistoryEntry>
  return (
    typeof task.completedAt === 'number' &&
    Number.isFinite(task.completedAt) &&
    taskHistoryKinds.has(task.kind as IndexedSourceTaskHistoryEntry['kind']) &&
    taskHistoryStatuses.has(task.status as IndexedSourceTaskHistoryEntry['status'])
  )
}

function sanitizeTaskHistoryEntry(
  task: IndexedSourceTaskHistoryEntry,
  now: number
): IndexedSourceTaskHistoryEntry | undefined {
  const completedAt = sanitizeTaskHistoryCompletedAt(task.completedAt, now)
  if (completedAt === undefined) return undefined

  const startedAt = sanitizeTaskStartedAt(task.startedAt, completedAt, now)
  const occurredAt = sanitizeTaskStartedAt(task.occurredAt, completedAt, now)
  const {
    completedAt: _completedAt,
    queuedAt: _queuedAt,
    startedAt: _startedAt,
    occurredAt: _occurredAt,
    ...rest
  } = task

  return {
    ...rest,
    completedAt,
    ...optionalTaskHistorySummary(task.summary),
    ...(task.queuedAt === undefined ? {} : optionalTimestamp('queuedAt', task.queuedAt, now)),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(occurredAt === undefined ? {} : { occurredAt })
  }
}

function cloneTaskHistoryEntry(task: IndexedSourceTaskHistoryEntry): IndexedSourceTaskHistoryEntry {
  return {
    ...task,
    ...optionalTaskHistorySummary(task.summary)
  }
}

function optionalTaskHistorySummary(
  value: unknown
): Partial<Pick<IndexedSourceTaskHistoryEntry, 'summary'>> {
  if (!isObject(value)) return {}

  const summary: NonNullable<IndexedSourceTaskHistoryEntry['summary']> = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      item === undefined ||
      (typeof item === 'number' && Number.isFinite(item))
    ) {
      summary[key] = item
    }
  }

  return Object.keys(summary).length > 0 ? { summary } : {}
}

function sanitizeTaskInterval(
  startedAt: unknown,
  completedAt: unknown,
  now: number
): { startedAt: number; completedAt: number } | undefined {
  const completed = sanitizeTaskTimestamp(completedAt, now)
  const started = sanitizeTaskStartedAt(startedAt, completed, now)
  if (completed === undefined || started === undefined) return undefined

  return {
    startedAt: started,
    completedAt: Math.max(started, completed)
  }
}

function sanitizeTaskStartedAt(
  value: unknown,
  completedAt: number | undefined,
  now: number
): number | undefined {
  const timestamp = sanitizeTaskTimestamp(value, now)
  if (timestamp === undefined || completedAt === undefined) return timestamp
  return Math.min(timestamp, completedAt)
}

function sanitizeTaskTimestamp(value: unknown, now: number): number | undefined {
  if (!isFiniteNumber(value)) return undefined
  return Math.min(Math.max(0, value), now)
}

function sanitizeTaskHistoryCompletedAt(value: unknown, now: number): number | undefined {
  if (!isFiniteNumber(value) || value < 0 || value > now) return undefined
  return value
}

function normalizePersistedClock(): number {
  const now = Date.now()
  return Number.isFinite(now) && now >= 0 ? now : 0
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
