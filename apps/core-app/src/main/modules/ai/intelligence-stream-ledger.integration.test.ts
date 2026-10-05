import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { IntelligenceStreamEvent } from '@talex-touch/tuff-intelligence'
import { createClient } from '@libsql/client'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import { intelligenceAuditLogs, intelligenceUsageStats, systemConfig } from '../../db/schema'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import './intelligence-test-harness'
import { intelligenceAuditLogger } from './intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { intelligenceQuotaManager } from './intelligence-quota-manager'
import { setIntelligenceProviderManager, TuffIntelligenceSDK } from './intelligence-sdk'
import { createChatProvider, FakeProviderManager } from './intelligence-test-harness'
import modelsDevFixture from './pricing/__fixtures__/models-dev-subset.json'
import { compactModelsDevCatalog, PRICING_CATALOG_CONFIG_KEY } from './pricing/models-dev-catalog'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
const callerId = 'plugin:ledger-integration'

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-intelligence-ledger-'))
  client = createClient({ url: `file:${join(tempDir, 'ledger.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  // Cost anchor basis (2026-10-03): audit costs are priced at flush time from the stored
  // models.dev catalog instead of the retired fixed table. The fixture cut lists openai
  // gpt-4o-mini at $0.15 / $0.6 per 1M tokens. Since the usage ledger (R-A4) the row records the
  // selected channel's config id `ledger-provider` — a custom channel with no base URL — so the
  // model family (gpt → openai) prices 1000 + 500 tokens at 0.00045, the same figure the old
  // table produced. (A local channel would price at 0, which is why the channel is custom.)
  await db.insert(systemConfig).values({
    key: PRICING_CATALOG_CONFIG_KEY,
    value: JSON.stringify(compactModelsDevCatalog(modelsDevFixture)),
    updatedAt: Date.now()
  })
  await intelligenceAuditLogger.destroy()
  intelligenceQuotaManager.clearCache()
}, 60_000)

afterAll(async () => {
  await intelligenceAuditLogger.flushToDB()
  await dbWriteScheduler.drain()
  intelligenceQuotaManager.clearCache()
  intelligenceCapabilityRegistry.clear()
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('stream audit ledger consistency', () => {
  it('projects one completed stream into audit, usage stats, and the live quota snapshot', async () => {
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Ledger Chat',
      description: 'synthetic stream ledger integration',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    async function* streamChunks() {
      yield {
        delta: 'ledger',
        done: false,
        traceId: 'trace-ledger-integration',
        provider: 'ledger-runtime',
        model: 'gpt-4o-mini',
        latency: 125
      }
      yield {
        delta: '',
        done: true,
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }
      }
    }

    const provider = createChatProvider(
      {
        id: 'ledger-provider',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Ledger Provider',
        enabled: true,
        priority: 1,
        apiKey: 'sk-test-only',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini'],
        capabilities: ['text.chat']
      },
      vi.fn()
    )
    provider.chatStream = vi.fn(() => streamChunks())
    setIntelligenceProviderManager(new FakeProviderManager([provider]))

    await intelligenceQuotaManager.setQuota({
      callerId,
      callerType: 'plugin',
      requestsPerMinute: 100,
      requestsPerDay: 100,
      requestsPerMonth: 100,
      tokensPerMinute: 100_000,
      tokensPerDay: 100_000,
      tokensPerMonth: 100_000,
      costLimitPerDay: 10,
      costLimitPerMonth: 10,
      enabled: true
    })

    const sdk = new TuffIntelligenceSDK({
      enableAudit: true,
      enableQuota: true,
      enableCache: false,
      capabilities: {
        'text.chat': {
          providers: [{ providerId: 'ledger-provider', priority: 1 }]
        }
      }
    })
    const events: IntelligenceStreamEvent<string>[] = []
    for await (const event of sdk.stream<string>(
      'text.chat',
      { messages: [{ role: 'user', content: 'synthetic ledger request' }] },
      { metadata: { caller: callerId } }
    )) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      type: 'end',
      traceId: 'trace-ledger-integration',
      provider: 'ledger-runtime',
      model: 'gpt-4o-mini',
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }
    })

    expect(await intelligenceQuotaManager.getCurrentUsage(callerId, 'plugin')).toMatchObject({
      requestsThisMinute: 0,
      requestsToday: 0,
      requestsThisMonth: 0
    })

    await intelligenceAuditLogger.flushToDB()

    const auditRows = await db
      .select()
      .from(intelligenceAuditLogs)
      .where(eq(intelligenceAuditLogs.caller, callerId))
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      traceId: 'trace-ledger-integration',
      capabilityId: 'text.chat',
      // The selected channel's config id; the `end` event above keeps the chunk's provider.
      provider: 'ledger-provider',
      model: 'gpt-4o-mini',
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      latency: 125,
      success: true,
      error: null
    })
    expect(auditRows[0]?.estimatedCost).toBeCloseTo(0.00045)

    const usageRows = await db
      .select()
      .from(intelligenceUsageStats)
      .where(
        and(
          eq(intelligenceUsageStats.callerId, callerId),
          eq(intelligenceUsageStats.callerType, 'plugin')
        )
      )
    expect(usageRows).toHaveLength(2)
    expect(new Set(usageRows.map((row) => row.periodType))).toEqual(new Set(['day', 'month']))
    for (const row of usageRows) {
      expect(row).toMatchObject({
        requestCount: 1,
        successCount: 1,
        failureCount: 0,
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        avgLatency: 125
      })
      expect(row.totalCost).toBeCloseTo(0.00045)
    }

    const quotaUsage = await intelligenceQuotaManager.getCurrentUsage(callerId, 'plugin')
    expect(quotaUsage).toMatchObject({
      requestsThisMinute: 1,
      requestsToday: 1,
      requestsThisMonth: 1,
      tokensThisMinute: 1500,
      tokensToday: 1500,
      tokensThisMonth: 1500
    })
    expect(quotaUsage.costToday).toBeCloseTo(0.00045)
    expect(quotaUsage.costThisMonth).toBeCloseTo(0.00045)
  })
})
