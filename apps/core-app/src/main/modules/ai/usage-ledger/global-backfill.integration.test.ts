/**
 * AC-B4: the one-shot global backfill on a real migrated libSQL database.
 *
 * - History is summed per local day, outer agent/workflow rows excluded, rows older than the
 *   pricing `since` marker re-priced and newer ones kept at their stored cost.
 * - A second run changes nothing.
 * - A failure inside the backfill transaction leaves no rows and a still-pending marker; the next
 *   run repeats it with the same persisted cutoff.
 * - A live flush before the backfill creates the marker first, so its own row is never summed twice.
 */
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { GlobalBackfillPricing } from './global-backfill'
import { createClient } from '@libsql/client'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { intelligenceAuditLogs, intelligenceUsageStats, systemConfig } from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import '../intelligence-test-harness'
import { IntelligenceAuditLogger, intelligenceAuditLogger } from '../intelligence-audit-logger'
// Loaded here so the backfill's own dynamic `import()` of pricing (which pulls in the SDK graph)
// is a cache hit instead of a cold transform inside the test timeout.
import '../pricing/model-pricing'
import { GLOBAL_BACKFILL_CONFIG_KEY, GLOBAL_USAGE_CALLER_ID } from './constants'
import { readGlobalBackfillMarker, runGlobalUsageBackfill } from './global-backfill'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')
const originalTimeZone = process.env.TZ

let client: Client | null = null
let db: LibSQLDatabase<typeof schema>
let tempRoot: string
let dbCount = 0

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

/** gpt-4o at $2.5 / $10 and gpt-4o-mini at $0.15 / $0.6 per 1M tokens; everything else 0. */
const SINCE_MS = Date.parse('2026-09-25T00:00:00.000Z')
const pricing: GlobalBackfillPricing = {
  readSinceMs: async () => SINCE_MS,
  estimateCostUsd: ({ model, usage }) => {
    const price = model === 'gpt-4o' ? [2.5, 10] : model === 'gpt-4o-mini' ? [0.15, 0.6] : [0, 0]
    return (usage.promptTokens * price[0]! + usage.completionTokens * price[1]!) / 1_000_000
  }
}

interface SeedRow {
  traceId: string
  iso: string
  capabilityId?: string
  provider?: string
  model?: string
  prompt: number
  completion: number
  cost: number | null
  success?: boolean
  latency?: number
}

async function seed(rows: SeedRow[]): Promise<void> {
  await db.insert(intelligenceAuditLogs).values(
    rows.map((row) => ({
      traceId: row.traceId,
      timestamp: Date.parse(row.iso),
      capabilityId: row.capabilityId ?? 'text.chat',
      provider: row.provider ?? 'openai-default',
      model: row.model ?? 'gpt-4o',
      promptTokens: row.prompt,
      completionTokens: row.completion,
      totalTokens: row.prompt + row.completion,
      estimatedCost: row.cost,
      latency: row.latency ?? 100,
      success: row.success ?? true
    }))
  )
}

/** Shanghai: 23:00 local 09-20, 01:00 local 09-21 (an outer row beside it), 11:00 local 09-26. */
const HISTORY: SeedRow[] = [
  // Older than the pricing `since` marker, so its stored cost is replaced by the models.dev
  // catalog price (the stub above): (1000 × 2.5 + 1000 × 10) / 1e6 = 0.0125.
  {
    traceId: 'hist-1',
    iso: '2026-09-20T15:00:00.000Z',
    prompt: 1000,
    completion: 1000,
    cost: 0.02,
    latency: 100
  },
  // Failure on a gateway: model family pricing, (1000 × 0.15 + 500 × 0.6) / 1e6 = 0.00045.
  {
    traceId: 'hist-2',
    iso: '2026-09-20T17:00:00.000Z',
    provider: 'gateway-channel',
    model: 'gpt-4o-mini',
    prompt: 1000,
    completion: 500,
    cost: null,
    success: false,
    latency: 300
  },
  // Outer agent row whose tokens are the inner calls'; never part of the global bucket.
  {
    traceId: 'hist-outer',
    iso: '2026-09-20T17:30:00.000Z',
    capabilityId: 'agent.run',
    provider: 'tuff-pi-runtime',
    model: 'pi-agent-core',
    prompt: 2000,
    completion: 1000,
    cost: 0.009
  },
  // After the pricing `since` marker: the stored catalog price is kept as is.
  {
    traceId: 'hist-3',
    iso: '2026-09-26T03:00:00.000Z',
    prompt: 100,
    completion: 100,
    cost: 0.123,
    latency: 50
  }
]

async function globalRow(period: string) {
  const [row] = await db
    .select()
    .from(intelligenceUsageStats)
    .where(
      and(
        eq(intelligenceUsageStats.callerId, GLOBAL_USAGE_CALLER_ID),
        eq(intelligenceUsageStats.period, period)
      )
    )
  return row
}

async function globalRows() {
  return db
    .select()
    .from(intelligenceUsageStats)
    .where(eq(intelligenceUsageStats.callerId, GLOBAL_USAGE_CALLER_ID))
}

