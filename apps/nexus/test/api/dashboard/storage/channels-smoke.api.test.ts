import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPlatformGovernanceAnalytics,
  listPlatformGovernanceEvents,
  upsertPlatformGovernanceConfig,
} from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
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

let smokeStorageHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  smokeStorageHandler = (await import('../../../../server/api/dashboard/storage/channels/smoke.post')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/dashboard/storage/channels/smoke/${marker}`,
    node: {
      req: {
        url: `/api/dashboard/storage/channels/smoke/${marker}`,
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/storage/channels/smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
  })

  it('records dry-run smoke evidence for the selected storage policy without raw actor ids', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    const policy = await upsertPlatformGovernanceConfig(event, {
      configType: 'storage_channel',
      name: `Memory smoke ${marker}`,
      channel: 'memory',
      provider: 'memory',
      targetId: `storage-smoke-${marker}`,
      limits: {
        maxBytes: 1024,
      },
    }, 'admin')

    h3Mocks.readBody.mockResolvedValueOnce({
      policyId: policy.id,
      mode: 'dry-run',
    })
    const result = await smokeStorageHandler(event)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result).toMatchObject({
      policyId: policy.id,
      policyName: `Memory smoke ${marker}`,
      mode: 'dry-run',
      status: 'ready',
      reason: 'storage-channel-resolved',
      channel: 'memory',
      provider: 'memory',
      operations: ['resolve'],
      bytesWritten: 0,
      bytesRead: 0,
      storageChannel: null,
      storageProvider: null,
      credentialRequired: false,
      hasCredentialRef: false,
      hasCredential: null,
    })

    const events = await listPlatformGovernanceEvents(event, {
      scope: 'storage',
      action: 'storage.channel_smoke.ready',
      resourceType: 'storage_channel',
      resourceId: policy.id,
      limit: 20,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      resourceId: policy.id,
      channel: 'memory',
      unit: 'smoke',
      quantity: 1,
      metadata: expect.objectContaining({
        policyName: `Memory smoke ${marker}`,
        provider: 'memory',
        mode: 'dry-run',
        reason: 'storage-channel-resolved',
      }),
    })
    expect(JSON.stringify(events)).not.toContain('admin_1')
  })

  it('records local write smoke artifact evidence without raw object details', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(`write-${marker}`)
    const resourceType = `storage-smoke-local-${marker}`
    const policy = await upsertPlatformGovernanceConfig(event, {
      configType: 'storage_channel',
      name: `Memory write smoke ${marker}`,
      channel: 'memory',
      provider: 'memory',
      targetId: resourceType,
      limits: {
        maxBytes: 1024,
        trafficBytes: 1024,
        maxOperations: 10,
      },
    }, 'admin')

    h3Mocks.readBody.mockResolvedValueOnce({
      policyId: policy.id,
      mode: 'write',
    })
    const result = await smokeStorageHandler(event)

    expect(result).toMatchObject({
      policyId: policy.id,
      policyName: `Memory write smoke ${marker}`,
      mode: 'write',
      status: 'sent',
      reason: 'storage-channel-write-read-delete-ok',
      channel: 'memory',
      provider: 'memory',
      resourceType,
      operations: ['resolve', 'write', 'read', 'delete'],
      bytesWritten: 21,
      bytesRead: 21,
      storageChannel: 'memory',
      storageProvider: 'memory',
      credentialRequired: false,
      hasCredentialRef: false,
      hasCredential: null,
    })

    const smokeEvents = await listPlatformGovernanceEvents(event, {
      scope: 'storage',
      action: 'storage.channel_smoke.sent',
      resourceType: 'storage_channel',
      resourceId: policy.id,
      limit: 20,
    })
    expect(smokeEvents).toEqual([
      expect.objectContaining({
        action: 'storage.channel_smoke.sent',
        resourceId: policy.id,
        channel: 'memory',
        unit: 'smoke',
        quantity: 1,
        metadata: expect.objectContaining({
          policyName: `Memory write smoke ${marker}`,
          provider: 'memory',
          mode: 'write',
          reason: 'storage-channel-write-read-delete-ok',
          operations: ['resolve', 'write', 'read', 'delete'],
          bytesWritten: 21,
          bytesRead: 21,
          storageChannel: 'memory',
          storageProvider: 'memory',
        }),
      }),
    ])

    const governanceResourceId = `storage-smoke:${policy.id}`
    const usageEvents = await listPlatformGovernanceEvents(event, {
      scope: 'storage',
      resourceType,
      resourceId: governanceResourceId,
      limit: 20,
    })
    expect(usageEvents).toHaveLength(3)
    expect(usageEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 21,
      }),
      expect.objectContaining({
        action: 'storage.read',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 21,
      }),
      expect.objectContaining({
        action: 'storage.delete',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'operation',
        quantity: 1,
      }),
    ]))

    const analytics = await getPlatformGovernanceAnalytics(event, { days: 30, limit: 5000, topLimit: 50 })
    expect(analytics.storage.smokeEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: policy.id,
        policyName: `Memory write smoke ${marker}`,
        channel: 'memory',
        provider: 'memory',
        mode: 'write',
        status: 'sent',
        reason: 'storage-channel-write-read-delete-ok',
        operations: ['resolve', 'write', 'read', 'delete'],
        bytesWritten: 21,
        bytesRead: 21,
        storageChannel: 'memory',
        storageProvider: 'memory',
        sent: 1,
      }),
    ]))
    expect(analytics.storage.byResourceTypeUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: resourceType,
        storedBytes: 21,
        trafficBytes: 21,
        operations: 3,
        writes: 1,
        reads: 1,
        deletes: 1,
      }),
    ]))

    const serialized = JSON.stringify({ result, smokeEvents, usageEvents, storage: analytics.storage })
    expect(serialized).not.toContain('admin_1')
    expect(serialized).not.toContain('diagnostics/storage-smoke')
    expect(serialized).not.toContain('.bin')
    expect(serialized).not.toContain('secure://storage')
    expect(serialized).not.toContain('tuff-storage-smoke-v1')
  })

  it('rejects invalid smoke modes and missing storage policies', async () => {
    const event = makeEvent(crypto.randomUUID())

    h3Mocks.readBody.mockResolvedValueOnce({
      policyId: 'missing-storage-policy',
      mode: 'dry-run',
    })
    await expect(smokeStorageHandler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Storage channel policy not found.',
    })

    const policy = await upsertPlatformGovernanceConfig(event, {
      configType: 'storage_channel',
      name: 'Mode validation storage',
      channel: 'memory',
      provider: 'memory',
      limits: {
        maxBytes: 1024,
      },
    }, 'admin')

    h3Mocks.readBody.mockResolvedValueOnce({
      policyId: policy.id,
      mode: 'force',
    })
    await expect(smokeStorageHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'mode must be dry-run or write.',
    })
  })
})
