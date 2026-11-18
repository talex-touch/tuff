import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import { and, asc, desc, eq, gt, inArray, lt, or } from 'drizzle-orm'
import { scheduleDbWrite } from '../../../db/db-write'
import { intelligenceAuditLogs } from '../../../db/schema'

export const AUDIT_RETENTION_TASK_ID = 'intelligence-audit.retention'
export const AUDIT_RETENTION_MAX_ROWS = 25_000
export const AUDIT_RETENTION_DAYS = 14
export const AUDIT_RETENTION_INTERVAL_MS = 15 * 60 * 1000
export const AUDIT_RETENTION_MIN_DELAY_MS = 90_000
export const AUDIT_RETENTION_BATCH_SIZE = 500
export const AUDIT_RETENTION_MAX_BATCHES_PER_RUN = 20
export const AUDIT_AGE_PAGE_MAX_BATCH_SIZE = 200
export const AUDIT_EXCESS_DELETE_VACUUM_THRESHOLD = 500
export const AUDIT_INCREMENTAL_VACUUM_PAGES = 64

export interface AuditDetailPolicyEntry {
  capabilityId: string
  caller?: string | null
}

/**
 * Decides whether a single invocation should append a detail row into
 * `intelligence_audit_logs`. High-frequency background file embedding calls
 * still emit count-only ledger updates (`detail: false`), preventing hundreds
 * of thousands of redundant rows while preserving usage accounting.
 */
export function shouldPersistAuditDetail(
  auditEnabled: boolean,
  entry: AuditDetailPolicyEntry
): boolean {
  if (!auditEnabled) return false
  if (entry.capabilityId === 'embedding.generate' && entry.caller === 'core.files.embedding') {
    return false
  }
  return true
}

export interface AuditRetentionCursor {
  readonly timestampMs: number
  readonly id: number
}

export interface AuditRetentionPageResult {
  deletedCount: number
  hasMore: boolean
  cancelled: boolean
  cursor?: AuditRetentionCursor
}

export interface AuditExcessDetailPageResult {
  deletedCount: number
  hasMore: boolean
  cancelled: boolean
}

export interface AuditExcessDetailBatchResult extends AuditExcessDetailPageResult {
  lastId?: number
}

export type ExcessDetailKeepBoundary =
  | { readonly mode: 'empty' }
  | { readonly mode: 'delete-all' }
  | { readonly mode: 'below-id'; readonly keepFloorId: number }

export interface AuditRetentionRunOptions {
  maxRows?: number
  retentionDays?: number
  batchSize?: number
  maxBatches?: number
  signal?: AbortSignal
  requireBackfillSettled?: boolean
}

export interface AuditRetentionRunResult {
  deletedAge: number
  deletedExcess: number
}

type AuditDb = LibSQLDatabase<typeof schema>

/**
 * Deletes a single primary-key-ordered page of audit detail rows older than `cutoffMs`.
 */
