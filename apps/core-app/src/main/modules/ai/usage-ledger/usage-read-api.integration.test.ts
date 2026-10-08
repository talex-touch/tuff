/**
 * The two host-only reads on a real migrated libSQL database: `queryAuditLogs` (AC-B7: limit
 * clamp, filtered totals, safe metadata, since-split cost) and `getUsageInsights` (window, totals,
 * the four breakdowns, coverage, zero-cost models, pricing staleness).
 */
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { intelligenceAuditLogs, intelligenceUsageStats, systemConfig } from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import '../intelligence-test-harness'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import modelsDevFixture from '../pricing/__fixtures__/models-dev-subset.json'
import {
  compactModelsDevCatalog,
  primePricingCatalogForTest,
  PRICING_SINCE_CONFIG_KEY,
  resetPricingCatalogForTest
} from '../pricing/models-dev-catalog'
import { AUDIT_LOG_PAGE_MAX_LIMIT, queryAuditLogPage } from './audit-log-query'
import { GLOBAL_USAGE_CALLER_ID } from './constants'
import { getUsageInsights, resetUsageInsightsCacheForTest } from './usage-insights'

// The persisted-channel fallback of pricing reads the SDK's provider manager; none is injected.
vi.mock('../intelligence-sdk', () => ({
  getIntelligenceProviderManager: () => {
    throw new Error('[Intelligence] Provider manager not initialized')
  },
  tuffIntelligence: { isAuditEnabled: () => true }
}))

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')
const originalTimeZone = process.env.TZ

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

const MINUTE = 60_000
const T0 = Date.parse('2026-09-28T00:00:00.000Z')
/** Rows 0–99 predate catalog pricing; 100–249 were priced against it. */
const SINCE_MS = T0 + 100 * MINUTE
const ROWS = 250
/** 12:00 on 2026-10-03 in Shanghai; the catalog below was checked at this instant. */
const INSIGHTS_NOW = Date.parse('2026-10-03T04:00:00.000Z')

function seededRow(index: number) {
  const caller =
    index % 5 === 0 ? null : index % 5 === 1 ? 'plugin:a' : 'core.corebox.context-action'
  return {
    traceId: `query-${index}`,
    timestamp: T0 + index * MINUTE,
    capabilityId: index % 2 === 0 ? 'text.chat' : 'embedding.generate',
    provider: index % 2 === 0 ? 'openai-default' : 'custom-123',
    model: index % 3 === 0 ? 'gpt-4o-mini' : 'gpt-4o',
    caller,
    promptTokens: 1000,
    completionTokens: 1000,
    totalTokens: 2000,
    // The retired fixed table's price on old rows; a catalog price on newer ones.
    estimatedCost: index < 100 ? 0.02 : 0.5,
    latency: 10,
    success: index % 7 !== 0,
    metadata:
      index === 3
        ? JSON.stringify({ operation: 'home-conversation', prompt: 'SECRET_PROMPT_CANARY' })
        : index === 4
          ? 'not json'
          : index === 5
            ? JSON.stringify({ operation: 'home-conversation' })
            : null
  }
}

