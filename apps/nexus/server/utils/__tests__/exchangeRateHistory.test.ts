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

vi.mock('../../utils/auth', () => authMocks)
vi.mock('../../utils/subscriptionStore', () => subscriptionMocks)
vi.mock('../../utils/exchangeRateService', () => serviceMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../api/exchange/history.get')).default as (event: any) => Promise<any>
})

describe('/api/exchange/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FREE 用户访问返回 403', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'FREE' })

    await expect(handler({ node: { req: { url: '/api/exchange/history' } }, context: {} })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('非 FREE 用户可以查询 target 历史', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
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
  })

  it('includePayload 需要管理员', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({ plan: 'PRO' })
    authMocks.requireAdmin.mockRejectedValue({ statusCode: 403 })

    await expect(handler({
      node: { req: { url: '/api/exchange/history?includePayload=true' } },
      context: {},
    })).rejects.toMatchObject({ statusCode: 403 })
  })
})
