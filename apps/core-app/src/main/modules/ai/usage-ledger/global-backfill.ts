/**
 * One-shot backfill of the global usage bucket from detail rows (audit rebuild parent design §1.3).
 *
 * Protocol — `system_config['intelligence.usage.global-backfill']`:
 *
 *   { version: 1, cutoffMs, cutoffId, status: 'pending' | 'done', completedAt }
 *
 * 1. The marker is created before any live global increment: the first audit flush creates it in
 *    its own write transaction, ahead of inserting that batch's detail rows (or the backfill job
 *    creates it if it runs first). `cutoffId` is `MAX(intelligence_audit_logs.id)` at that moment.
 *    Ids are AUTOINCREMENT and never reused, so every row with `id <= cutoffId` predates live
 *    global counting and every later row was counted live. `cutoffMs` (process start) is recorded
 *    for diagnostics; the boundary itself is the id, which a clock change cannot move.
 * 2. In the background, after the startup write window, rows with `id <= cutoffId` (outer
 *    `agent.run` / `workflow.execute` rows excluded) are summed per local day. Rows priced against
 *    a models.dev catalog (`timestamp >= sinceMs`) keep their stored cost; older rows are re-priced
 *    with the current catalog.
 * 3. One write transaction adds the sums to the global day/month rows and flips the marker to
 *    `done`. Any failure rolls the whole transaction back; the next run repeats it with the same
 *    persisted `cutoffId`, so nothing is counted twice.
 *
 * Only rows still inside the detail retention can be backfilled; earlier days stay empty.
 *
 * Import rule: the audit logger imports this module statically, so pricing is loaded through a
 * dynamic `import()` (see `pricing/model-pricing.ts`).
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { UsageDelta } from './global-deltas'
import { and, eq, lte, notInArray, sql } from 'drizzle-orm'
import { scheduleDbWrite } from '../../../db/db-write'
import { intelligenceAuditLogs, systemConfig } from '../../../db/schema'
import { createLogger } from '../../../utils/logger'
import { databaseModule } from '../../database'
import {
  GLOBAL_BACKFILL_CONFIG_KEY,
  GLOBAL_USAGE_CALLER_ID,
  GLOBAL_USAGE_CALLER_TYPE,
  OUTER_GOVERNANCE_CAPABILITIES
} from './constants'
import { addUsageDelta, emptyUsageDelta } from './global-deltas'
import { dayPeriod, localDayKey, monthPeriod } from './local-period'
import { addToUsageBucket } from './usage-bucket'

const backfillLog = createLogger('Intelligence').child('UsageBackfill')

/**
 * Grouping grain. Every current UTC offset is a whole number of quarter hours, so a 15-minute UTC
 * slot never straddles a local midnight and its start names the local day of every row in it —
 * the local-day split stays in JS (`localDayKey`) instead of SQLite's `localtime`.
 */
const BACKFILL_SLOT_MS = 15 * 60 * 1000

export interface GlobalBackfillMarker {
  version: 1
  cutoffMs: number
  cutoffId: number
  status: 'pending' | 'done'
  completedAt: number | null
}

export type GlobalBackfillMarkerState =
  | { state: 'absent' }
  | { state: 'invalid' }
  | { state: 'valid'; marker: GlobalBackfillMarker }

type MarkerReader = Pick<LibSQLDatabase<typeof schema>, 'select'>
type MarkerWriter = Pick<LibSQLDatabase<typeof schema>, 'select' | 'insert'>

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function parseGlobalBackfillMarker(value: string): GlobalBackfillMarker | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const cutoffMs = finiteInteger(record.cutoffMs)
  const cutoffId = finiteInteger(record.cutoffId)
  const completedAt = record.completedAt === null ? null : finiteInteger(record.completedAt)
  if (
    record.version !== 1 ||
    cutoffMs === null ||
    cutoffId === null ||
    (record.status !== 'pending' && record.status !== 'done') ||
    (record.completedAt !== null && completedAt === null)
  ) {
    return null
  }
  return { version: 1, cutoffMs, cutoffId, status: record.status, completedAt }
}

export async function readGlobalBackfillMarker(
  db: MarkerReader
): Promise<GlobalBackfillMarkerState> {
  const rows = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, GLOBAL_BACKFILL_CONFIG_KEY))
    .limit(1)
  const row = rows[0]
  if (!row) return { state: 'absent' }
  const marker = parseGlobalBackfillMarker(row.value)
  return marker ? { state: 'valid', marker } : { state: 'invalid' }
}

/**
 * Creates the `pending` marker unless one exists. Call inside a write transaction, before that
 * transaction inserts any audit row: `cutoffId` must not cover rows that are counted live.
 */
