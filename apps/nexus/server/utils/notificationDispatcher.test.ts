import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchNotificationEvent } from './notificationDispatcher'
import { listPlatformGovernanceEvents, upsertPlatformGovernanceConfig } from './platformGovernanceStore'

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

function event(marker: string) {
  return {
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
    path: `/test/notification/${marker}`,
  } as any
}

describe('notificationDispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('plans plugin review deliveries for enabled secure notification channels', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Plugin review email ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: 'resend',
      config: {
        credentialRef: `secure://notifications/resend-${marker}`,
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        versionId: `version-${marker}`,
        ownerEmail: 'developer@example.com',
        credentialRef: `secure://notifications/resend-${marker}`,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'planned',
        reason: 'delivery-planned',
        provider: 'resend',
        credentialRequired: true,
        hasCredentialRef: true,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.planned',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain(channel.id)
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain(`secure://notifications/resend-${marker}`)
  })

  it('skips channels when the configured event list does not match', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Rejected only ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: 'browser',
      config: {
        events: ['plugin.version.rejected'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'skipped',
        reason: 'event-mismatch',
        credentialRequired: false,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.skipped',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'browser',
        quantity: 0,
      }),
    ]))
  })

  it('fails planned credentialed adapters without secure credential references', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `SMTP missing credential ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: 'smtp',
      config: {
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        to: 'developer@example.com',
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'failed',
        reason: 'credential-ref-required',
        credentialRequired: true,
        hasCredentialRef: false,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.failed',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('credential-ref-required')
    expect(serialized).not.toContain('developer@example.com')
  })
})
