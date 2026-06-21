import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Buffer } from 'node:buffer'

const h3Mocks = vi.hoisted(() => ({
  send: vi.fn(),
  setResponseHeader: vi.fn(),
}))

const releaseAssetMocks = vi.hoisted(() => ({
  requireReleaseAsset: vi.fn(),
}))

const releasesStoreMocks = vi.hoisted(() => ({
  getReleaseByTag: vi.fn(),
}))

vi.mock('../../../server/utils/releaseAssetStorage', () => releaseAssetMocks)
vi.mock('../../../server/utils/releasesStore', () => releasesStoreMocks)
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    send: h3Mocks.send,
    setResponseHeader: h3Mocks.setResponseHeader,
  }
})

let signatureHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  signatureHandler = (await import('../../../server/api/releases/[tag]/signature/[platform]/[arch].get')).default as (event: any) => Promise<any>
})

function makeEvent(tag = 'v2.5.0') {
  return {
    context: {
      params: { tag, platform: 'darwin', arch: 'arm64' },
    },
  }
}

describe('/api/releases/[tag]/signature/[platform]/[arch].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.send.mockImplementation((_event, data) => data)
    releaseAssetMocks.requireReleaseAsset.mockResolvedValue({
      data: Buffer.from([1, 2, 3]),
      contentType: 'application/octet-stream',
    })
    releasesStoreMocks.getReleaseByTag.mockResolvedValue({
      id: 'release-id',
      tag: 'v2.5.0',
      status: 'published',
      assets: [
        {
          id: 'asset-id',
          platform: 'darwin',
          arch: 'arm64',
          filename: 'Tuff-2.5.0-arm64.dmg',
          fileKey: 'releases/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg',
          signatureKey: 'release-signatures/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg.sig',
        },
      ],
    })
  })

  it('loads the recorded artifact signature key for the matrix endpoint', async () => {
    await expect(signatureHandler(makeEvent())).resolves.toEqual(Buffer.from([1, 2, 3]))

    expect(releaseAssetMocks.requireReleaseAsset).toHaveBeenCalledWith(
      expect.anything(),
      'release-signatures/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg.sig',
      {
        governanceResourceId: 'release:v2.5.0:darwin:arm64:signature',
        resourceType: 'release-signature',
      },
    )
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Content-Disposition', 'attachment; filename="Tuff-2.5.0-arm64.dmg.sig"')
  })

  it('returns 404 when the release matrix has no artifact signature', async () => {
    releasesStoreMocks.getReleaseByTag.mockResolvedValueOnce({
      id: 'release-id',
      tag: 'v2.5.0',
      status: 'published',
      assets: [
        {
          id: 'asset-id',
          platform: 'darwin',
          arch: 'arm64',
          filename: 'Tuff-2.5.0-arm64.dmg',
          fileKey: 'releases/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg',
          signatureKey: null,
        },
      ],
    })

    await expect(signatureHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Asset signature is not available.',
    })
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })
})
