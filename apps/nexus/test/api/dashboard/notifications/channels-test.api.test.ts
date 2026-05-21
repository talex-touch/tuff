import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPlatformGovernanceEvents } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

const credentialMocks = vi.hoisted(() => ({
  getNotificationCredential: vi.fn(),
  notificationCredentialExists: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))
vi.mock('../../../../server/utils/notificationCredentialStore', () => credentialMocks)

let upsertChannelHandler: (event: any) => Promise<any>
let testChannelHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  upsertChannelHandler = (await import('../../../../server/api/dashboard/notifications/channels.post')).default as (event: any) => Promise<any>
  testChannelHandler = (await import('../../../../server/api/dashboard/notifications/channels/test.post')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/dashboard/notifications/channels/test/${marker}`,
    node: {
      req: {
        url: `/api/dashboard/notifications/channels/test/${marker}`,
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/notifications/channels/test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    credentialMocks.getNotificationCredential.mockResolvedValue(null)
    credentialMocks.notificationCredentialExists.mockResolvedValue(null)
  })

  it('plans only the selected notification channel and keeps recipients out of governance events', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)

    h3Mocks.readBody.mockResolvedValueOnce({
      name: `Selected browser ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: 'browser',
      config: {
        events: ['system.notification.test'],
      },
    })
    const selected = (await upsertChannelHandler(event)).channel

    h3Mocks.readBody.mockResolvedValueOnce({
      name: `Other browser ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: `browser-other-${marker}`,
      config: {
        events: ['system.notification.test'],
      },
    })
    const other = (await upsertChannelHandler(event)).channel

    h3Mocks.readBody.mockResolvedValueOnce({
      configId: selected.id,
      metadata: {
        to: 'developer@example.com',
        userId: 'developer-user-1',
      },
    })
    const result = await testChannelHandler(event)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result).toMatchObject({
      channel: {
        id: selected.id,
        name: `Selected browser ${marker}`,
        channel: 'browser',
        provider: 'browser',
        enabled: true,
      },
      action: 'system.notification.test',
      mode: 'plan',
      deliveries: [
        expect.objectContaining({
          configId: selected.id,
          status: 'planned',
          reason: 'delivery-planned',
        }),
      ],
    })
    expect(JSON.stringify(result)).not.toContain(other.id)

    const events = await listPlatformGovernanceEvents(event, {
      scope: 'notification',
      action: 'notification.delivery.planned',
      resourceType: 'notification_channel',
      resourceId: selected.id,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain(selected.id)
    expect(serialized).not.toContain(other.id)
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain('developer-user-1')
  })

  it('rejects missing configs and invalid test modes', async () => {
    const event = makeEvent(crypto.randomUUID())

    h3Mocks.readBody.mockResolvedValueOnce({
      configId: 'missing-channel',
    })
    await expect(testChannelHandler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Notification channel config not found.',
    })

    h3Mocks.readBody.mockResolvedValueOnce({
      name: 'Mode validation channel',
      channel: 'browser',
      provider: 'browser',
    })
    const channel = (await upsertChannelHandler(event)).channel

    h3Mocks.readBody.mockResolvedValueOnce({
      configId: channel.id,
      mode: 'force',
    })
    await expect(testChannelHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'mode must be plan or send.',
    })
  })
})