export async function cleanupAuditRetentionPage(options: {
  db: AuditDb
  cutoffMs: number
  batchSize: number
  signal: AbortSignal
  cursor?: AuditRetentionCursor
  admissionFloorMs?: number
  beforeQuery?: (cutoffMs: number, admissionFloorMs: number) => Promise<void>
}): Promise<AuditRetentionPageResult> {
  const { db, cutoffMs, batchSize, signal, cursor, beforeQuery } = options
  const admissionFloorMs = options.admissionFloorMs ?? cutoffMs
  if (
    !Number.isSafeInteger(cutoffMs) ||
    !Number.isSafeInteger(admissionFloorMs) ||
    !Number.isFinite(batchSize)
  ) {
    throw new Error('INTELLIGENCE_AUDIT_RETENTION_INVALID')
  }

  if (beforeQuery) {
    await beforeQuery(cutoffMs, admissionFloorMs)
  }
  if (signal.aborted) {
    return { deletedCount: 0, hasMore: false, cancelled: true }
  }

  const limit = Math.min(AUDIT_AGE_PAGE_MAX_BATCH_SIZE, Math.max(1, Math.floor(batchSize)))
  const cursorCondition = cursor
    ? or(
        gt(intelligenceAuditLogs.timestamp, cursor.timestampMs),
        and(
          eq(intelligenceAuditLogs.timestamp, cursor.timestampMs),
          gt(intelligenceAuditLogs.id, cursor.id)
        )
      )
    : undefined
  const candidates = await db
    .select({ id: intelligenceAuditLogs.id, timestamp: intelligenceAuditLogs.timestamp })
    .from(intelligenceAuditLogs)
    .where(and(lt(intelligenceAuditLogs.timestamp, cutoffMs), cursorCondition))
    .orderBy(asc(intelligenceAuditLogs.timestamp), asc(intelligenceAuditLogs.id))
    .limit(limit + 1)

  const page = candidates.slice(0, limit)
  const ids = page.map((row) => row.id)
  if (ids.length === 0) {
    return { deletedCount: 0, hasMore: false, cancelled: false, cursor }
  }
  if (signal.aborted) {
    return { deletedCount: 0, hasMore: false, cancelled: true, cursor }
  }

  const result = await scheduleDbWrite(
    'intelligence.audit.retention',
    () =>
      db
        .delete(intelligenceAuditLogs)
        .where(
          and(inArray(intelligenceAuditLogs.id, ids), lt(intelligenceAuditLogs.timestamp, cutoffMs))
        ),
    {
      priority: 'background',
      dropPolicy: 'none',
      maxQueueWaitMs: 15_000
    }
  )
  const last = page.at(-1)
  return {
    deletedCount: Number(result.rowsAffected ?? 0),
    hasMore: candidates.length > limit,
    cancelled: false,
    cursor: last ? { timestampMs: last.timestamp, id: last.id } : cursor
  }
}

/**
 * Resolves the minimum surviving primary key (`keepFloorId`) once per retention pass so
 * batched excess cleanup avoids repeating `ORDER BY id DESC LIMIT 1 OFFSET N` on every page.
 */
export async function resolveExcessDetailKeepBoundary(
  db: AuditDb,
  maxRows: number
): Promise<ExcessDetailKeepBoundary> {
  const safeMaxRows = Math.max(0, Math.floor(maxRows))
  if (safeMaxRows === 0) {
    return { mode: 'delete-all' }
  }

  const boundaryRows = await db
    .select({ id: intelligenceAuditLogs.id })
    .from(intelligenceAuditLogs)
    .orderBy(desc(intelligenceAuditLogs.id))
    .limit(1)
    .offset(safeMaxRows - 1)
  const keepFloorId = boundaryRows[0]?.id
  if (keepFloorId === undefined) {
    return { mode: 'empty' }
  }
  return { mode: 'below-id', keepFloorId }
}

/**
 * Deletes one bounded primary-key page of excess audit detail rows below `boundary`.
 */
