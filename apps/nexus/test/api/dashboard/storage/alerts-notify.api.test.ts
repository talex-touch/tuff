import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPlatformGovernanceEvents, recordStorageChannelUsage, upsertPlatformGovernanceConfig } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  getQuery: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
    readBody: h3Mocks.readBody,
  }
})
vi.mock('#imports', () => ({
  useRuntimeConfig: vi.fn(() => ({})),
}))

let notifyAlertsHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  notifyAlertsHandler = (await import('../../../../server/api/dashboard/storage/alerts/notify.post')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/dashboard/storage/alerts/notify/${marker}`,
    node: {
      req: {
        url: '/api/dashboard/storage/alerts/notify',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/storage/alerts/notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin@example.com',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({})
    h3Mocks.readBody.mockResolvedValue({})
  })

  it('plans current storage policy alerts through selected notification configs without raw identifiers', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    const resourceType = `plugin-package-${marker}`
    const policy = await upsertPlatformGovernanceConfig(event, {
      configType: 'storage_channel',
      name: `R2 warning budget ${marker}`,
      channel: 'r2',
      provider: 'cloudflare-r2',
      targetId: resourceType,
      limits: {
        maxBytes: 1000,
      },
      warningThreshold: 70,
    }, 'admin')
    const channel = await upsertPlatformGovernanceConfig(event, {
      configType: 'notification_channel',
      name: `Storage browser alerts ${marker}`,
      channel: 'browser',
      provider: 'browser',
      config: {
        events: ['storage.policy.alert'],
      },
    }, 'admin')

    await recordStorageChannelUsage(event, {
      action: 'storage.write',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType,
      resourceId: `pkg/raw/object/${marker}.zip`,
      quantity: 820,
    })

    h3Mocks.readBody.mockResolvedValue({
      mode: 'plan',
      days: 30,
      deliveryConfigIds: [channel.id],
    })

    const result = await notifyAlertsHandler(event)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    expect(result).toMatchObject({
      mode: 'plan',
      days: 30,
    })
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: policy.id,
        status: 'warning',
        metric: 'storedBytes',
        limitKey: 'maxBytes',
        usage: 820,
        limit: 1000,
        utilization: 82,
      }),
    ]))
    expect(result.dispatches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        alert: expect.objectContaining({
          policyId: policy.id,
        }),
        deliveries: expect.arrayContaining([
          expect.objectContaining({
            configId: channel.id,
            status: 'planned',
            reason: 'delivery-planned',
            resourceType: 'storage_policy',
            resourceId: policy.id,
          }),
        ]),
      }),
    ]))

    const auditEvents = await listPlatformGovernanceEvents(event, {
      scope: 'notification',
      action: 'notification.delivery.planned',
      resourceType: 'storage_policy',
      resourceId: policy.id,
      limit: 20,
    })
    const serialized = JSON.stringify(auditEvents)
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'browser',
        quantity: 1,
        metadata: expect.objectContaining({
          notificationAction: 'storage.policy.alert',
          context: expect.objectContaining({
            storageAlert: true,
            policyName: `R2 warning budget ${marker}`,
            storageChannel: 'r2',
            storageProvider: 'cloudflare-r2',
            metric: 'storedBytes',
            limitKey: 'maxBytes',
            usage: 820,
            limit: 1000,
            utilization: 82,
            status: 'warning',
            reasons: ['max-bytes-warning'],
            days: 30,
          }),
        }),
      }),
    ]))
    expect(serialized).not.toContain('storage-user@example.com')
    expect(serialized).not.toContain('admin@example.com')
    expect(serialized).not.toContain(`pkg/raw/object/${marker}.zip`)
  })

  it('rejects unsupported notification modes', async () => {
    const event = makeEvent(crypto.randomUUID())
    h3Mocks.readBody.mockResolvedValue({
      mode: 'later',
    })

    await expect(notifyAlertsHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'mode must be plan or send.',
    })
  })
})
