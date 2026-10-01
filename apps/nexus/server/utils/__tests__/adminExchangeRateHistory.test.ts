import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const serviceMocks = vi.hoisted(() => ({
  getRateHistory: vi.fn(),
  getSnapshotHistory: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
}))

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

vi.mock('../../utils/auth', () => authMocks)
vi.mock('../../utils/exchangeRateService', () => serviceMocks)
vi.mock('../../utils/creditsStore', () => creditsMocks)
vi.mock('../../utils/subscriptionStore', () => subscriptionMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../api/admin/exchange/history.get')).default as (event: any) => Promise<any>
})

function adminEvent(target?: string) {
  const query = target ? `?target=${target}` : ''
  return {
    node: { req: { url: `/api/admin/exchange/history${query}` } },
    context: {},
  }
}

describe('/api/admin/exchange/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getQuery.mockReturnValue({})
  })

  it('未授权用户被拒绝，不读取历史数据', async () => {
    authMocks.requireAdmin.mockRejectedValue({ statusCode: 401 })

    await expect(handler(adminEvent('CNY'))).rejects.toMatchObject({ statusCode: 401 })
    expect(serviceMocks.getRateHistory).not.toHaveBeenCalled()
    expect(serviceMocks.getSnapshotHistory).not.toHaveBeenCalled()
  })

  it('非管理员访问被拒绝，不读取历史数据', async () => {
    authMocks.requireAdmin.mockRejectedValue({ statusCode: 403 })

    await expect(handler(adminEvent())).rejects.toMatchObject({ statusCode: 403 })
    expect(serviceMocks.getSnapshotHistory).not.toHaveBeenCalled()
  })

  it('FREE 管理员可查询 target 历史且不触发订阅或扣费', async () => {
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
    h3Mocks.getQuery.mockReturnValue({ target: 'cny' })
    serviceMocks.getRateHistory.mockResolvedValue({
      target: 'CNY',
      items: [{ baseCurrency: 'USD', targetCurrency: 'CNY', rate: 7.1, fetchedAt: 1 }],
    })

    const result = await handler(adminEvent('cny'))

    expect(result).toMatchObject({
      base: 'USD',
      target: 'CNY',
      items: [{ targetCurrency: 'CNY', rate: 7.1 }],
    })
    expect(subscriptionMocks.getUserSubscription).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('FREE 管理员可读取 snapshot/payload 且不触发订阅或扣费', async () => {
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
    h3Mocks.getQuery.mockReturnValue({ includePayload: 'true' })
    serviceMocks.getSnapshotHistory.mockResolvedValue([
      { id: 1, summary: { rate: 7.1 }, payload: { rates: { USD: 1 } } },
    ])

    const result = await handler(adminEvent())

    expect(result).toMatchObject({ items: [{ id: 1, payload: { rates: { USD: 1 } } }] })
    expect(serviceMocks.getSnapshotHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includePayload: true }),
    )
    expect(subscriptionMocks.getUserSubscription).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('invalid target 被拒绝', async () => {
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
    h3Mocks.getQuery.mockReturnValue({ target: 'US' })

    await expect(handler(adminEvent('US'))).rejects.toMatchObject({ statusCode: 400 })
    expect(serviceMocks.getRateHistory).not.toHaveBeenCalled()
  })

  it('since > until 时间范围被拒绝', async () => {
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
    h3Mocks.getQuery.mockReturnValue({ target: 'CNY', since: 200, until: 100 })

    await expect(handler(adminEvent('CNY'))).rejects.toMatchObject({ statusCode: 400 })
    expect(serviceMocks.getRateHistory).not.toHaveBeenCalled()
  })
})
