import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const seedMocks = vi.hoisted(() => ({
  ensureDefaultProviderSceneSeed: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/providerSceneSeed', () => seedMocks)

let seedHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  seedHandler = (await import('../../../../server/api/dashboard/provider-registry/seed.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/seed',
    node: { req: { url: '/api/dashboard/provider-registry/seed' } },
  }
}

describe('/api/dashboard/provider-registry/seed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    seedMocks.ensureDefaultProviderSceneSeed.mockResolvedValue({
      overlayProviderId: 'prv_overlay',
      createdOverlayProvider: false,
      createdScreenshotScene: false,
      updatedScreenshotScene: false,
    })
  })

  it('管理员可以触发默认 Provider/Scene seed', async () => {
    const result = await seedHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(seedMocks.ensureDefaultProviderSceneSeed).toHaveBeenCalledWith(expect.anything())
    expect(result).toEqual({
      seed: {
        overlayProviderId: 'prv_overlay',
        createdOverlayProvider: false,
        createdScreenshotScene: false,
        updatedScreenshotScene: false,
      },
    })
  })
})
