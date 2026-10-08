/**
 * `getUsageInsights({ range })` — the audit page's usage read (audit rebuild parent design §1.5).
 *
 * - Totals and the day series come from the global bucket (`__global__` / `system`, local days)
 *   plus calls not flushed yet, so they include every caller and are current to the last call.
 * - The four breakdowns come from detail rows in the window, outer `agent.run` /
 *   `workflow.execute` rows excluded. Detail rows exist only while audit is on and inside the
 *   retention period, so `coverage` reports how many of the window's calls they cover.
 * - Costs: rows priced against a models.dev catalog (`timestamp >= sinceMs`) keep their stored
 *   cost; older rows are re-priced with the current catalog.
 * - `limits` is the global usage limits' status for the current local day and month
 *   (`usage-limits.ts` `buildUsageLimitsStatus`), against the same unflushed-inclusive usage.
 *
 * Host-only: registered behind `assertHostOwnedIntelligenceControlPlane`.
 */
import type {
  BreakdownRow,
  ModelBreakdownRow,
  UsageInsights,
  UsageRange,
  UsageTotals
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { UsageDelta } from './global-deltas'
import { and, gte, lt, notInArray, sql } from 'drizzle-orm'
import { intelligenceAuditLogs } from '../../../db/schema'
import { databaseModule } from '../../database'
import { DEFAULT_PRIVACY_RETENTION_POLICY } from '../../privacy/retention-policy'
import { createMainPrivacyRetentionPolicyStore } from '../../privacy/retention-policy-store'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import { tuffIntelligence } from '../intelligence-sdk'
import { estimateCostUsd, resolveModelPricing } from '../pricing/model-pricing'
import {
  getPricingCatalogStatus,
  loadPricingCatalog,
  PRICING_CATALOG_MAX_AGE_MS,
  readPricingSinceMs,
  requestPricingRefresh
} from '../pricing/models-dev-catalog'
import { OUTER_GOVERNANCE_CAPABILITIES } from './constants'
import {
  currentTimeZone,
  dayPeriod,
  isUsageRange,
  localDayStartMs,
  resolveWindow
} from './local-period'
import { buildUsageLimitsStatus } from './usage-limits'

export const DEFAULT_USAGE_RANGE: UsageRange = '30d'

export interface UsageInsightsDependencies {
  db?: LibSQLDatabase<typeof schema>
  now?: number
  /** Global usage per period, unflushed calls included. Defaults to the audit logger's. */
  readGlobalUsage?: (periods: readonly string[]) => Promise<Map<string, UsageDelta>>
  auditEnabled?: () => boolean
  readAuditRetentionMs?: () => Promise<number | null>
  /** Called, not awaited, when the catalog is missing or older than 24 h. */
  onPricingStale?: () => void
}

function invalidRange(): Error {
  return Object.assign(new Error('INTELLIGENCE_USAGE_RANGE_INVALID'), {
    code: 'INTELLIGENCE_USAGE_RANGE_INVALID'
  })
}

/** A missing payload or range reads the default window; anything else must be a known range. */
export function normalizeUsageInsightsRequest(request: unknown): UsageRange {
  if (request === undefined || request === null) return DEFAULT_USAGE_RANGE
  if (typeof request !== 'object' || Array.isArray(request)) throw invalidRange()
  const range = (request as { range?: unknown }).range
  if (range === undefined) return DEFAULT_USAGE_RANGE
  if (!isUsageRange(range)) throw invalidRange()
  return range
}

function roundUsd(value: number): number {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(6)) : 0
}

function toNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function toTotals(delta: UsageDelta): UsageTotals {
  return {
    requestCount: delta.requestCount,
    successCount: delta.successCount,
    failureCount: delta.failureCount,
    promptTokens: delta.promptTokens,
    completionTokens: delta.completionTokens,
    totalTokens: delta.totalTokens,
    estimatedCostUsd: roundUsd(delta.totalCost),
    avgLatencyMs: delta.requestCount > 0 ? Math.round(delta.latencySum / delta.requestCount) : null
  }
}