export async function cleanupExcessAuditDetailPage(options: {
  db: AuditDb
  maxRows?: number
  batchSize?: number
  signal?: AbortSignal
  boundary?: ExcessDetailKeepBoundary
  afterId?: number
}): Promise<AuditExcessDetailBatchResult> {
  const {
    db,
    maxRows = AUDIT_RETENTION_MAX_ROWS,
    batchSize = AUDIT_RETENTION_BATCH_SIZE,
    signal,
    afterId
  } = options
  const limit = Math.min(AUDIT_RETENTION_BATCH_SIZE, Math.max(1, Math.floor(batchSize)))
  if (signal?.aborted) {
    return { deletedCount: 0, hasMore: false, cancelled: true }
  }

  const boundary = options.boundary ?? (await resolveExcessDetailKeepBoundary(db, maxRows))
  if (boundary.mode === 'empty') {
    return { deletedCount: 0, hasMore: false, cancelled: false }
  }
  if (signal?.aborted) {
    return { deletedCount: 0, hasMore: false, cancelled: true }
  }

  const conditions = []
  if (boundary.mode === 'below-id') {
    conditions.push(lt(intelligenceAuditLogs.id, boundary.keepFloorId))
  }
  if (afterId !== undefined) {
    conditions.push(gt(intelligenceAuditLogs.id, afterId))
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const oldest = await db
    .select({ id: intelligenceAuditLogs.id })
    .from(intelligenceAuditLogs)
    .where(whereClause)
    .orderBy(asc(intelligenceAuditLogs.id))
    .limit(limit + 1)
  const hasMore = oldest.length > limit
  const ids = oldest.slice(0, limit).map((row) => row.id)

  if (ids.length === 0) {
    return { deletedCount: 0, hasMore: false, cancelled: false }
  }
  if (signal?.aborted) {
    return { deletedCount: 0, hasMore: false, cancelled: true }
  }

  const result = await scheduleDbWrite(
    'intelligence.audit.retention.cap',
    () => db.delete(intelligenceAuditLogs).where(inArray(intelligenceAuditLogs.id, ids)),
    {
      priority: 'background',
      dropPolicy: 'none',
      maxQueueWaitMs: 15_000
    }
  )
  return {
    deletedCount: Number(result.rowsAffected ?? 0),
    hasMore,
    cancelled: false,
    lastId: ids[ids.length - 1]
  }
}

/**
 * Executes a bounded automatic retention pass across age-expired and above-cap rows.
 * Computes `keepFloorId` once for all excess-cleanup batches in the pass and optionally
 * triggers bounded incremental vacuum after large deletes.
 */
export async function runBoundedAuditRetention(options: {
  db: AuditDb
  isBackfillSettled: () => boolean
  cleanupAgePage: (
    cutoffMs: number,
    batchSize: number,
    signal: AbortSignal,
    cursor?: AuditRetentionCursor
  ) => Promise<AuditRetentionPageResult>
  reclaimFreePages?: () => Promise<number>
  runOptions?: AuditRetentionRunOptions
}): Promise<AuditRetentionRunResult> {
  const { db, isBackfillSettled, cleanupAgePage, reclaimFreePages, runOptions } = options
  if (runOptions?.requireBackfillSettled !== false && !isBackfillSettled()) {
    return { deletedAge: 0, deletedExcess: 0 }
  }

  const maxRows = runOptions?.maxRows ?? AUDIT_RETENTION_MAX_ROWS
  const retentionDays = runOptions?.retentionDays ?? AUDIT_RETENTION_DAYS
  const batchSize = runOptions?.batchSize ?? AUDIT_RETENTION_BATCH_SIZE
  const maxBatches = runOptions?.maxBatches ?? AUDIT_RETENTION_MAX_BATCHES_PER_RUN
  const signal = runOptions?.signal ?? new AbortController().signal

  let deletedAge = 0
  let deletedExcess = 0
  let remainingBatches = Math.max(1, Math.floor(maxBatches))

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let ageCursor: AuditRetentionCursor | undefined
  let hasMoreAge = true
  while (hasMoreAge && remainingBatches > 0 && !signal.aborted) {
    const page = await cleanupAgePage(
      cutoffMs,
      Math.min(AUDIT_AGE_PAGE_MAX_BATCH_SIZE, batchSize),
      signal,
      ageCursor
    )
    deletedAge += page.deletedCount
    ageCursor = page.cursor ?? ageCursor
    hasMoreAge = page.hasMore && page.deletedCount > 0 && !page.cancelled
    remainingBatches -= 1
  }

  if (remainingBatches > 0 && !signal.aborted) {
    const boundary = await resolveExcessDetailKeepBoundary(db, maxRows)
    if (boundary.mode !== 'empty') {
      let afterId: number | undefined
      let hasMoreExcess = true
      while (hasMoreExcess && remainingBatches > 0 && !signal.aborted) {
        const page = await cleanupExcessAuditDetailPage({
          db,
          maxRows,
          batchSize,
          signal,
          boundary,
          afterId
        })
        deletedExcess += page.deletedCount
        afterId = page.lastId ?? afterId
        hasMoreExcess = page.hasMore && page.deletedCount > 0 && !page.cancelled
        remainingBatches -= 1
      }
    }
  }

  if (
    deletedAge + deletedExcess >= AUDIT_EXCESS_DELETE_VACUUM_THRESHOLD &&
    !signal.aborted &&
    reclaimFreePages
  ) {
    try {
      await reclaimFreePages()
    } catch {
      // Best-effort freelist reclamation must never fail retention.
    }
  }

  return { deletedAge, deletedExcess }
}
