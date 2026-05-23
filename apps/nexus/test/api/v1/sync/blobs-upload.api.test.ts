import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPlatformGovernanceEvents } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAppAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  readDeviceId: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getHeader: vi.fn(),
  readFormData: vi.fn(),
}))

const syncStoreMocks = vi.hoisted(() => ({
  applyQuotaDelta: vi.fn(),
  getSyncSession: vi.fn(),
  uploadSyncBlob: vi.fn(),
  validateQuota: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../../server/utils/syncStoreV1', () => syncStoreMocks)
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getHeader: h3Mocks.getHeader,
    readFormData: h3Mocks.readFormData,
  }
})

let uploadBlobHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  uploadBlobHandler = (await import('../../../../server/api/v1/sync/blobs/upload.post')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/v1/sync/blobs/upload/${marker}`,
    node: {
      req: {
        url: '/api/v1/sync/blobs/upload',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

function makeFile(name: string, type: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type })
}

describe('/api/v1/sync/blobs/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAppAuth.mockResolvedValue({ userId: 'sync-user@example.com' })
    authStoreMocks.readDeviceId.mockReturnValue('private-device-id')
    h3Mocks.getHeader.mockReturnValue('sync-token')
    syncStoreMocks.getSyncSession.mockResolvedValue({ syncToken: 'sync-token' })
    syncStoreMocks.validateQuota.mockResolvedValue({ ok: true, code: null })
    syncStoreMocks.uploadSyncBlob.mockResolvedValue({
      blobId: 'blob-id',
      objectKey: 'sync-user@example.com/blob-id',
      sha256: 'sha256',
      sizeBytes: 4,
      storageChannel: 'r2',
      storageProvider: 'cloudflare-r2',
    })
    syncStoreMocks.applyQuotaDelta.mockResolvedValue(undefined)
  })

  it('records completed sync blob uploads without exposing raw users, devices, object keys, or filenames', async () => {
    const marker = crypto.randomUUID()
    const contentType = `application/x-sync-${marker}`
    const file = makeFile('private local backup.bin', contentType, new Uint8Array([1, 2, 3, 4]))
    const formData = new FormData()
    formData.set('file', file)
    h3Mocks.readFormData.mockResolvedValue(formData)

    const result = await uploadBlobHandler(makeEvent(marker))

    expect(result).toEqual({
      blob_id: 'blob-id',
      object_key: 'sync-user@example.com/blob-id',
      sha256: 'sha256',
      size_bytes: 4,
    })
    expect(syncStoreMocks.validateQuota).toHaveBeenCalledWith(expect.anything(), 'sync-user@example.com', {
      storageDelta: 4,
      objectsDelta: 1,
      itemSize: 4,
    })
    expect(syncStoreMocks.applyQuotaDelta).toHaveBeenCalledWith(expect.anything(), 'sync-user@example.com', {
      storageDelta: 4,
      objectsDelta: 1,
    })

    const rows = await listPlatformGovernanceEvents(makeEvent(marker), {
      scope: 'upload',
      resourceType: 'sync-blob',
      channel: contentType,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com')
    expect(JSON.stringify(rows)).not.toContain('private-device-id')
    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com/blob-id')
    expect(JSON.stringify(rows)).not.toContain('private local backup.bin')
    expect(rows.every(row => row.resourceId?.startsWith('sync-blob:'))).toBe(true)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'resource.started',
        resourceType: 'sync-blob',
        channel: contentType,
        unit: 'file',
        quantity: 1,
        metadata: expect.objectContaining({
          contentType,
          size: 4,
          surface: 'sync-blob-upload',
        }),
      }),
      expect.objectContaining({
        action: 'resource.completed',
        resourceType: 'sync-blob',
        channel: contentType,
        unit: 'byte',
        quantity: 4,
        metadata: expect.objectContaining({
          storageChannel: 'r2',
          storageProvider: 'cloudflare-r2',
          surface: 'sync-blob-upload',
        }),
      }),
    ]))
  })

  it('records recovered sync blob storage retries without exposing raw users or object keys', async () => {
    const marker = crypto.randomUUID()
    const contentType = `application/x-sync-recovered-${marker}`
    const file = makeFile('private recovered sync blob.bin', contentType, new Uint8Array([1, 2, 3, 4]))
    const formData = new FormData()
    formData.set('file', file)
    h3Mocks.readFormData.mockResolvedValue(formData)
    syncStoreMocks.uploadSyncBlob.mockResolvedValue({
      blobId: 'blob-id',
      objectKey: 'sync-user@example.com/blob-id',
      sha256: 'sha256',
      sizeBytes: 4,
      storageChannel: 'r2',
      storageProvider: 'cloudflare-r2',
      uploadRetry: {
        retryable: true,
        recovered: true,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        nextRetryDelayMs: 0,
        storageChannel: 'r2',
        storageProvider: 'cloudflare-r2',
        storageOperation: 'storage.write',
        storageStatusCode: 503,
      },
    })

    await expect(uploadBlobHandler(makeEvent(marker))).resolves.toEqual({
      blob_id: 'blob-id',
      object_key: 'sync-user@example.com/blob-id',
      sha256: 'sha256',
      size_bytes: 4,
    })

    const rows = await listPlatformGovernanceEvents(makeEvent(marker), {
      scope: 'upload',
      resourceType: 'sync-blob',
      channel: contentType,
      days: 30,
      limit: 10,
    })
    const completed = rows.find(row => row.action === 'resource.completed')

    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com')
    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com/blob-id')
    expect(JSON.stringify(rows)).not.toContain('private recovered sync blob.bin')
    expect(completed).toMatchObject({
      action: 'resource.completed',
      resourceType: 'sync-blob',
      channel: contentType,
      unit: 'byte',
      quantity: 4,
      metadata: expect.objectContaining({
        retryable: true,
        recovered: true,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        nextRetryDelayMs: 0,
        storageChannel: 'r2',
        storageProvider: 'cloudflare-r2',
        storageOperation: 'storage.write',
        storageStatusCode: 503,
        surface: 'sync-blob-upload',
      }),
    })
  })

  it('records sync blob quota failures as upload failures', async () => {
    const marker = crypto.randomUUID()
    const contentType = `application/x-sync-quota-${marker}`
    const file = makeFile('private quota blob.bin', contentType, new Uint8Array([1, 2, 3]))
    const formData = new FormData()
    formData.set('file', file)
    h3Mocks.readFormData.mockResolvedValue(formData)
    syncStoreMocks.validateQuota.mockResolvedValue({
      ok: false,
      code: 'QUOTA_STORAGE_EXCEEDED',
    })

    await expect(uploadBlobHandler(makeEvent(marker))).rejects.toMatchObject({
      statusCode: 403,
    })

    expect(syncStoreMocks.uploadSyncBlob).not.toHaveBeenCalled()
    const rows = await listPlatformGovernanceEvents(makeEvent(marker), {
      scope: 'upload',
      resourceType: 'sync-blob',
      channel: contentType,
      days: 30,
      limit: 10,
    })
    const failed = rows.find(row => row.action === 'resource.failed')

    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com')
    expect(JSON.stringify(rows)).not.toContain('private quota blob.bin')
    expect(failed).toMatchObject({
      action: 'resource.failed',
      resourceType: 'sync-blob',
      channel: contentType,
      metadata: expect.objectContaining({
        reason: 'sync-quota-storage-exceeded',
        statusCode: 403,
        surface: 'sync-blob-upload',
      }),
    })
  })

  it('records sync blob storage failures without exposing object keys', async () => {
    const marker = crypto.randomUUID()
    const contentType = `application/x-sync-r2-${marker}`
    const file = makeFile('private r2 blob.bin', contentType, new Uint8Array([1, 2]))
    const formData = new FormData()
    formData.set('file', file)
    h3Mocks.readFormData.mockResolvedValue(formData)
    syncStoreMocks.uploadSyncBlob.mockRejectedValue(new Error('R2 bucket is not available.'))

    await expect(uploadBlobHandler(makeEvent(marker))).rejects.toThrow('R2 bucket is not available.')

    const rows = await listPlatformGovernanceEvents(makeEvent(marker), {
      scope: 'upload',
      resourceType: 'sync-blob',
      channel: contentType,
      days: 30,
      limit: 10,
    })
    const failed = rows.find(row => row.action === 'resource.failed')

    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com')
    expect(JSON.stringify(rows)).not.toContain('sync-user@example.com/blob-id')
    expect(JSON.stringify(rows)).not.toContain('private r2 blob.bin')
    expect(failed).toMatchObject({
      action: 'resource.failed',
      resourceType: 'sync-blob',
      channel: contentType,
      metadata: expect.objectContaining({
        reason: 'sync-blob-storage-unavailable',
        surface: 'sync-blob-upload',
      }),
    })
  })
})