async function readAuditRetentionMs(): Promise<number | null> {
  const fallback = DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-audit']
  try {
    const policy = (await createMainPrivacyRetentionPolicyStore().load()).categories[
      'intelligence-audit'
    ]
    // A disabled policy never cleans up, so details are kept indefinitely.
    return policy.enabled ? policy.retentionMs : null
  } catch {
    return fallback.enabled ? fallback.retentionMs : null
  }
}

async function readOldestDetailMs(db: LibSQLDatabase<typeof schema>): Promise<number | null> {
  const [row] = await db
    .select({ oldest: sql<number | null>`min(${intelligenceAuditLogs.timestamp})` })
    .from(intelligenceAuditLogs)
  const oldest = row?.oldest
  return oldest === null || oldest === undefined ? null : toNumber(oldest)
}

/** One `(channel, model, capability, caller, operation)` group of detail rows, not yet priced. */
interface RawDetailGroup {
  provider: string
  model: string
  capabilityId: string
  caller: string | null
  operation: string | null
  requestCount: number
  failureCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** Stored cost of rows priced against a catalog (`timestamp >= sinceMs`). */
  storedCost: number
  /** Tokens of older rows, re-priced with the current catalog when merged. */
  legacyPromptTokens: number
  legacyCompletionTokens: number
}

interface DetailGroup {
  provider: string
  model: string
  capabilityId: string
  caller: string | null
  operation: string | null
  requestCount: number
  failureCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

async function readRawDetailGroups(
  db: LibSQLDatabase<typeof schema>,
  startMs: number,
  endMs: number,
  sinceMs: number | null
): Promise<RawDetailGroup[]> {
  if (endMs <= startMs) return []
  const logs = intelligenceAuditLogs
  // No catalog yet: no stored cost was catalog-priced, so every row is re-priced.
  const since = sinceMs ?? Number.MAX_SAFE_INTEGER
  // Rows without a caller predate the `core.*` callers; Home ones still carry `operation`.
  const operation = sql<
    string | null
  >`case when ${logs.caller} is null and json_valid(${logs.metadata}) then json_extract(${logs.metadata}, '$.operation') end`
  const rows = await db
    .select({
      provider: logs.provider,
      model: logs.model,
      capabilityId: logs.capabilityId,
      caller: logs.caller,
      operation,
      requestCount: sql<number>`count(*)`,
      failureCount: sql<number>`sum(case when ${logs.success} = 1 then 0 else 1 end)`,
      promptTokens: sql<number>`sum(${logs.promptTokens})`,
      completionTokens: sql<number>`sum(${logs.completionTokens})`,
      totalTokens: sql<number>`sum(${logs.totalTokens})`,
      storedCost: sql<number>`sum(case when ${logs.timestamp} >= ${since} then coalesce(${logs.estimatedCost}, 0) else 0 end)`,
      legacyPromptTokens: sql<number>`sum(case when ${logs.timestamp} < ${since} then ${logs.promptTokens} else 0 end)`,
      legacyCompletionTokens: sql<number>`sum(case when ${logs.timestamp} < ${since} then ${logs.completionTokens} else 0 end)`
    })
    .from(logs)
    .where(
      and(
        gte(logs.timestamp, startMs),
        lt(logs.timestamp, endMs),
        notInArray(logs.capabilityId, [...OUTER_GOVERNANCE_CAPABILITIES])
      )
    )
    .groupBy(logs.provider, logs.model, logs.capabilityId, logs.caller, operation)

  return rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    capabilityId: row.capabilityId,
    caller: row.caller,
    operation: typeof row.operation === 'string' && row.operation ? row.operation : null,
    requestCount: toNumber(row.requestCount),
    failureCount: toNumber(row.failureCount),
    promptTokens: toNumber(row.promptTokens),
    completionTokens: toNumber(row.completionTokens),
    totalTokens: toNumber(row.totalTokens),
    storedCost: toNumber(row.storedCost),
    legacyPromptTokens: toNumber(row.legacyPromptTokens),
    legacyCompletionTokens: toNumber(row.legacyCompletionTokens)
  }))
}

