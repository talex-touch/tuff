/**
 * Pricing through the real SDK, audit logger and a fully migrated libSQL database: an invocation
 * never waits on the catalog, and each flush prices with whatever catalog is stored.
 *
 * Fixture: `__fixtures__/models-dev-subset.json` is a verbatim cut of https://models.dev/api.json
 * downloaded on 2026-10-03 (openai gpt-4o-mini is listed at $0.15 / $0.6 per 1M tokens).
 */
import type { Client } from '@libsql/client'
import type { IntelligenceInvokeResult } from '@talex-touch/tuff-intelligence'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../intelligence-test-harness'
import * as schema from '../../../db/schema'
import { intelligenceAuditLogs } from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from '../intelligence-capability-registry'
import { setIntelligenceProviderManager, TuffIntelligenceSDK } from '../intelligence-sdk'
import { createChatProvider, FakeProviderManager } from '../intelligence-test-harness'
import {
  getPricingCatalogStatus,
  refreshPricingCatalog,
  requestPricingRefresh,
  resetPricingCatalogForTest,
  waitForPricingSinceMarkerForTest
} from './models-dev-catalog'
import { resolveModelPricing } from './model-pricing'

const networkMocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('../../network', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getNetworkService: () => ({ request: networkMocks.request })
}))

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')
const callerId = 'plugin:pricing-integration'

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string
let fixtureText: string

/** A custom channel on a gateway models.dev does not list, so the model family prices it. */
function installChannel(options: { id: string; traceId: string; nexus?: boolean }) {
  intelligenceCapabilityRegistry.clear()
  intelligenceCapabilityRegistry.register({
    id: 'text.chat',
    type: IntelligenceCapabilityType.CHAT,
    name: 'Pricing Chat',
    description: 'synthetic pricing integration',
    supportedProviders: [IntelligenceProviderType.CUSTOM]
  })
  const chat = vi.fn(
    async (): Promise<IntelligenceInvokeResult<string>> => ({
      result: 'ok',
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      model: 'gpt-4o-mini',
      latency: 12,
      traceId: options.traceId,
      provider: options.id
    })
  )
  const provider = createChatProvider(
    {
      id: options.id,
      type: IntelligenceProviderType.CUSTOM,
      name: options.id,
      enabled: true,
      priority: 1,
      apiKey: 'sk-test-only',
      baseUrl: 'https://gateway.example.net/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      capabilities: ['text.chat'],
      metadata: options.nexus ? { origin: 'tuff-nexus' } : undefined
    },
    chat
  )
  setIntelligenceProviderManager(new FakeProviderManager([provider]))
  return new TuffIntelligenceSDK({
    enableAudit: true,
    enableQuota: false,
    enableCache: false,
    capabilities: {
      'text.chat': { providers: [{ providerId: options.id, priority: 1 }] }
    }
  })
}

async function invokeAndReadCost(sdk: TuffIntelligenceSDK, traceId: string) {
  const result = await sdk.invoke<string>(
    'text.chat',
    { messages: [{ role: 'user', content: 'synthetic pricing request' }] },
    { metadata: { caller: callerId } }
  )
  await intelligenceAuditLogger.flushToDB()
  const rows = await db
    .select()
    .from(intelligenceAuditLogs)
    .where(eq(intelligenceAuditLogs.traceId, traceId))
  return { result, rows }
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-pricing-audit-'))
  client = createClient({ url: `file:${join(tempDir, 'pricing-audit.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await intelligenceAuditLogger.destroy()
  fixtureText = await readFile(resolve(testDir, '__fixtures__/models-dev-subset.json'), 'utf8')
}, 60_000)

beforeEach(() => {
  networkMocks.request.mockReset()
  resetPricingCatalogForTest()
})

afterAll(async () => {
  await intelligenceAuditLogger.flushToDB()
  await waitForPricingSinceMarkerForTest()
  await dbWriteScheduler.drain()
  intelligenceCapabilityRegistry.clear()
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}, 60_000)

describe('pricing in the audit path', () => {
  it('offline with no catalog: the invoke completes and is recorded at cost 0', async () => {
    // A catalog request that never answers must not hold up the call or its audit flush.
    networkMocks.request.mockReturnValue(new Promise(() => {}))
    requestPricingRefresh()

    const traceId = 'trace-pricing-offline'
    const { result, rows } = await invokeAndReadCost(
      installChannel({ id: 'gateway-channel', traceId }),
      traceId
    )

    expect(result.result).toBe('ok')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'gateway-channel', model: 'gpt-4o-mini' })
    expect(rows[0]?.estimatedCost).toBe(0)
    expect(getPricingCatalogStatus().available).toBe(false)
    expect(
      resolveModelPricing({ providerId: 'gateway-channel', model: 'gpt-4o-mini' }).status
    ).toBe('unpriced')
  })

  it('prices the next flush from the stored catalog, through the live channel config', async () => {
    networkMocks.request.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: { etag: 'W/"v1"' },
      data: fixtureText,
      url: 'https://models.dev/api.json',
      ok: true
    })
    await expect(refreshPricingCatalog()).resolves.toBe('updated')

    const pricedTrace = 'trace-pricing-priced'
    const priced = await invokeAndReadCost(
      installChannel({ id: 'gateway-channel', traceId: pricedTrace }),
      pricedTrace
    )
    // (1000 × 0.15 + 500 × 0.6) / 1e6
    expect(priced.rows[0]?.estimatedCost).toBeCloseTo(0.00045, 9)

    // Same model, but the live channel config says Nexus: credits, not USD.
    const nexusTrace = 'trace-pricing-nexus'
    const nexus = await invokeAndReadCost(
      installChannel({ id: 'nexus-mirror', traceId: nexusTrace, nexus: true }),
      nexusTrace
    )
    expect(nexus.rows[0]?.estimatedCost).toBe(0)
  })
})
