import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const ledgerMocks = vi.hoisted(() => ({
  listProviderUsageLedgerEntries: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/providerUsageLedgerStore', () => ledgerMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

let usageHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  usageHandler = (await import('../../../../server/api/dashboard/provider-registry/usage.get')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/usage',
    node: { req: { url: '/api/dashboard/provider-registry/usage' } },
    context: { params: {} },
  }
}

describe('/api/dashboard/provider-registry/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({
      sceneId: 'corebox.selection.translate',
      providerId: 'prv_tencent_cloud_mt',
      status: 'completed',
      mode: 'execute',
      limit: '25',
    })
    ledgerMocks.listProviderUsageLedgerEntries.mockResolvedValue({
      entries: [],
      page: 1,
      limit: 25,
      total: 0,
    })
  })

  it('管理员可以查询 provider usage ledger', async () => {
    const result = await usageHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(ledgerMocks.listProviderUsageLedgerEntries).toHaveBeenCalledWith(
      expect.anything(),
      {
        runId: undefined,
        sceneId: 'corebox.selection.translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: undefined,
        status: 'completed',
        mode: 'execute',
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