export async function ensureGlobalBackfillMarker(
  tx: MarkerWriter,
  cutoffMs: number,
  now: number = Date.now()
): Promise<void> {
  const existing = await tx
    .select({ key: systemConfig.key })
    .from(systemConfig)
    .where(eq(systemConfig.key, GLOBAL_BACKFILL_CONFIG_KEY))
    .limit(1)
  if (existing.length > 0) return
  const [row] = await tx
    .select({ maxId: sql<number | null>`max(${intelligenceAuditLogs.id})` })
    .from(intelligenceAuditLogs)
  const marker: GlobalBackfillMarker = {
    version: 1,
    cutoffMs: Math.max(0, Math.floor(cutoffMs)),
    cutoffId: Math.max(0, Math.floor(Number(row?.maxId ?? 0))),
    status: 'pending',
    completedAt: null
  }
  await tx
    .insert(systemConfig)
    .values({ key: GLOBAL_BACKFILL_CONFIG_KEY, value: JSON.stringify(marker), updatedAt: now })
    // Insert-or-keep: a marker that already exists keeps its cutoff.
    .onConflictDoNothing({ target: systemConfig.key })
}

export interface GlobalBackfillPricing {
  /** `intelligence.pricing.models-dev.since`; null when no catalog has ever been available. */
  readSinceMs: () => Promise<number | null>
  estimateCostUsd: (input: {
    providerId: string
    model: string
    usage: { promptTokens: number; completionTokens: number }
  }) => number
}

/** Loads the pricing module (dynamically, see the header) with its stored catalog in memory. */
export async function loadGlobalBackfillPricing(): Promise<GlobalBackfillPricing> {
  const [catalog, pricing] = await Promise.all([
    import('../pricing/models-dev-catalog'),
    import('../pricing/model-pricing')
  ])
  await catalog.loadPricingCatalog()
  return {
    readSinceMs: () => catalog.readPricingSinceMs(),
    estimateCostUsd: (input) => pricing.estimateCostUsd(input)
  }
}

export type GlobalBackfillOutcome =
  /** This run added the history and marked the marker `done`. */
  | 'completed'
  /** Done before (by an earlier run or a concurrent one). */
  | 'already-done'
  /** The stored marker is unreadable: nothing is written, so nothing can be counted twice. */
  | 'invalid-marker'

export interface RunGlobalBackfillOptions {
  /** Process start: the `cutoffMs` recorded if this run has to create the marker. */
  cutoffMs: number
  db?: LibSQLDatabase<typeof schema>
  now?: () => number
  pricing?: GlobalBackfillPricing
  /** Test seam: runs inside the write transaction after the buckets, before the marker flips. */
  beforeCommit?: () => void | Promise<void>
}

export interface BackfillSlotRow {
  slot: number
  provider: string
  model: string
  requestCount: number
  successCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  latencySum: number
  storedCost: number
  legacyPromptTokens: number
  legacyCompletionTokens: number
}

function toNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

async function aggregateHistory(
  db: LibSQLDatabase<typeof schema>,
  cutoffId: number,
  sinceMs: number | null
): Promise<BackfillSlotRow[]> {
  const logs = intelligenceAuditLogs
  // No catalog yet: every stored cost predates catalog pricing, so all of it is re-priced.
  const since = sinceMs ?? Number.MAX_SAFE_INTEGER
  const slot = sql<number>`(${logs.timestamp} / ${sql.raw(String(BACKFILL_SLOT_MS))})`
  const rows = await db
    .select({
      slot,
      provider: logs.provider,
      model: logs.model,
      requestCount: sql<number>`count(*)`,
      successCount: sql<number>`sum(case when ${logs.success} = 1 then 1 else 0 end)`,
      promptTokens: sql<number>`sum(${logs.promptTokens})`,
      completionTokens: sql<number>`sum(${logs.completionTokens})`,
      totalTokens: sql<number>`sum(${logs.totalTokens})`,
      latencySum: sql<number>`sum(${logs.latency})`,
      storedCost: sql<number>`sum(case when ${logs.timestamp} >= ${since} then coalesce(${logs.estimatedCost}, 0) else 0 end)`,
      legacyPromptTokens: sql<number>`sum(case when ${logs.timestamp} < ${since} then ${logs.promptTokens} else 0 end)`,
      legacyCompletionTokens: sql<number>`sum(case when ${logs.timestamp} < ${since} then ${logs.completionTokens} else 0 end)`
    })
    .from(logs)
    .where(
      and(lte(logs.id, cutoffId), notInArray(logs.capabilityId, [...OUTER_GOVERNANCE_CAPABILITIES]))
    )
    .groupBy(slot, logs.provider, logs.model)

  return rows.map((row) => ({
    slot: toNumber(row.slot),
    provider: row.provider,
    model: row.model,
    requestCount: toNumber(row.requestCount),
    successCount: toNumber(row.successCount),
    promptTokens: toNumber(row.promptTokens),
    completionTokens: toNumber(row.completionTokens),
    totalTokens: toNumber(row.totalTokens),
    latencySum: toNumber(row.latencySum),
    storedCost: toNumber(row.storedCost),
    legacyPromptTokens: toNumber(row.legacyPromptTokens),
    legacyCompletionTokens: toNumber(row.legacyCompletionTokens)
  }))
}

