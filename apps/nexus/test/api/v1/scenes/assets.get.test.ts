import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Buffer } from 'node:buffer'
import { listPlatformGovernanceEvents } from '../../../../server/utils/platformGovernanceStore'
import { buildSceneAssetGovernanceResourceId, uploadSceneAsset } from '../../../../server/utils/sceneAssetStorage'

const authMocks = vi.hoisted(() => ({
  requireAuthOrApiKey: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  send: vi.fn(),
  setResponseHeader: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRouterParam: h3Mocks.getRouterParam,
    send: h3Mocks.send,
    setResponseHeader: h3Mocks.setResponseHeader,
  }
})

let assetHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  assetHandler = (await import('../../../../server/api/v1/scenes/assets/[key].get')).default as (event: any) => Promise<any>
})

function makeEvent(key: string) {
  return {
    path: `/api/v1/scenes/assets/${encodeURIComponent(key)}`,
    node: {
      req: {
        url: `/api/v1/scenes/assets/${encodeURIComponent(key)}`,
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: { params: { key } },
  }
}

describe('/api/v1/scenes/assets/:key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuthOrApiKey.mockResolvedValue({
      userId: 'scene-asset-reader@example.com',
      authSource: 'api-key',
    })
    h3Mocks.send.mockImplementation(async (_event, body) => body)
  })

  it('requires auth, downloads a private scene asset, and records hashed storage reads', async () => {
    const marker = crypto.randomUUID()
    const key = `scene_run_${marker}-text.translate-translated-image-${crypto.randomUUID()}.png`
    const event = makeEvent(key)
    const governanceResourceId = buildSceneAssetGovernanceResourceId(key)
    h3Mocks.getRouterParam.mockReturnValue(key)

    await uploadSceneAsset(event, key, Buffer.from('scene-asset-bytes'), 'image/png')

    const result = await assetHandler(event)
    const rows = await listPlatformGovernanceEvents(event, {
      scope: 'storage',
      resourceType: 'scene-asset',
      resourceId: governanceResourceId,
      days: 30,
      limit: 20,
    })

    expect(authMocks.requireAuthOrApiKey).toHaveBeenCalledWith(event)
    expect(result).toEqual(Buffer.from('scene-asset-bytes'))
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Content-Type', 'image/png')
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Content-Length', 17)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'X-Content-SHA256', '4526a7f3df0a1495e3eb87b6ea45244d5151da053873338f9469cb759dc1502a')
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, max-age=0, must-revalidate')
    expect(h3Mocks.send).toHaveBeenCalledWith(event, Buffer.from('scene-asset-bytes'))
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 17,
      }),
      expect.objectContaining({
        action: 'storage.read',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 17,
      }),
    ]))
    expect(JSON.stringify(rows)).not.toContain(key)
    expect(JSON.stringify(rows)).not.toContain('scene-asset-reader@example.com')
  })

  it('rejects missing and path-like scene asset keys before storage reads', async () => {
    const event = makeEvent('../private.png')
    h3Mocks.getRouterParam.mockReturnValue('../private.png')

    await expect(assetHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Scene asset key is invalid.',
    })
  })

  it('returns 404 for a well-formed missing scene asset key', async () => {
    const key = `scene_run_${crypto.randomUUID()}-text.translate-missing-${crypto.randomUUID()}.png`
    const event = makeEvent(key)
    h3Mocks.getRouterParam.mockReturnValue(key)

    await expect(assetHandler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Scene asset not found.',
    })
  })
})
