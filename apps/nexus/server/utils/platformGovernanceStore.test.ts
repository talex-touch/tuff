import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertIntelligenceProviderQuota,
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
})
