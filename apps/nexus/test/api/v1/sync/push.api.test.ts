import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `POST /api/v1/sync/push` reads the quota once. The device count comes with that read, and the
 * push checks against it; the count and the whole quota used to be read a second time each.
 */

const authMocks = vi.hoisted(() => ({ requireAppAuth: vi.fn() }))
const authStoreMocks = vi.hoisted(() => ({ readDeviceId: vi.fn(), countActiveDevices: vi.fn() }))
const h3Mocks = vi.hoisted(() => ({ getHeader: vi.fn(), readBody: vi.fn() }))
const syncStoreMocks = vi.hoisted(() => ({
  ensureDeviceForSync: vi.fn(),
  getOrInitQuota: vi.fn(),
  getSyncSession: vi.fn(),
  markSyncSessionError: vi.fn(),
  pushSyncItemsV1: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../../server/utils/syncStoreV1', () => syncStoreMocks)
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, getHeader: h3Mocks.getHeader, readBody: h3Mocks.readBody }
})

let pushHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  pushHandler = (await import('../../../../server/api/v1/sync/push.post')).default as (event: any) => Promise<any>
})

const quota = {
  plan_tier: 'FREE',
  limits: { storage_limit_bytes: 1000, object_limit: 10, item_limit: 100, device_limit: 2 },
  usage: { used_storage_bytes: 0, used_objects: 0, used_devices: 2 },
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.requireAppAuth.mockResolvedValue({ userId: 'user-1', deviceId: 'device-1' })
  h3Mocks.getHeader.mockReturnValue('sync-token')
  h3Mocks.readBody.mockResolvedValue({ items: [] })
  syncStoreMocks.getSyncSession.mockResolvedValue({})
  syncStoreMocks.ensureDeviceForSync.mockResolvedValue(null)
  syncStoreMocks.getOrInitQuota.mockResolvedValue(quota)
  syncStoreMocks.pushSyncItemsV1.mockResolvedValue({ conflicts: [], ackCursor: 7, appliedStorageDelta: 0, appliedObjectsDelta: 0 })
})

describe('POST /api/v1/sync/push', () => {
  it('reads the quota once and hands it to the push', async () => {
    const response = await pushHandler({ context: {} })

    expect(response).toEqual({ ack_cursor: 7, conflicts: [] })
    expect(syncStoreMocks.getOrInitQuota).toHaveBeenCalledTimes(1)
    expect(authStoreMocks.countActiveDevices).not.toHaveBeenCalled()
    expect(syncStoreMocks.pushSyncItemsV1).toHaveBeenCalledWith(expect.anything(), 'user-1', 'device-1', [], { quota })
  })

  it('still refuses a push from more devices than the plan allows, using the counted devices', async () => {
    syncStoreMocks.getOrInitQuota.mockResolvedValue({ ...quota, usage: { ...quota.usage, used_devices: 3 } })

    await expect(pushHandler({ context: {} })).rejects.toMatchObject({ data: { errorCode: 'QUOTA_DEVICE_EXCEEDED' } })
    expect(syncStoreMocks.pushSyncItemsV1).not.toHaveBeenCalled()
    expect(syncStoreMocks.markSyncSessionError).toHaveBeenCalledWith(expect.anything(), 'user-1', 'device-1', 'QUOTA_DEVICE_EXCEEDED')
  })
})
