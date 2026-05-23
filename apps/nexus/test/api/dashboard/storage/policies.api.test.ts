import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordStorageChannelUsage } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  readBody: vi.fn(),
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

let getPoliciesHandler: (event: any) => Promise<any>
let postPoliciesHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  getPoliciesHandler = (await import('../../../../server/api/dashboard/storage/policies.get')).default as (event: any) => Promise<any>
  postPoliciesHandler = (await import('../../../../server/api/dashboard/storage/policies.post')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/dashboard/storage/policies/${marker}`,
    node: {
      req: {
        url: '/api/dashboard/storage/policies',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/storage/policies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin@example.com',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({})
    h3Mocks.readBody.mockResolvedValue({})
  })

  it('creates OSS storage policies and returns profiles, evaluation, and alerts without raw identifiers', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    const resourceType = `scene-output-image-${marker}`
    const resourceId = `raw/scene/output/${marker}.png`
    h3Mocks.readBody.mockResolvedValue({
      name: `OSS storage policy ${marker}`,
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
    })

    const created = await postPoliciesHandler(event)
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
    h3Mocks.getQuery.mockReturnValue({
      days: '30',
      limit: '100',
    })

    const result = await getPoliciesHandler(event)
    const serialized = JSON.stringify(result)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    expect(created.policy).toMatchObject({
      configType: 'storage_channel',
      name: `OSS storage policy ${marker}`,
      channel: 'oss',
      provider: 'aliyun-oss',
      targetId: resourceType,
      limits: expect.objectContaining({
        maxBytes: 1000,
        trafficBytes: 500,
        maxOperations: 4,
        alertBytes: 700,
      }),
      config: expect.objectContaining({
        credentialRef: `secure://storage/oss-${marker}`,
        bucket: 'nexus-assets',
        endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      }),
    })
    expect(result.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'local-memory', channel: 'memory', provider: 'memory' }),
      expect.objectContaining({ id: 'cloudflare-r2', channel: 'r2', provider: 'cloudflare-r2' }),
      expect.objectContaining({ id: 'aws-s3', channel: 's3', provider: 'aws-s3' }),
      expect.objectContaining({ id: 'aliyun-oss', channel: 'oss', provider: 'aliyun-oss' }),
    ]))
    expect(result.evaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: created.policy.id,
        channel: 'oss',
        provider: 'aliyun-oss',
        status: 'warning',
        reasons: expect.arrayContaining(['alert-bytes-reached', 'max-bytes-warning', 'traffic-bytes-warning', 'operation-limit-warning']),
        usage: expect.objectContaining({
          storedBytes: 760,
          trafficBytes: 450,
          operations: 3,
          writes: 1,
          reads: 1,
          deletes: 1,
        }),
        utilization: expect.objectContaining({
          storedBytes: 76,
          trafficBytes: 90,
          operations: 75,
        }),
        remaining: expect.objectContaining({
          storedBytes: 240,
          trafficBytes: 50,
          operations: 1,
          alertBytes: 0,
        }),
      }),
    ]))
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: created.policy.id,
        status: 'warning',
        metric: 'storedBytes',
        limitKey: 'alertBytes',
        usage: 760,
        limit: 700,
      }),
      expect.objectContaining({
        policyId: created.policy.id,
        status: 'warning',
        metric: 'trafficBytes',
        limitKey: 'trafficBytes',
        utilization: 90,
      }),
      expect.objectContaining({
        policyId: created.policy.id,
        status: 'warning',
        metric: 'operations',
        limitKey: 'maxOperations',
        utilization: 75,
      }),
    ]))
    expect(serialized).not.toContain('storage-user@example.com')
    expect(serialized).not.toContain(resourceId)
  })

  it('rejects unsupported storage policy config through the API', async () => {
    const event = makeEvent(crypto.randomUUID())
    h3Mocks.readBody.mockResolvedValue({
      name: 'Broken storage policy',
      channel: 'oss',
      provider: 'aliyun-oss',
      limits: {
        maxBytes: 1000,
      },
      config: {
        bucket: 'missing-credential-and-endpoint',
      },
    })

    await expect(postPoliciesHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'config.credentialRef is required for Aliyun OSS.',
    })
  })
})