/**
 * Detail rows of the window's past days, by window. Grouping every row costs about 2–4 µs per row
 * in libSQL (0.5–0.9 s at 200k rows), while the past days rarely change: only a late flush, a
 * retention run or a privacy deletion touches them. Each entry is checked on every read against a
 * covering-index signature (`count(*)`, `max(id)` of the range — ids are AUTOINCREMENT, so any
 * insert raises `max(id)` and any delete lowers `count(*)`), and today is always read live.
 * Prices are applied after the cache, so a catalog update needs no invalidation.
 */
const pastDetailCache = new Map<string, { signature: string; groups: RawDetailGroup[] }>()
const PAST_DETAIL_CACHE_MAX_ENTRIES = 8

async function readRangeSignature(
  db: LibSQLDatabase<typeof schema>,
  startMs: number,
  endMs: number
): Promise<string> {
  const [row] = await db
    .select({
      rows: sql<number>`count(*)`,
      maxId: sql<number | null>`max(${intelligenceAuditLogs.id})`
    })
    .from(intelligenceAuditLogs)
    .where(
      and(gte(intelligenceAuditLogs.timestamp, startMs), lt(intelligenceAuditLogs.timestamp, endMs))
    )
  return `${toNumber(row?.rows)}:${toNumber(row?.maxId)}`
}

async function readPastDetailGroups(
  db: LibSQLDatabase<typeof schema>,
  startMs: number,
  endMs: number,
  sinceMs: number | null,
  timezone: string
): Promise<RawDetailGroup[]> {
  if (endMs <= startMs) return []
  const key = JSON.stringify([timezone, sinceMs, startMs, endMs])
  const signature = await readRangeSignature(db, startMs, endMs)
  const cached = pastDetailCache.get(key)
  if (cached?.signature === signature) return cached.groups

  const groups = await readRawDetailGroups(db, startMs, endMs, sinceMs)
  // Cache only a consistent snapshot: a write between the two reads leaves it for the next call.
  if ((await readRangeSignature(db, startMs, endMs)) === signature) {
    pastDetailCache.delete(key)
    pastDetailCache.set(key, { signature, groups })
    while (pastDetailCache.size > PAST_DETAIL_CACHE_MAX_ENTRIES) {
      const oldest = pastDetailCache.keys().next().value
      if (oldest === undefined) break
      pastDetailCache.delete(oldest)
    }
  }
  return groups
}

/** Test seam: forget cached past-day breakdowns. */
export function resetUsageInsightsCacheForTest(): void {
  pastDetailCache.clear()
}

/** Merges the past-day and live groups and prices each merged group once. */
function priceDetailGroups(groups: readonly RawDetailGroup[]): DetailGroup[] {
  const merged = new Map<string, RawDetailGroup>()
  for (const group of groups) {
    const key = JSON.stringify([
      group.provider,
      group.model,
      group.capabilityId,
      group.caller,
      group.operation
    ])
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...group })
      continue
    }
    existing.requestCount += group.requestCount
    existing.failureCount += group.failureCount
    existing.promptTokens += group.promptTokens
    existing.completionTokens += group.completionTokens
    existing.totalTokens += group.totalTokens
    existing.storedCost += group.storedCost
    existing.legacyPromptTokens += group.legacyPromptTokens
    existing.legacyCompletionTokens += group.legacyCompletionTokens
  }

  return [...merged.values()].map((group) => {
    const legacyCost =
      group.legacyPromptTokens > 0 || group.legacyCompletionTokens > 0
        ? estimateCostUsd({
            providerId: group.provider,
            model: group.model,
            usage: {
              promptTokens: group.legacyPromptTokens,
              completionTokens: group.legacyCompletionTokens
            }
          })
        : 0
    return {
      provider: group.provider,
      model: group.model,
      capabilityId: group.capabilityId,
      caller: group.caller,
      operation: group.operation,
      requestCount: group.requestCount,
      failureCount: group.failureCount,
      promptTokens: group.promptTokens,
      completionTokens: group.completionTokens,
      totalTokens: group.totalTokens,
      estimatedCostUsd: group.storedCost + legacyCost
    }
  })
}

