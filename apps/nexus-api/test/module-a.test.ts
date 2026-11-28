import { afterEach, describe, expect, it, vi } from 'vitest'
import providerDeleteHandler from '../server/api/admin/ai/providers/[id].delete'
import providerPatchHandler from '../server/api/admin/ai/providers/[id].patch'
import providersGetHandler from '../server/api/admin/ai/providers/index.get'
import providersPostHandler from '../server/api/admin/ai/providers/index.post'
import scenesGetHandler from '../server/api/admin/ai/scenes/index.get'
import scenesPutHandler from '../server/api/admin/ai/scenes/index.put'
import aiUsageHandler from '../server/api/admin/ai/usage.get'
import adminExchangeRefreshHandler from '../server/api/admin/exchange/refresh.post'
import exchangeConvertHandler from '../server/api/exchange/convert.get'
import exchangeHistoryHandler from '../server/api/exchange/history.get'
import exchangeLatestHandler from '../server/api/exchange/latest.get'
import exchangeRefreshTask from '../server/tasks/exchange/refresh'
import { createAudit } from '../server/utils/intelligenceStore'
import {
  buildSessionCookieHeader,
  createMemoryKv,
  createSqliteD1Database,
  createTestEvent,
  seedTestUser,
} from './helpers/test-runtime'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Module A: Decoupled Exchange + Unified AI Gateway Admin', () => {
  it('refreshes USD rates via Cron task & admin endpoint into D1 + KV without creating dashboard updates', async () => {
    const db = createSqliteD1Database()
    const kv = createMemoryKv()
    const admin = await seedTestUser(db, { email: 'admin@example.com', role: 'admin' })
    const adminCookie = await buildSessionCookieHeader({ userId: admin.id, email: admin.email, role: 'admin' })

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({
        result: 'success',
        base_code: 'USD',
        time_last_update_unix: 1_760_000_000,
        time_next_update_unix: 1_760_028_800,
        conversion_rates: {
          USD: 1,
          CNY: 7.25,
          EUR: 0.92,
          JPY: 150.5,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    // 1. Trigger via admin manual refresh
    const refreshEvent = createTestEvent({
      db,
      kv,
      method: 'POST',
      url: '/api/admin/exchange/refresh',
      headers: { cookie: adminCookie },
      env: { EXCHANGE_RATE_API_KEY: 'fx-test-key-123456' },
      body: { force: true },
    })
    const refreshRes = await adminExchangeRefreshHandler(refreshEvent)
    expect(refreshRes.ok).toBe(true)
    expect(refreshRes.snapshot.base).toBe('USD')
    expect(refreshRes.snapshot.currencyCount).toBe(4)
    expect(kv.store.size).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 2. Public GET /api/exchange/latest reads from KV cache without calling upstream fetch again
    const latestRes = await exchangeLatestHandler(createTestEvent({
      db,
      kv,
      url: '/api/exchange/latest?base=USD&symbols=CNY,EUR',
    })) as { base: string, rates: Record<string, number> }
    expect(latestRes.base).toBe('USD')
    expect(latestRes.rates.CNY).toBe(7.25)
    expect(latestRes.rates.EUR).toBe(0.92)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 3. Public GET /api/exchange/convert computes cross-rate accurately
    const convertRes = await exchangeConvertHandler(createTestEvent({
      db,
      kv,
      url: '/api/exchange/convert?from=USD&to=CNY&amount=10',
    })) as { converted: number }
    expect(convertRes.converted).toBeCloseTo(72.5, 4)

    // 4. Public GET /api/exchange/history returns D1 snapshots
    const historyRes = await exchangeHistoryHandler(createTestEvent({
      db,
      kv,
      url: '/api/exchange/history?limit=5',
    })) as { items: unknown[] }
    expect(historyRes.items.length).toBeGreaterThanOrEqual(1)

    // 5. Cron task executes cleanly
    const cronRes = await exchangeRefreshTask.run({
      name: 'exchange:refresh',
      payload: {},
      context: {
        cloudflare: {
          env: {
            DB: db,
            TUFF_INTELLIGENCE_RUNTIME: kv,
            EXCHANGE_RATE_API_KEY: 'fx-test-key-123456',
          },
        },
      } as any,
    })
    expect((cronRes.result as any).ok).toBe(true)
    expect((cronRes.result as any).currencyCount).toBe(4)

    // Verify NO dashboard_updates table was touched by exchange refresh
    const tables = db.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dashboard_updates'`).all()
    expect(tables).toEqual([])
  })

  it('manages unified AI providers (encrypted credentials never leaked), scenes, and SQL GROUP BY usage', async () => {
    const db = createSqliteD1Database()
    const kv = createMemoryKv()
    const admin = await seedTestUser(db, { email: 'ai-admin@example.com', role: 'admin' })
    const adminCookie = await buildSessionCookieHeader({ userId: admin.id, email: admin.email, role: 'admin' })

    // Create provider with cohesive capabilities, models, encrypted credential, and quota
    const createRes = await providersPostHandler(createTestEvent({
      db,
      kv,
      method: 'POST',
      url: '/api/admin/ai/providers',
      headers: { cookie: adminCookie },
      body: {
        name: 'openai-primary',
        displayName: 'OpenAI Primary',
        vendor: 'custom',
        protocol: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        authType: 'api_key',
        credentials: { apiKey: 'sk-super-secret-plaintext-never-leak' },
        models: ['gpt-4o-mini'],
        capabilities: ['chat.completion'],
        quota: { requestsPerMinute: 60, tokensPerDay: 500_000 },
      },
    }))
    const providerId = createRes.provider.id
    expect(createRes.provider.hasCredential).toBe(true)
    expect(createRes.provider.quota).toMatchObject({ requestsPerMinute: 60, tokensPerDay: 500_000 })
    expect(JSON.stringify(createRes)).not.toContain('sk-super-secret-plaintext-never-leak')

    // List providers — never leaks plaintext credentials
    const listRes = await providersGetHandler(createTestEvent({
      db,
      kv,
      url: '/api/admin/ai/providers',
      headers: { cookie: adminCookie },
    }))
    expect(listRes.providers).toHaveLength(1)
    expect(listRes.providers[0].hasCredential).toBe(true)
    expect(JSON.stringify(listRes)).not.toContain('sk-super-secret-plaintext-never-leak')

    // Patch provider quota
    const patchRes = await providerPatchHandler(createTestEvent({
      db,
      kv,
      method: 'PATCH',
      url: `/api/admin/ai/providers/${providerId}`,
      params: { id: providerId },
      headers: { cookie: adminCookie },
      body: {
        quota: { requestsPerMinute: 120 },
      },
    }))
    expect(patchRes.provider.quota).toMatchObject({ requestsPerMinute: 120 })

    // Upsert scene routing binding to this provider
    const scenePutRes = await scenesPutHandler(createTestEvent({
      db,
      kv,
      method: 'PUT',
      url: '/api/admin/ai/scenes',
      headers: { cookie: adminCookie },
      body: {
        id: 'scene.chat.default',
        displayName: 'Default Chat',
        owner: 'nexus',
        requiredCapabilities: ['chat.completion'],
        strategyMode: 'priority',
        bindings: [{ providerId, capability: 'chat.completion', model: 'gpt-4o-mini', priority: 1 }],
      },
    }))
    expect(scenePutRes.scene.id).toBe('scene.chat.default')

    const scenesRes = await scenesGetHandler(createTestEvent({
      db,
      kv,
      url: '/api/admin/ai/scenes',
      headers: { cookie: adminCookie },
    }))
    expect(scenesRes.scenes.some((s: any) => s.id === 'scene.chat.default')).toBe(true)

    // Seed intelligence_audits rows and verify SQL GROUP BY aggregation
    const auditEvent = createTestEvent({ db, kv })
    await createAudit(auditEvent, {
      userId: admin.id,
      providerId,
      providerType: 'openai',
      model: 'gpt-4o-mini',
      latency: 200,
      success: true,
      metadata: { totalTokens: 150 },
    })
    await createAudit(auditEvent, {
      userId: admin.id,
      providerId,
      providerType: 'openai',
      model: 'gpt-4o-mini',
      latency: 400,
      success: false,
      errorMessage: 'rate limited',
      metadata: { totalTokens: 300 },
    })

    const usageRes = await aiUsageHandler(createTestEvent({
      db,
      kv,
      url: '/api/admin/ai/usage?days=30',
      headers: { cookie: adminCookie },
    }))
    expect(usageRes.summary.totalRequests).toBe(2)
    expect(usageRes.summary.successCount).toBe(1)
    expect(usageRes.summary.failureCount).toBe(1)
    expect(usageRes.summary.totalTokens).toBe(450)
    expect(usageRes.summary.avgLatencyMs).toBe(300)
    expect(usageRes.byModel).toHaveLength(1)
    expect(usageRes.byModel[0].model).toBe('gpt-4o-mini')

    // Delete provider cleanly
    const delRes = await providerDeleteHandler(createTestEvent({
      db,
      kv,
      method: 'DELETE',
      url: `/api/admin/ai/providers/${providerId}`,
      params: { id: providerId },
      headers: { cookie: adminCookie },
    }))
    expect(delRes.ok).toBe(true)
  })
})