/** Sums slot rows into the global day and month periods they belong to, in local time. */
export function foldBackfillSlots(
  rows: readonly BackfillSlotRow[],
  pricing: Pick<GlobalBackfillPricing, 'estimateCostUsd'>
): Map<string, UsageDelta> {
  const periods = new Map<string, UsageDelta>()
  const bucket = (period: string): UsageDelta => {
    let delta = periods.get(period)
    if (!delta) {
      delta = emptyUsageDelta()
      periods.set(period, delta)
    }
    return delta
  }
  for (const row of rows) {
    if (row.requestCount <= 0) continue
    const day = localDayKey(row.slot * BACKFILL_SLOT_MS)
    const legacyCost =
      row.legacyPromptTokens > 0 || row.legacyCompletionTokens > 0
        ? pricing.estimateCostUsd({
            providerId: row.provider,
            model: row.model,
            usage: {
              promptTokens: row.legacyPromptTokens,
              completionTokens: row.legacyCompletionTokens
            }
          })
        : 0
    const delta: UsageDelta = {
      requestCount: row.requestCount,
      successCount: row.successCount,
      failureCount: Math.max(0, row.requestCount - row.successCount),
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      totalCost: row.storedCost + legacyCost,
      latencySum: row.latencySum
    }
    addUsageDelta(bucket(dayPeriod(day)), delta)
    addUsageDelta(bucket(monthPeriod(day.slice(0, 7))), delta)
  }
  return periods
}

/**
 * Runs the backfill once if the marker says it is still pending. Safe to call repeatedly and
 * concurrently with live flushes: the marker is re-checked inside the write transaction.
 */
export async function runGlobalUsageBackfill(
  options: RunGlobalBackfillOptions
): Promise<GlobalBackfillOutcome> {
  const db = options.db ?? databaseModule.getDb()
  const now = options.now ?? Date.now

  let current = await readGlobalBackfillMarker(db)
  if (current.state === 'absent') {
    await scheduleDbWrite(
      'intelligence.usage.global-backfill.marker',
      () => db.transaction((tx) => ensureGlobalBackfillMarker(tx, options.cutoffMs, now())),
      { priority: 'background' }
    )
    current = await readGlobalBackfillMarker(db)
  }
  if (current.state !== 'valid') {
    backfillLog.warn('Global usage backfill marker is unreadable; history is not backfilled', {
      meta: { code: 'INTELLIGENCE_USAGE_BACKFILL_MARKER_INVALID' }
    })
    return 'invalid-marker'
  }
  const marker = current.marker
  if (marker.status === 'done') return 'already-done'

  const pricing = options.pricing ?? (await loadGlobalBackfillPricing())
  const sinceMs = await pricing.readSinceMs()
  const periods = foldBackfillSlots(await aggregateHistory(db, marker.cutoffId, sinceMs), pricing)

  const applied = await scheduleDbWrite(
    'intelligence.usage.global-backfill',
    () =>
      db.transaction(async (tx) => {
        const latest = await readGlobalBackfillMarker(tx)
        if (
          latest.state !== 'valid' ||
          latest.marker.status !== 'pending' ||
          latest.marker.cutoffId !== marker.cutoffId
        ) {
          return false
        }
        const updatedAt = new Date(now())
        for (const [period, delta] of periods) {
          await addToUsageBucket(
            tx,
            {
              callerId: GLOBAL_USAGE_CALLER_ID,
              callerType: GLOBAL_USAGE_CALLER_TYPE,
              period,
              periodType: period.startsWith('day:') ? 'day' : 'month'
            },
            {
              requestCount: delta.requestCount,
              successCount: delta.successCount,
              failureCount: delta.failureCount,
              totalTokens: delta.totalTokens,
              promptTokens: delta.promptTokens,
              completionTokens: delta.completionTokens,
              totalCost: delta.totalCost,
              avgLatency: delta.requestCount > 0 ? delta.latencySum / delta.requestCount : 0
            },
            updatedAt
          )
        }
        await options.beforeCommit?.()
        const completedAt = now()
        await tx
          .update(systemConfig)
          .set({
            value: JSON.stringify({ ...marker, status: 'done', completedAt }),
            updatedAt: completedAt
          })
          .where(eq(systemConfig.key, GLOBAL_BACKFILL_CONFIG_KEY))
        return true
      }),
    { priority: 'background' }
  )
  if (!applied) return 'already-done'

  backfillLog.info('Global usage history backfilled', {
    meta: { periods: periods.size, cutoffId: marker.cutoffId }
  })
  return 'completed'
}
