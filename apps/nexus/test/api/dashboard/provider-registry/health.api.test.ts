import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const healthMocks = vi.hoisted(() => ({
  listProviderHealthChecks: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/providerHealthStore', () => healthMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

let healthHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  healthHandler = (await import('../../../../server/api/dashboard/provider-registry/health.get')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/health',
    node: { req: { url: '/api/dashboard/provider-registry/health' } },
    context: { params: {} },
  }
}

describe('/api/dashboard/provider-registry/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({
      providerId: 'prv_tencent_cloud_mt',
      capability: 'text.translate',
      status: 'healthy',
      limit: '25',
    })
    healthMocks.listProviderHealthChecks.mockResolvedValue({
      entries: [],
      page: 1,
      limit: 25,
      total: 0,
    })
  })

  it('管理员可以查询 provider health checks', async () => {
    const result = await healthHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(healthMocks.listProviderHealthChecks).toHaveBeenCalledWith(
      expect.anything(),
      {
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        status: 'healthy',
        page: undefined,
        limit: 25,
      },
    )
    expect(result).toEqual({
      entries: [],
      page: 1,
      limit: 25,
      total: 0,
    })
  })
})
