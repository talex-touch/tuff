import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Buffer } from 'node:buffer'
import { listPlatformGovernanceEvents } from '../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdminOrApiKey: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readFormData: vi.fn(),
}))

const releaseAssetMocks = vi.hoisted(() => ({
  uploadReleaseAsset: vi.fn(),
}))

const releasesStoreMocks = vi.hoisted(() => ({
  createReleaseAsset: vi.fn(),
  getReleaseByTag: vi.fn(),
}))

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/releaseAssetStorage', () => releaseAssetMocks)
vi.mock('../../../server/utils/releasesStore', () => releasesStoreMocks)
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readFormData: h3Mocks.readFormData,
  }
})

let uploadAssetHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  uploadAssetHandler = (await import('../../../server/api/releases/[tag]/assets.post')).default as (event: any) => Promise<any>
})

function makeEvent(tag: string) {
  return {
    path: `/api/releases/${tag}/assets`,
    node: {
      req: {
        url: `/api/releases/${tag}/assets`,
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {
      params: { tag },
    },
  }
}

function makeFile(name: string, type: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type })
}

describe('/api/releases/[tag]/assets.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdminOrApiKey.mockResolvedValue({
      userId: 'release-admin@example.com',
      user: { role: 'admin' },
    })
    releasesStoreMocks.getReleaseByTag.mockResolvedValue({
      id: 'release-id',
      tag: 'v1.0.0',
    })
    releasesStoreMocks.createReleaseAsset.mockResolvedValue({
      id: 'asset-id',
    })
  })

  it('classifies release asset storage retry failures without exposing raw filenames or actors', async () => {
    const marker = crypto.randomUUID()
    const tag = `v-${marker}`
    const file = makeFile('private customer build.zip', 'application/zip', new Uint8Array([1, 2, 3, 4]))
    const formData = new FormData()
    formData.set('platform', 'darwin')
    formData.set('arch', 'arm64')
    formData.set('file', file)
    h3Mocks.readFormData.mockResolvedValue(formData)
    const error = Object.assign(new Error('External storage PUT failed with HTTP 503.'), {
      statusCode: 502,
      data: {
        uploadRetry: {
          retryable: true,
          retryCount: 2,
          maxRetries: 2,
          nextRetryDelayMs: 0,
          storageChannel: 's3',
          storageProvider: 'aws-s3',
          storageOperation: 'storage.write',
          storageStatusCode: 503,
        },
      },
    })
    releaseAssetMocks.uploadReleaseAsset.mockRejectedValue(error)

    await expect(uploadAssetHandler(makeEvent(tag))).rejects.toBe(error)

    const resourceId = `release:${tag}:darwin:arm64`
    const rows = await listPlatformGovernanceEvents(makeEvent(tag), {
      scope: 'upload',
      resourceType: 'release-asset',
      resourceId,
      days: 30,
      limit: 10,
    })
    const failed = rows.find(row => row.action === 'resource.failed')

    expect(authMocks.requireAdminOrApiKey).toHaveBeenCalledWith(expect.anything(), ['release:assets'])
    expect(releaseAssetMocks.uploadReleaseAsset).toHaveBeenCalledWith(expect.anything(), expect.stringContaining(`releases/${tag}/darwin-arm64/`), expect.any(Buffer), 'application/zip', {
      actorId: 'release-admin@example.com',
      governanceResourceId: resourceId,
      resourceType: 'release-asset',
    })
    expect(JSON.stringify(rows)).not.toContain('release-admin@example.com')
    expect(JSON.stringify(rows)).not.toContain('private customer build.zip')
    expect(failed).toMatchObject({
      action: 'resource.failed',
      resourceId,
      channel: 'application/zip',
      unit: 'file',
      quantity: 1,
      metadata: expect.objectContaining({
        reason: 'storage-write-retry-exhausted',
        retryable: true,
        retryCount: 2,
        maxRetries: 2,
        storageChannel: 's3',
        storageProvider: 'aws-s3',
        storageOperation: 'storage.write',
        storageStatusCode: 503,
        surface: 'release-assets',
        tag,
        platform: 'darwin',
        arch: 'arm64',
      }),
    })
  })

  it('records recovered release asset storage retries without exposing raw filenames or actors', async () => {
    const marker = crypto.randomUUID()
    const tag = `v-${marker}`
    const file = makeFile('private recovered build.zip', 'application/zip', new Uint8Array([1, 2, 3, 4]))
    const formData = new FormData()
    formData.set('platform', 'linux')
    formData.set('arch', 'x64')
    formData.set('file', file)
    h3Mocks.readFormData.mockResolvedValue(formData)
    releaseAssetMocks.uploadReleaseAsset.mockResolvedValue({
      key: 'asset-key',
      size: 4,
      contentType: 'application/zip',
      storageChannel: 's3',
      storageProvider: 'aws-s3',
      uploadRetry: {
        retryable: true,
        recovered: true,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        nextRetryDelayMs: 0,
        storageChannel: 's3',
        storageProvider: 'aws-s3',
        storageOperation: 'storage.write',
        storageStatusCode: 503,
      },
    })

    await expect(uploadAssetHandler(makeEvent(tag))).resolves.toMatchObject({
      asset: expect.objectContaining({ id: 'asset-id' }),
      message: 'Asset uploaded successfully.',
    })

    const resourceId = `release:${tag}:linux:x64`
    const rows = await listPlatformGovernanceEvents(makeEvent(tag), {
      scope: 'upload',
      resourceType: 'release-asset',
      resourceId,
      days: 30,
      limit: 10,
    })
    const completed = rows.find(row => row.action === 'resource.completed')

    expect(JSON.stringify(rows)).not.toContain('release-admin@example.com')
    expect(JSON.stringify(rows)).not.toContain('private recovered build.zip')
    expect(completed).toMatchObject({
      action: 'resource.completed',
      resourceId,
      channel: 'application/zip',
      unit: 'byte',
      quantity: 4,
      metadata: expect.objectContaining({
        retryable: true,
        recovered: true,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        nextRetryDelayMs: 0,
        storageChannel: 's3',
        storageProvider: 'aws-s3',
        storageOperation: 'storage.write',
        storageStatusCode: 503,
        surface: 'release-assets',
        tag,
        platform: 'linux',
        arch: 'x64',
      }),
    })
  })

  it('classifies release signature storage policy failures under the signature resource', async () => {
    const marker = crypto.randomUUID()
    const tag = `v-${marker}`
    const file = makeFile('public-build.zip', 'application/zip', new Uint8Array([1, 2, 3, 4]))
    const signature = makeFile('private release key.sig', 'application/octet-stream', new Uint8Array([5, 6]))
    const formData = new FormData()
    formData.set('platform', 'win32')
    formData.set('arch', 'x64')
    formData.set('file', file)
    formData.set('signature', signature)
    h3Mocks.readFormData.mockResolvedValue(formData)
    releaseAssetMocks.uploadReleaseAsset
      .mockResolvedValueOnce({
        key: 'asset-key',
        size: 4,
        contentType: 'application/zip',
        storageChannel: 'memory',
        storageProvider: 'memory',
      })
      .mockRejectedValueOnce({
        statusCode: 429,
        statusMessage: 'Storage channel policy exceeded: max-bytes-exceeded',
      })

    await expect(uploadAssetHandler(makeEvent(tag))).rejects.toMatchObject({
      statusCode: 429,
    })

    const signatureResourceId = `release:${tag}:win32:x64:signature`
    const rows = await listPlatformGovernanceEvents(makeEvent(tag), {
      scope: 'upload',
      resourceType: 'release-signature',
      resourceId: signatureResourceId,
      days: 30,
      limit: 10,
    })
    const failed = rows.find(row => row.action === 'resource.failed')

    expect(JSON.stringify(rows)).not.toContain('release-admin@example.com')
    expect(JSON.stringify(rows)).not.toContain('private release key.sig')
    expect(failed).toMatchObject({
      action: 'resource.failed',
      resourceId: signatureResourceId,
      channel: 'application/octet-stream',
      metadata: expect.objectContaining({
        reason: 'storage-policy-blocked',
        statusCode: 429,
        surface: 'release-assets',
        tag,
        platform: 'win32',
        arch: 'x64',
      }),
    })
  })
})