async function expectBackfilledHistory(): Promise<void> {
  expect(await globalRow('day:2026-09-20')).toMatchObject({
    requestCount: 1,
    successCount: 1,
    failureCount: 0,
    promptTokens: 1000,
    completionTokens: 1000,
    totalTokens: 2000,
    avgLatency: 100
  })
  expect((await globalRow('day:2026-09-20'))?.totalCost).toBeCloseTo(0.0125, 9)
  expect(await globalRow('day:2026-09-21')).toMatchObject({
    requestCount: 1,
    successCount: 0,
    failureCount: 1,
    totalTokens: 1500,
    avgLatency: 300
  })
  expect((await globalRow('day:2026-09-21'))?.totalCost).toBeCloseTo(0.00045, 9)
  expect((await globalRow('day:2026-09-26'))?.totalCost).toBeCloseTo(0.123, 9)
  expect(await globalRow('month:2026-09')).toMatchObject({
    requestCount: 3,
    successCount: 2,
    failureCount: 1,
    totalTokens: 3700,
    avgLatency: 150
  })
  expect((await globalRow('month:2026-09'))?.totalCost).toBeCloseTo(0.0125 + 0.00045 + 0.123, 9)
}

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'tuff-usage-backfill-'))
  await intelligenceAuditLogger.destroy()
}, 60_000)

beforeEach(async () => {
  process.env.TZ = 'Asia/Shanghai'
  dbCount += 1
  client = createClient({ url: `file:${join(tempRoot, `backfill-${dbCount}.sqlite`)}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
}, 60_000)

afterEach(async () => {
  await dbWriteScheduler.drain()
  client?.close()
  client = null
})

afterAll(async () => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
}, 60_000)

describe('global usage backfill (AC-B4)', () => {
  it('sums retained history per local day once, then reports done', async () => {
    await seed(HISTORY)

    await expect(runGlobalUsageBackfill({ cutoffMs: Date.now(), pricing })).resolves.toBe(
      'completed'
    )
    await expectBackfilledHistory()
    const marker = await readGlobalBackfillMarker(db)
    expect(marker).toMatchObject({
      state: 'valid',
      marker: { version: 1, status: 'done', cutoffId: 4 }
    })

    // Restart: nothing is added a second time.
    const before = await globalRows()
    await expect(runGlobalUsageBackfill({ cutoffMs: Date.now(), pricing })).resolves.toBe(
      'already-done'
    )
    expect(await globalRows()).toEqual(before)
  })

  it('leaves nothing behind when the transaction fails, and repeats with the same cutoff', async () => {
    await seed(HISTORY)

    await expect(
      runGlobalUsageBackfill({
        cutoffMs: Date.now(),
        pricing,
        beforeCommit: () => {
          throw new Error('injected backfill failure')
        }
      })
    ).rejects.toThrow('injected backfill failure')

    expect(await globalRows()).toEqual([])
    const pending = await readGlobalBackfillMarker(db)
    expect(pending).toMatchObject({ state: 'valid', marker: { status: 'pending', cutoffId: 4 } })

    // Rows written after the marker exist are counted live; the retry must not pick them up.
    await seed([
      {
        traceId: 'after-marker',
        iso: '2026-09-20T15:30:00.000Z',
        prompt: 9,
        completion: 9,
        cost: 0
      }
    ])
    await expect(runGlobalUsageBackfill({ cutoffMs: Date.now(), pricing })).resolves.toBe(
      'completed'
    )
    await expectBackfilledHistory()
  })

  it('a live flush before the backfill is counted once: live, never again by the backfill', async () => {
    await seed(HISTORY)
    const logger = new IntelligenceAuditLogger()
    try {
      await logger.log({
        traceId: 'live-before-backfill',
        timestamp: Date.parse('2026-09-20T15:45:00.000Z'),
        capabilityId: 'text.chat',
        provider: 'openai-default',
        model: 'gpt-4o',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        estimatedCost: 0.000125,
        latency: 100,
        success: true
      })
      await logger.flushToDB()

      // The flush created the marker before inserting its own row.
      const marker = await readGlobalBackfillMarker(db)
      expect(marker).toMatchObject({ state: 'valid', marker: { status: 'pending', cutoffId: 4 } })
      expect((await globalRow('day:2026-09-20'))?.requestCount).toBe(1)

      await expect(logger.runGlobalBackfill()).resolves.toBe('completed')
    } finally {
      await logger.destroy()
    }

    // History (1 request that day) + the live call (1) — not 3.
    expect((await globalRow('day:2026-09-20'))?.requestCount).toBe(2)
    expect((await globalRow('month:2026-09'))?.requestCount).toBe(4)
  })

  it('writes nothing over an unreadable marker', async () => {
    await seed(HISTORY)
    await db
      .insert(systemConfig)
      .values({ key: GLOBAL_BACKFILL_CONFIG_KEY, value: '{"version":2}', updatedAt: Date.now() })

    await expect(runGlobalUsageBackfill({ cutoffMs: Date.now(), pricing })).resolves.toBe(
      'invalid-marker'
    )
    expect(await globalRows()).toEqual([])
  })
})