beforeAll(async () => {
  process.env.TZ = 'Asia/Shanghai'
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-usage-read-api-'))
  client = createClient({ url: `file:${join(tempDir, 'read-api.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await intelligenceAuditLogger.destroy()
  for (let start = 0; start < ROWS; start += 50) {
    await db
      .insert(intelligenceAuditLogs)
      .values(Array.from({ length: 50 }, (_, offset) => seededRow(start + offset)))
  }
  await db.insert(systemConfig).values({
    key: PRICING_SINCE_CONFIG_KEY,
    value: JSON.stringify({ sinceMs: SINCE_MS }),
    updatedAt: SINCE_MS
  })
}, 60_000)

beforeEach(() => {
  process.env.TZ = 'Asia/Shanghai'
  resetUsageInsightsCacheForTest()
  resetPricingCatalogForTest()
  const catalog = compactModelsDevCatalog(modelsDevFixture, {
    fetchedAt: INSIGHTS_NOW,
    checkedAt: INSIGHTS_NOW
  })
  primePricingCatalogForTest(catalog)
})

afterAll(async () => {
  await dbWriteScheduler.drain()
  resetPricingCatalogForTest()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}, 60_000)

describe('queryAuditLogs (AC-B7)', () => {
  it('clamps limit to 200 while total still counts every match', async () => {
    const page = await queryAuditLogPage({ limit: 1000 })
    expect(page.rows).toHaveLength(AUDIT_LOG_PAGE_MAX_LIMIT)
    expect(page.total).toBe(ROWS)
    expect(page.rows[0]?.traceId).toBe(`query-${ROWS - 1}`)
    expect(page.rows.at(-1)?.traceId).toBe(`query-${ROWS - 200}`)
  })

  it('defaults to 50, floors odd limits at 1, and pages with offset', async () => {
    expect((await queryAuditLogPage(undefined)).rows).toHaveLength(50)
    expect((await queryAuditLogPage({})).rows).toHaveLength(50)
    expect((await queryAuditLogPage({ limit: 0 })).rows).toHaveLength(1)
    expect((await queryAuditLogPage({ limit: -5 })).rows).toHaveLength(1)
    const tail = await queryAuditLogPage({ offset: 240, limit: 200 })
    expect(tail.rows.map((row) => row.traceId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `query-${9 - index}`)
    )
    expect(tail.total).toBe(ROWS)
  })

  it('moves total with every filter', async () => {
    const indexes = Array.from({ length: ROWS }, (_, index) => index)
    const count = (predicate: (index: number) => boolean) => indexes.filter(predicate).length

    expect((await queryAuditLogPage({ success: false })).total).toBe(count((i) => i % 7 === 0))
    expect((await queryAuditLogPage({ caller: null })).total).toBe(count((i) => i % 5 === 0))
    expect((await queryAuditLogPage({ caller: '' })).total).toBe(count((i) => i % 5 === 0))
    expect((await queryAuditLogPage({ caller: 'plugin:a' })).total).toBe(count((i) => i % 5 === 1))
    expect((await queryAuditLogPage({ providerId: 'custom-123' })).total).toBe(
      count((i) => i % 2 === 1)
    )
    expect((await queryAuditLogPage({ capabilityId: 'text.chat' })).total).toBe(
      count((i) => i % 2 === 0)
    )
    expect((await queryAuditLogPage({ model: 'gpt-4o-mini' })).total).toBe(
      count((i) => i % 3 === 0)
    )
    // startMs inclusive, endMs exclusive.
    const window = await queryAuditLogPage({ startMs: T0 + 10 * MINUTE, endMs: T0 + 20 * MINUTE })
    expect(window.total).toBe(10)
    expect(window.rows.map((row) => row.traceId)).not.toContain('query-20')
    const combined = await queryAuditLogPage({
      success: true,
      caller: null,
      capabilityId: 'text.chat',
      limit: 200
    })
    expect(combined.total).toBe(count((i) => i % 7 !== 0 && i % 5 === 0 && i % 2 === 0))
    expect(combined.rows).toHaveLength(combined.total)
  })

  it('returns only allowlisted metadata, and prices rows by the since marker', async () => {
    const page = await queryAuditLogPage({ startMs: T0, endMs: T0 + 5 * MINUTE })
    const byTrace = new Map(page.rows.map((row) => [row.traceId, row]))
    expect(byTrace.get('query-3')?.metadata).toEqual({ operation: 'home-conversation' })
    expect(JSON.stringify(page.rows)).not.toContain('SECRET_PROMPT_CANARY')
    expect(byTrace.get('query-4')?.metadata).toBeUndefined()
    // Before the marker: re-priced from the catalog (gpt-4o at $2.5 / $10), not the stored 0.02.
    expect(byTrace.get('query-1')?.estimatedCost).toBeCloseTo(0.0125, 9)
    const later = await queryAuditLogPage({ startMs: T0 + 150 * MINUTE, endMs: T0 + 151 * MINUTE })
    expect(later.rows[0]?.estimatedCost).toBe(0.5)
  })

  it('rejects malformed queries before touching the database', async () => {
    await expect(queryAuditLogPage({ limit: 'many' })).rejects.toMatchObject({
      code: 'INTELLIGENCE_AUDIT_QUERY_INVALID'
    })
    await expect(queryAuditLogPage({ caller: 5 })).rejects.toMatchObject({
      code: 'INTELLIGENCE_AUDIT_QUERY_INVALID'
    })
    await expect(queryAuditLogPage({ startMs: Number.NaN })).rejects.toMatchObject({
      code: 'INTELLIGENCE_AUDIT_QUERY_INVALID'
    })
    await expect(queryAuditLogPage('everything')).rejects.toMatchObject({
      code: 'INTELLIGENCE_AUDIT_QUERY_INVALID'
    })
  })
})

describe('getUsageInsights', () => {
  // The 30-day window ends today (2026-10-03, Shanghai) and starts at local midnight on 2026-09-04.
  const NOW = INSIGHTS_NOW

  async function seedGlobal(day: string, requests: number, tokens: number, cost: number) {
    await db.insert(intelligenceUsageStats).values({
      callerId: GLOBAL_USAGE_CALLER_ID,
      callerType: 'system',
      period: `day:${day}`,
      periodType: 'day',
      requestCount: requests,
      successCount: requests - 1,
      failureCount: 1,
      promptTokens: tokens / 2,
      completionTokens: tokens / 2,
      totalTokens: tokens,
      totalCost: cost,
      avgLatency: 100
    })
  }

  beforeAll(async () => {
    await seedGlobal('2026-09-28', 4, 800, 0.25)
    await seedGlobal('2026-10-03', 2, 400, 0.05)
    // Outside the 7-day window, inside the 30-day one.
    await seedGlobal('2026-09-10', 10, 1000, 1)
    // A per-caller row with the same period must not leak into the global totals.
    await db.insert(intelligenceUsageStats).values({
      callerId: 'system',
      callerType: 'system',
      period: 'day:2026-10-03',
      periodType: 'day',
      requestCount: 99,
      totalTokens: 9999
    })
    await db.insert(intelligenceAuditLogs).values([
      {
        traceId: 'insight-local',
        timestamp: NOW - 60 * MINUTE,
        capabilityId: 'text.chat',
        provider: 'local',
        model: 'qwen2.5:3b',
        promptTokens: 50,
        completionTokens: 50,
        totalTokens: 100,
        latency: 5,
        success: true,
        metadata: JSON.stringify({ operation: 'home-opening' })
      },
      {
        traceId: 'insight-unpriced',
        timestamp: NOW - 30 * MINUTE,
        capabilityId: 'text.chat',
        provider: 'openai-default',
        model: 'gpt-9-unknown',
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
        latency: 5,
        success: false
      },
      {
        traceId: 'insight-outer',
        timestamp: NOW - 20 * MINUTE,
        capabilityId: 'agent.run',
        provider: 'openai-default',
        model: 'pi-agent-core',
        caller: 'plugin:agent',
        promptTokens: 500,
        completionTokens: 500,
        totalTokens: 1000,
        latency: 5,
        success: true
      }
    ])
  })

  const deps = (overrides: Record<string, unknown> = {}) => ({
    now: NOW,
    auditEnabled: () => false,
    readAuditRetentionMs: async () => 30 * 86_400_000,
    onPricingStale: vi.fn(),
    ...overrides
  })

  it('reads totals and the day series from the global bucket for the local window', async () => {
    const week = await getUsageInsights({ range: '7d' }, deps())
    expect(week.timezone).toBe('Asia/Shanghai')
    expect(week.window).toEqual({
      range: '7d',
      startDay: '2026-09-27',
      endDay: '2026-10-03',
      startMs: Date.parse('2026-09-26T16:00:00.000Z'),
      endMs: Date.parse('2026-10-03T16:00:00.000Z')
    })
    expect(week.days.map((day) => [day.day, day.requestCount])).toEqual([
      ['2026-09-28', 4],
      ['2026-10-03', 2]
    ])
    expect(week.totals).toMatchObject({
      requestCount: 6,
      successCount: 4,
      failureCount: 2,
      totalTokens: 1200,
      estimatedCostUsd: 0.3,
      avgLatencyMs: 100
    })
    const month = await getUsageInsights(undefined, deps())
    expect(month.window.range).toBe('30d')
    expect(month.totals.requestCount).toBe(16)
    expect(month.limits).toEqual({
      limits: {
        requestsPerDay: null,
        requestsPerMonth: null,
        tokensPerDay: null,
        tokensPerMonth: null,
        costUsdPerDay: null,
        costUsdPerMonth: null
      },
      items: []
    })
    expect(month.audit).toEqual({
      enabled: false,
      retentionMs: 30 * 86_400_000,
      oldestDetailMs: T0
    })
  })

  it('breaks detail rows down four ways, without the outer agent row', async () => {
    const insights = await getUsageInsights({ range: '7d' }, deps())
    const { breakdown } = insights
    // 250 seeded rows (all inside the window) + the local and unpriced rows; the outer row is out.
    expect(breakdown.coverage).toEqual({ detailRequests: ROWS + 2, totalRequests: 6 })
    expect(breakdown.capability.map((row) => row.key).sort()).toEqual([
      'embedding.generate',
      'text.chat'
    ])
    expect(breakdown.channel.find((row) => row.key === 'custom-123')?.requestCount).toBe(125)
    expect(breakdown.channel.find((row) => row.key === 'local')?.requestCount).toBe(1)
    expect(
      breakdown.channel.some((row) => row.key === 'openai-default' && row.totalTokens > 0)
    ).toBe(true)
    // Callers stay opaque; rows without one split by `operation`.
    const callerKeys = breakdown.caller.map((row) => [row.key, row.operation ?? null])
    expect(callerKeys).toEqual(
      expect.arrayContaining([
        ['plugin:a', null],
        ['core.corebox.context-action', null],
        ['', 'home-conversation'],
        ['', 'home-opening'],
        ['', null]
      ])
    )
    expect(callerKeys.some(([key]) => key === 'plugin:agent')).toBe(false)

    const localModel = breakdown.model.find((row) => row.model === 'qwen2.5:3b')
    expect(localModel).toMatchObject({ providerId: 'local', pricing: { status: 'local' } })
    expect(
      breakdown.model.find((row) => row.model === 'gpt-4o' && row.providerId === 'custom-123')
    ).toMatchObject({ pricing: { status: 'priced', inputPerMTokens: 2.5, outputPerMTokens: 10 } })
    expect(insights.zeroCostModels).toEqual(
      expect.arrayContaining([
        { providerId: 'local', model: 'qwen2.5:3b', status: 'local', requestCount: 1 },
        {
          providerId: 'openai-default',
          model: 'gpt-9-unknown',
          status: 'unpriced',
          requestCount: 1
        }
      ])
    )
    expect(insights.zeroCostModels.some((row) => row.model === 'gpt-4o')).toBe(false)
  })

  it('prices old rows from the catalog and keeps catalog-priced rows as stored', async () => {
    const { breakdown } = await getUsageInsights({ range: '7d' }, deps())
    const mini = breakdown.model.find(
      (row) => row.providerId === 'openai-default' && row.model === 'gpt-4o-mini'
    )
    // Rows 0..249 with index % 6 === 0 are this pair; old ones re-priced, new ones at 0.5 stored.
    const indexes = Array.from({ length: ROWS }, (_, index) => index).filter(
      (index) => index % 6 === 0
    )
    const expected = indexes.reduce(
      (sum, index) => sum + (index < 100 ? (1000 * 0.15 + 1000 * 0.6) / 1_000_000 : 0.5),
      0
    )
    expect(mini?.requestCount).toBe(indexes.length)
    expect(mini?.estimatedCostUsd).toBeCloseTo(expected, 6)
  })

  it('asks for a catalog refresh only when the catalog is missing or stale, without waiting', async () => {
    const fresh = deps()
    const withCatalog = await getUsageInsights({ range: 'today' }, fresh)
    expect(fresh.onPricingStale).not.toHaveBeenCalled()
    expect(withCatalog.pricing).toMatchObject({ source: 'models.dev', available: true })

    resetPricingCatalogForTest()
    primePricingCatalogForTest(null)
    const missing = deps()
    const withoutCatalog = await getUsageInsights({ range: 'today' }, missing)
    expect(missing.onPricingStale).toHaveBeenCalledOnce()
    expect(withoutCatalog.pricing).toEqual({
      source: 'models.dev',
      fetchedAt: null,
      checkedAt: null,
      available: false
    })
  })

  it('rejects an unknown range', async () => {
    await expect(getUsageInsights({ range: '90d' }, deps())).rejects.toMatchObject({
      code: 'INTELLIGENCE_USAGE_RANGE_INVALID'
    })
  })

  it('sees a late row for a past day and a deletion despite the past-day cache', async () => {
    resetUsageInsightsCacheForTest()
    const channelRows = async () =>
      (await getUsageInsights({ range: '7d' }, deps())).breakdown.channel.find(
        (row) => row.key === 'late-channel'
      )?.requestCount ?? 0
    expect(await channelRows()).toBe(0)
    // Warm: the second read is served from the cache, and still has nothing for it.
    expect(await channelRows()).toBe(0)

    // A call that started yesterday but was flushed after midnight.
    const yesterday = NOW - 86_400_000
    await db.insert(intelligenceAuditLogs).values({
      traceId: 'insight-late',
      timestamp: yesterday,
      capabilityId: 'text.chat',
      provider: 'late-channel',
      model: 'gpt-4o',
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      latency: 5,
      success: true
    })
    expect(await channelRows()).toBe(1)

    await db.delete(intelligenceAuditLogs).where(eq(intelligenceAuditLogs.traceId, 'insight-late'))
    expect(await channelRows()).toBe(0)
  })
})
