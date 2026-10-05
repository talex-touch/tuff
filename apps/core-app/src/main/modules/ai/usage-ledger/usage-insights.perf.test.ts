/**
 * AC-B9: `getUsageInsights('30d')` over 200 000 detail rows in a real migrated libSQL file.
 *
 * Prints the timings (target < 150 ms in the main process) instead of asserting them: a loaded CI
 * runner must not turn a timing into a flaky failure. The assertions only prove the query really
 * covered every row.
 */
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { intelligenceAuditLogs, intelligenceUsageStats } from '../../../db/schema'
import '../intelligence-test-harness'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import modelsDevFixture from '../pricing/__fixtures__/models-dev-subset.json'
import {
  compactModelsDevCatalog,
  primePricingCatalogForTest,
  resetPricingCatalogForTest
} from '../pricing/models-dev-catalog'
import { GLOBAL_USAGE_CALLER_ID } from './constants'
import { localDayKey, resolveWindow } from './local-period'
import { getUsageInsights, resetUsageInsightsCacheForTest } from './usage-insights'

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

const ROWS = 200_000
const OUTER_EVERY = 50
const NOW = Date.parse('2026-10-03T04:00:00.000Z')
const PROVIDERS = ['openai-default', 'deepseek-default', 'custom-1', 'custom-2', 'local']
const MODELS = ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'qwen2.5:3b', 'claude-sonnet-4-5']
const CAPABILITIES = ['text.chat', 'embedding.generate', 'vision.ocr', 'text.translate']
const CALLERS = [
  null,
  'core.files.embedding',
  'core.home.opening',
  'plugin:touch-intelligence',
  'omni-panel',
  'core.corebox.context-action'
]

beforeAll(async () => {
  process.env.TZ = 'Asia/Shanghai'
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-usage-insights-perf-'))
  client = createClient({ url: `file:${join(tempDir, 'perf.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await intelligenceAuditLogger.destroy()
  primePricingCatalogForTest(compactModelsDevCatalog(modelsDevFixture, { checkedAt: NOW }))

  const window = resolveWindow('30d', NOW)
  const span = NOW - window.startMs
  const seededAt = performance.now()
  await db.transaction(async (tx) => {
    const batch = 500
    for (let start = 0; start < ROWS; start += batch) {
      await tx.insert(intelligenceAuditLogs).values(
        Array.from({ length: batch }, (_, offset) => {
          const index = start + offset
          const caller = CALLERS[index % CALLERS.length]!
          return {
            traceId: `perf-${index}`,
            timestamp: window.startMs + Math.floor((index / ROWS) * span),
            capabilityId: index % OUTER_EVERY === 0 ? 'agent.run' : CAPABILITIES[index % 4]!,
            provider: PROVIDERS[index % PROVIDERS.length]!,
            model: MODELS[(index * 7) % MODELS.length]!,
            caller,
            promptTokens: 100 + (index % 50),
            completionTokens: 40 + (index % 30),
            totalTokens: 140 + (index % 50) + (index % 30),
            estimatedCost: 0.0001,
            latency: 200 + (index % 400),
            success: index % 23 !== 0,
            metadata: caller === null ? JSON.stringify({ operation: 'home-conversation' }) : null
          }
        })
      )
    }
    for (const day of window.days) {
      await tx.insert(intelligenceUsageStats).values({
        callerId: GLOBAL_USAGE_CALLER_ID,
        callerType: 'system',
        period: `day:${day}`,
        periodType: 'day',
        requestCount: 6500,
        successCount: 6200,
        failureCount: 300,
        totalTokens: 1_000_000,
        promptTokens: 700_000,
        completionTokens: 300_000,
        totalCost: 1.5,
        avgLatency: 400
      })
    }
  })
  console.info(
    `[AC-B9] seeded ${ROWS} detail rows over ${window.days.length} local days in ${Math.round(
      performance.now() - seededAt
    )} ms (local day of first row: ${localDayKey(window.startMs)})`
  )
}, 300_000)

afterAll(async () => {
  resetPricingCatalogForTest()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}, 60_000)

describe('getUsageInsights at 200k detail rows (AC-B9)', () => {
  it('prints the 30-day timing, cold and warm', async () => {
    const deps = {
      now: NOW,
      auditEnabled: () => true,
      readAuditRetentionMs: async () => null,
      onPricingStale: vi.fn()
    }
    resetUsageInsightsCacheForTest()
    const coldStartedAt = performance.now()
    await getUsageInsights({ range: '30d' }, deps)
    const cold = performance.now() - coldStartedAt

    const timings: number[] = []
    let last: Awaited<ReturnType<typeof getUsageInsights>> | null = null
    for (let run = 0; run < 5; run += 1) {
      const startedAt = performance.now()
      last = await getUsageInsights({ range: '30d' }, deps)
      timings.push(performance.now() - startedAt)
    }
    const sorted = [...timings].sort((left, right) => left - right)
    const median = sorted[Math.floor(sorted.length / 2)]!
    console.info(
      `[AC-B9] getUsageInsights('30d') over ${ROWS} rows: cold (past days grouped) ${cold.toFixed(
        1
      )} ms; warm runs ${timings.map((ms) => ms.toFixed(1)).join(' / ')} ms, median ${median.toFixed(
        1
      )} ms; target < 150 ms`
    )

    const outer = Math.ceil(ROWS / OUTER_EVERY)
    expect(last?.breakdown.coverage.detailRequests).toBe(ROWS - outer)
    expect(last?.totals.requestCount).toBe(6500 * 30)
    expect(last?.breakdown.caller.some((row) => row.key === '' && row.operation)).toBe(true)
  }, 120_000)
})