async function readDetailGroups(
  db: LibSQLDatabase<typeof schema>,
  window: { startMs: number; endMs: number; todayStartMs: number },
  sinceMs: number | null,
  timezone: string
): Promise<DetailGroup[]> {
  const liveStartMs = Math.max(window.startMs, window.todayStartMs)
  const [past, live] = await Promise.all([
    readPastDetailGroups(db, window.startMs, liveStartMs, sinceMs, timezone),
    readRawDetailGroups(db, liveStartMs, window.endMs, sinceMs)
  ])
  return priceDetailGroups([...past, ...live])
}

function emptyRow(key: string): BreakdownRow {
  return {
    key,
    requestCount: 0,
    failureCount: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0
  }
}

function accumulate(row: BreakdownRow, group: DetailGroup): void {
  row.requestCount += group.requestCount
  row.failureCount += group.failureCount
  row.totalTokens += group.totalTokens
  row.promptTokens += group.promptTokens
  row.completionTokens += group.completionTokens
  row.estimatedCostUsd += group.estimatedCostUsd
}

/** Largest first by tokens (the page's main metric), then requests, then key. */
function sortRows<T extends BreakdownRow>(rows: Iterable<T>): T[] {
  return [...rows]
    .map((row) => ({ ...row, estimatedCostUsd: roundUsd(row.estimatedCostUsd) }))
    .sort(
      (left, right) =>
        right.totalTokens - left.totalTokens ||
        right.requestCount - left.requestCount ||
        left.key.localeCompare(right.key) ||
        (left.operation ?? '').localeCompare(right.operation ?? '')
    )
}

function buildBreakdown(groups: readonly DetailGroup[]): {
  channel: BreakdownRow[]
  model: ModelBreakdownRow[]
  capability: BreakdownRow[]
  caller: BreakdownRow[]
  detailRequests: number
} {
  const channel = new Map<string, BreakdownRow>()
  const model = new Map<string, ModelBreakdownRow>()
  const capability = new Map<string, BreakdownRow>()
  const caller = new Map<string, BreakdownRow>()
  let detailRequests = 0

  for (const group of groups) {
    detailRequests += group.requestCount

    let channelRow = channel.get(group.provider)
    if (!channelRow) {
      channelRow = emptyRow(group.provider)
      channel.set(group.provider, channelRow)
    }
    accumulate(channelRow, group)

    // An opaque unique key: a channel id or a model name may itself contain separators.
    const modelKey = JSON.stringify([group.provider, group.model])
    let modelRow = model.get(modelKey)
    if (!modelRow) {
      modelRow = {
        ...emptyRow(modelKey),
        providerId: group.provider,
        model: group.model,
        pricing: { ...resolveModelPricing({ providerId: group.provider, model: group.model }) }
      }
      model.set(modelKey, modelRow)
    }
    accumulate(modelRow, group)

    let capabilityRow = capability.get(group.capabilityId)
    if (!capabilityRow) {
      capabilityRow = emptyRow(group.capabilityId)
      capability.set(group.capabilityId, capabilityRow)
    }
    accumulate(capabilityRow, group)

    // Callers are opaque: a missing one is '', split again only by `metadata.operation`.
    const callerKey = group.caller ?? ''
    const operation = group.caller === null ? group.operation : null
    const callerMapKey = JSON.stringify([callerKey, operation])
    let callerRow = caller.get(callerMapKey)
    if (!callerRow) {
      callerRow = { ...emptyRow(callerKey), ...(operation ? { operation } : {}) }
      caller.set(callerMapKey, callerRow)
    }
    accumulate(callerRow, group)
  }

  return {
    channel: sortRows(channel.values()),
    model: sortRows(model.values()),
    capability: sortRows(capability.values()),
    caller: sortRows(caller.values()),
    detailRequests
  }
}

