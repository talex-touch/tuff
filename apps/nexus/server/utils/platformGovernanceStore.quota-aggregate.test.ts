import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * Provider quotas and storage policies against real SQLite, with more events in the window than the
 * 5,000 the event listing returns: the checks have to count the window, not its newest page.
 */

let store: typeof import('./platformGovernanceStore')
let d1: SqliteD1Database

function eventFor() {
  return { context: { cloudflare: { env: { DB: d1 } } } } as any
}

/** Inserts `count` events one minute apart, newest first from an hour ago. */
function insertEvents(count: number, row: { scope: string, action: string, unit: string, quantity: number, resourceType?: string, resourceId?: string, channel?: string, metadata?: Record<string, unknown> }) {
  const insert = d1.sqlite.prepare(`
    INSERT INTO platform_governance_events (id, scope, action, resource_type, resource_id, channel, unit, quantity, metadata_json, occurred_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  d1.sqlite.exec('BEGIN')
  const base = Date.now() - 60 * 60 * 1000
  for (let index = 0; index < count; index += 1) {
    const at = new Date(base - index * 60 * 1000).toISOString()
    insert.run(`${row.action}-${index}-${Math.random()}`, row.scope, row.action, row.resourceType ?? null, row.resourceId ?? null, row.channel ?? null, row.unit, row.quantity, JSON.stringify(row.metadata ?? {}), at, at)
  }
  d1.sqlite.exec('COMMIT')
}

async function quota(limits: Record<string, number>, channel?: string) {
  await store.upsertPlatformGovernanceConfig(eventFor(), {
    configType: 'intelligence_provider_quota',
    name: 'quota',
    targetId: 'prv_a',
    channel,
    enabled: true,
    limits,
  }, 'admin')
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./platformGovernanceStore')
  d1 = createSqliteD1()
  // Creates the governance tables.
  await store.listPlatformGovernanceConfigs(eventFor(), {})
})

afterEach(() => {
  d1.close()
})

describe('assertIntelligenceProviderQuota', () => {
  it('blocks a request limit above 5,000 once the window holds more requests than that', async () => {
    await quota({ windowDays: 30, maxRequests: 5500 })
    insertEvents(6000, { scope: 'intelligence', action: 'provider.request', unit: 'request', quantity: 1, resourceType: 'provider', resourceId: 'prv_a' })

    await expect(store.assertIntelligenceProviderQuota(eventFor(), 'prv_a')).rejects.toMatchObject({
      statusCode: 429,
      data: { code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED', limit: 5500 },
    })
  })

  it('lets requests through under the limit, counting only the provider, channel and window', async () => {
    await quota({ windowDays: 30, maxRequests: 5500 }, 'text.chat')
    insertEvents(5000, { scope: 'intelligence', action: 'provider.request', unit: 'request', quantity: 1, resourceType: 'provider', resourceId: 'prv_a', channel: 'text.chat' })
    insertEvents(1000, { scope: 'intelligence', action: 'provider.request', unit: 'request', quantity: 1, resourceType: 'provider', resourceId: 'prv_a', channel: 'vision.ocr' })
    insertEvents(1000, { scope: 'intelligence', action: 'provider.request', unit: 'request', quantity: 1, resourceType: 'provider', resourceId: 'prv_b', channel: 'text.chat' })

    await expect(store.assertIntelligenceProviderQuota(eventFor(), 'prv_a', 'text.chat')).resolves.toBeUndefined()
  })

  it('counts the invoke meter\'s 1k_tokens usage, which is a token count, toward the token limit', async () => {
    await quota({ windowDays: 30, maxTokens: 20_000 })
    insertEvents(3, { scope: 'intelligence', action: 'provider.usage', unit: '1k_tokens', quantity: 7_000, resourceType: 'provider', resourceId: 'prv_a' })

    await expect(store.assertIntelligenceProviderQuota(eventFor(), 'prv_a')).rejects.toMatchObject({
      data: { code: 'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED' },
    })
  })
})

describe('assertStorageChannelPolicy', () => {
  it('enforces an operation limit above 5,000', async () => {
    await store.upsertPlatformGovernanceConfig(eventFor(), {
      configType: 'storage_channel',
      name: 'r2 policy',
      channel: 'r2',
      provider: 'cloudflare-r2',
      enabled: true,
      limits: { maxOperations: 5500, windowDays: 30 },
    }, 'admin')
    insertEvents(6000, { scope: 'storage', action: 'storage.read', unit: 'byte', quantity: 10, channel: 'r2', metadata: { provider: 'cloudflare-r2' } })

    await expect(store.assertStorageChannelPolicy(eventFor(), { action: 'storage.read', channel: 'r2', provider: 'cloudflare-r2', unit: 'byte', quantity: 10 }))
      .rejects.toMatchObject({ statusCode: 429 })
  })

  it('counts only the policy provider\'s events and adds read bytes to traffic', async () => {
    await store.upsertPlatformGovernanceConfig(eventFor(), {
      configType: 'storage_channel',
      name: 'r2 policy',
      channel: 'r2',
      provider: 'cloudflare-r2',
      enabled: true,
      limits: { trafficBytes: 100_000, windowDays: 30 },
    }, 'admin')
    insertEvents(6000, { scope: 'storage', action: 'storage.read', unit: 'byte', quantity: 10, channel: 'r2', metadata: { provider: 'other' } })
    insertEvents(40, { scope: 'storage', action: 'storage.read', unit: 'byte', quantity: 1000, channel: 'r2', metadata: { provider: 'cloudflare-r2' } })

    await expect(store.assertStorageChannelPolicy(eventFor(), { action: 'storage.read', channel: 'r2', provider: 'cloudflare-r2', unit: 'byte', quantity: 59_000 }))
      .resolves.toBeUndefined()
    await expect(store.assertStorageChannelPolicy(eventFor(), { action: 'storage.read', channel: 'r2', provider: 'cloudflare-r2', unit: 'byte', quantity: 60_001 }))
      .rejects.toMatchObject({ statusCode: 429 })
  })
})
