import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertIntelligenceProviderQuota,
  getPlatformGovernanceAnalytics,
  listPlatformGovernanceEvents,
  recordPlatformGovernanceEvent,
  upsertPlatformGovernanceConfig,
} from './platformGovernanceStore'

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

function event(providerId: string) {
  return {
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
    path: `/test/${providerId}`,
  } as any
}

describe('platformGovernanceStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores actor/context fingerprints without raw actor ids', async () => {
    const providerId = `provider_${crypto.randomUUID()}`
    const record = await recordPlatformGovernanceEvent(event(providerId), {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'user@example.com',
      resourceType: 'plugin',
      resourceId: providerId,
      channel: 'feature-x',
      unit: 'call',
      quantity: 1,
      metadata: {
        pluginName: 'Demo Plugin',
      },
    })

    expect(record.actorHash).toMatch(/^[a-f0-9]{64}$/)
    expect(record.actorHash).not.toBe('user@example.com')
    expect(JSON.stringify(record)).not.toContain('user@example.com')

    const rows = await listPlatformGovernanceEvents(event(providerId), {
      resourceType: 'plugin',
      resourceId: providerId,
      limit: 10,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      scope: 'plugin',
      action: 'invoke',
      resourceId: providerId,
      unit: 'call',
      quantity: 1,
    })
  })

  it('rejects plaintext secrets in governance configs', async () => {
    await expect(upsertPlatformGovernanceConfig(event('secrets'), {
      configType: 'notification_channel',
      name: 'Resend primary',
      provider: 'resend',
      channel: 'email',
      config: {
        apiKey: 'plain-secret',
      },
    }, 'admin')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('enforces intelligence provider request quotas before dispatch', async () => {
    const providerId = `provider_${crypto.randomUUID()}`
    const h3Event = event(providerId)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'intelligence_provider_quota',
      name: 'One request quota',
      targetId: providerId,
      limits: {
        maxRequests: 1,
        windowDays: 30,
      },
    }, 'admin')

    await assertIntelligenceProviderQuota(h3Event, providerId)
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'request',
      quantity: 1,
    })

    await expect(assertIntelligenceProviderQuota(h3Event, providerId)).rejects.toMatchObject({
      statusCode: 429,
    })
  })

  it('builds anonymized cockpit analytics for search, plugin, upload, and provider usage', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const pluginId = `plugin_${marker}`
    const providerId = `provider_${marker}`

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'app',
      action: 'search',
      actorId: 'searcher@example.com',
      resourceType: 'search',
      resourceId: 'corebox',
      channel: 'all',
      unit: 'search',
      quantity: 1,
      metadata: {
        queryType: 'text',
        searchScene: 'corebox',
        inputTypes: ['text'],
        providerTimings: {
          [providerId]: 120,
        },
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'download',
      actorId: 'plugin-user@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'download',
      quantity: 2,
      metadata: {
        countryCode: 'US',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-user@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'feature-x',
      unit: 'call',
      quantity: 3,
      metadata: {
        countryCode: 'US',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.completed',
      actorId: 'admin@example.com',
      resourceType: 'resource',
      resourceId: `asset_${marker}`,
      channel: 'image/png',
      unit: 'byte',
      quantity: 2048,
      metadata: {
        extension: 'png',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'request',
      quantity: 1,
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.usage',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'token',
      quantity: 512,
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })

    expect(JSON.stringify(analytics)).not.toContain('searcher@example.com')
    expect(analytics.searches.byQueryType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'text', events: 1 }),
    ]))
    expect(analytics.searches.byProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerId, events: 1 }),
    ]))
    expect(analytics.plugins.leaderboard).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId,
        downloads: 2,
        invocations: 3,
        uniqueActors: 1,
      }),
    ]))
    expect(analytics.uploads.completed).toBeGreaterThanOrEqual(1)
    expect(analytics.uploads.bytes).toBeGreaterThanOrEqual(2048)
    expect(analytics.uploads.byExtension).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'png', quantity: 2048 }),
    ]))
    expect(analytics.providers.leaderboard).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        requests: 1,
        tokens: 512,
      }),
    ]))
  })
})