export async function getUsageInsights(
  request: unknown,
  deps: UsageInsightsDependencies = {}
): Promise<UsageInsights> {
  const range = normalizeUsageInsightsRequest(request)
  const now = deps.now ?? Date.now()
  const window = resolveWindow(range, now)
  const db = deps.db ?? databaseModule.getDb()
  const readGlobal =
    deps.readGlobalUsage ??
    ((periods: readonly string[]) => intelligenceAuditLogger.readGlobalUsage(periods))

  // The breakdown prices groups synchronously against the catalog in memory.
  await loadPricingCatalog()
  const [globalUsage, sinceMs, oldestDetailMs, retentionMs] = await Promise.all([
    readGlobal(window.days.map(dayPeriod)),
    readPricingSinceMs(),
    readOldestDetailMs(db),
    (deps.readAuditRetentionMs ?? readAuditRetentionMs)()
  ])

  const days: UsageInsights['days'] = []
  const sum: UsageDelta = {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    latencySum: 0
  }
  for (const day of window.days) {
    const delta = globalUsage.get(dayPeriod(day))
    if (!delta || delta.requestCount <= 0) continue
    days.push({ day, ...toTotals(delta) })
    sum.requestCount += delta.requestCount
    sum.successCount += delta.successCount
    sum.failureCount += delta.failureCount
    sum.promptTokens += delta.promptTokens
    sum.completionTokens += delta.completionTokens
    sum.totalTokens += delta.totalTokens
    sum.totalCost += delta.totalCost
    sum.latencySum += delta.latencySum
  }
  const totals = toTotals(sum)

  const timezone = currentTimeZone()
  const breakdown = buildBreakdown(
    await readDetailGroups(
      db,
      {
        startMs: window.startMs,
        endMs: window.endMs,
        todayStartMs: localDayStartMs(window.endDay)
      },
      sinceMs,
      timezone
    )
  )

  const zeroCostModels = breakdown.model
    .filter((row) => row.pricing.status !== 'priced' && row.requestCount > 0)
    .map((row) => ({
      providerId: row.providerId,
      model: row.model,
      status: row.pricing.status,
      requestCount: row.requestCount
    }))
    .sort((left, right) => right.requestCount - left.requestCount)

  const catalog = getPricingCatalogStatus()
  const stale =
    !catalog.available ||
    catalog.checkedAt === null ||
    now - catalog.checkedAt < 0 ||
    now - catalog.checkedAt >= PRICING_CATALOG_MAX_AGE_MS
  if (stale) (deps.onPricingStale ?? requestPricingRefresh)()

  return {
    timezone,
    window: {
      range,
      startDay: window.startDay,
      endDay: window.endDay,
      startMs: window.startMs,
      endMs: window.endMs
    },
    totals,
    days,
    breakdown: {
      coverage: { detailRequests: breakdown.detailRequests, totalRequests: totals.requestCount },
      channel: breakdown.channel,
      model: breakdown.model,
      capability: breakdown.capability,
      caller: breakdown.caller
    },
    zeroCostModels,
    limits: await buildUsageLimitsStatus(now, { readGlobalUsage: readGlobal }),
    audit: {
      enabled: (deps.auditEnabled ?? (() => tuffIntelligence.isAuditEnabled()))(),
      retentionMs,
      oldestDetailMs
    },
    pricing: {
      source: 'models.dev',
      fetchedAt: catalog.fetchedAt,
      checkedAt: catalog.checkedAt,
      available: catalog.available
    }
  }
}
