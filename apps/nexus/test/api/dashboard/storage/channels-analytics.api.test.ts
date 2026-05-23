import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordStorageChannelUsage, upsertPlatformGovernanceConfig } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
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
  }
})

let getAnalyticsHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  getAnalyticsHandler = (await import('../../../../server/api/dashboard/storage/channels/analytics.get')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/dashboard/storage/channels/analytics/${marker}`,
    node: {
      req: {
        url: '/api/dashboard/storage/channels/analytics',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/storage/channels/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin@example.com',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({})
  })

  it('returns channel drill-down usage, policy risks, and sanitized records', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    const resourceType = `scene-output-image-${marker}`
    const resourceId = `raw/scene/output/${marker}.png`

    const policy = await upsertPlatformGovernanceConfig(event, {
      configType: 'storage_channel',
      name: `OSS drill-down budget ${marker}`,
      channel: 'oss',
      provider: 'aliyun-oss',
      targetId: resourceType,
      config: {
        credentialRef: `secure://storage/oss-${marker}`,
        bucket: 'nexus-assets',
        endpoint: 'oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
      },
      limits: {
        maxBytes: 1000,
        trafficBytes: 500,
        maxOperations: 4,
        alertBytes: 700,
        windowDays: 30,
      },
      warningThreshold: 70,
    }, 'admin')

    await recordStorageChannelUsage(event, {
      action: 'storage.write',
      actorId: 'storage-user@example.com',
      channel: 'oss',
      provider: 'aliyun-oss',
      resourceType,
      resourceId,
      quantity: 760,
    })
    await recordStorageChannelUsage(event, {
      action: 'storage.read',
      actorId: 'storage-user@example.com',
      channel: 'oss',
      provider: 'aliyun-oss',
      resourceType,
      resourceId,
      quantity: 450,
    })
    await recordStorageChannelUsage(event, {
      action: 'storage.delete',
      actorId: 'storage-user@example.com',
      channel: 'oss',
      provider: 'aliyun-oss',
      resourceType,
      resourceId,
      unit: 'operation',
      quantity: 1,
    })
    await recordStorageChannelUsage(event, {
      action: 'storage.write',
      actorId: 'other-storage-user@example.com',
      channel: 'oss',
      provider: 'other-oss',
      resourceType,
      resourceId: `raw/scene/output/${marker}-other.png`,
      quantity: 999,
    })
    h3Mocks.getQuery.mockReturnValue({
      days: '30',
      limit: '100',
      topLimit: '10',
      channel: 'oss',
      provider: 'aliyun-oss',
    })

    const result = await getAnalyticsHandler(event)
    const serialized = JSON.stringify(result)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    expect(result).toMatchObject({
      channel: 'oss',
      provider: 'aliyun-oss',
      storedBytes: 760,
      trafficBytes: 450,
      operations: 3,
      writes: 1,
      reads: 1,
      deletes: 1,
      totalEvents: 3,
      uniqueActors: 1,
    })
    expect(result.byResourceTypeUsage).toEqual([
      expect.objectContaining({
        key: resourceType,
        storedBytes: 760,
        trafficBytes: 450,
        operations: 3,
        uniqueActors: 1,
      }),
    ])
    expect(result.byActionUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'storage.write', storedBytes: 760, operations: 1 }),
      expect.objectContaining({ key: 'storage.read', trafficBytes: 450, operations: 1 }),
      expect.objectContaining({ key: 'storage.delete', deletes: 1, operations: 1 }),
    ]))
    expect(result.trend.at(-1)).toEqual(expect.objectContaining({
      storedBytes: 760,
      trafficBytes: 450,
      operations: 3,
      uniqueActors: 1,
    }))
    expect(result.channelPressure).toEqual([
      expect.objectContaining({
        channel: 'oss',
        provider: 'aliyun-oss',
        pressureStatus: 'warning',
        policyId: policy.id,
        policyName: `OSS drill-down budget ${marker}`,
        policyAlerts: 1,
        highestUtilization: 90,
        storedBytes: 760,
        trafficBytes: 450,
        operations: 3,
      }),
    ])
    expect(result.evaluations).toEqual([
      expect.objectContaining({
        policyId: policy.id,
        status: 'warning',
        reasons: expect.arrayContaining(['alert-bytes-reached', 'max-bytes-warning', 'traffic-bytes-warning', 'operation-limit-warning']),
        usage: expect.objectContaining({
          storedBytes: 760,
          trafficBytes: 450,
          operations: 3,
        }),
      }),
    ])
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ policyId: policy.id, metric: 'storedBytes', limitKey: 'alertBytes' }),
      expect.objectContaining({ policyId: policy.id, metric: 'trafficBytes', limitKey: 'trafficBytes' }),
      expect.objectContaining({ policyId: policy.id, metric: 'operations', limitKey: 'maxOperations' }),
    ]))
    expect(result.policies).toEqual([
      expect.objectContaining({
        id: policy.id,
        channel: 'oss',
        provider: 'aliyun-oss',
        enabled: true,
      }),
    ])
    expect(serialized).not.toContain('storage-user@example.com')
    expect(serialized).not.toContain('other-storage-user@example.com')
    expect(serialized).not.toContain(resourceId)
    expect(serialized).not.toContain(`raw/scene/output/${marker}-other.png`)
    expect(serialized).not.toContain(`secure://storage/oss-${marker}`)
    expect(serialized).not.toContain('nexus-assets')
  })
})
