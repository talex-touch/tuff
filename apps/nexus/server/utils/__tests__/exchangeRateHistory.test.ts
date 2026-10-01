import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
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

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

vi.mock('../../utils/auth', () => authMocks)
vi.mock('../../utils/subscriptionStore', () => subscriptionMocks)
vi.mock('../../utils/exchangeRateService', () => serviceMocks)
vi.mock('../../utils/creditsStore', () => creditsMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../api/exchange/history.get')).default as (event: any) => Promise<any>
})

describe('/api/exchange/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getQuery.mockReturnValue({})
    creditsMocks.consumeCredits.mockResolvedValue({ success: true })
  })

  it('FREE 用户访问返回 403', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'FREE' })

    await expect(handler({ node: { req: { url: '/api/exchange/history' } }, context: {} })).rejects.toMatchObject({ statusCode: 403 })
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('非 FREE 用户可以查询 target 历史', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    h3Mocks.getQuery.mockReturnValue({ target: 'CNY' })
    serviceMocks.getRateHistory.mockResolvedValue({
      target: 'CNY',
      items: [{ baseCurrency: 'USD', targetCurrency: 'CNY', rate: 7.1, fetchedAt: 1 }],
    })

    const result = await handler({
      node: { req: { url: '/api/exchange/history?target=CNY' } },
      context: {},
    })

    expect(result).toMatchObject({
      base: 'USD',
      target: 'CNY',
      items: [{ targetCurrency: 'CNY', rate: 7.1 }],
    })
    expect(creditsMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      2,
      'exchange-history',
      expect.objectContaining({ base: 'USD', target: 'CNY' }),
    )
  })

  it('非 FREE 用户扣费失败返回 402', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    h3Mocks.getQuery.mockReturnValue({ target: 'CNY' })
    serviceMocks.getRateHistory.mockResolvedValue({
      target: 'CNY',
      items: [],
    })
    creditsMocks.consumeCredits.mockRejectedValue(new Error('Credits exceeded.'))

    await expect(handler({
      node: { req: { url: '/api/exchange/history?target=CNY' } },
      context: {},
    })).rejects.toMatchObject({ statusCode: 402 })
  })

  it('includePayload 需要管理员', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    authMocks.requireAdmin.mockRejectedValue({ statusCode: 403 })
    h3Mocks.getQuery.mockReturnValue({ includePayload: 'true' })

    await expect(handler({
      node: { req: { url: '/api/exchange/history?includePayload=true' } },
      context: {},
    })).rejects.toMatchObject({ statusCode: 403 })
  })
})
