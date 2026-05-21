import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuthOrApiKey: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const userMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}))

const pluginMocks = vi.hoisted(() => ({
  getPluginById: vi.fn(),
}))

const governanceMocks = vi.hoisted(() => ({
  getPluginGovernanceAnalytics: vi.fn(),
}))

const reviewMocks = vi.hoisted(() => ({
  getPluginReviewAnalytics: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/authStore', () => userMocks)
vi.mock('../../../../server/utils/pluginsStore', () => pluginMocks)
vi.mock('../../../../server/utils/platformGovernanceStore', () => governanceMocks)
vi.mock('../../../../server/utils/pluginReviewStore', () => reviewMocks)

let analyticsHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  analyticsHandler = (await import('../../../../server/api/dashboard/plugins/[id]/analytics.get')).default as (event: any) => Promise<any>
})

describe('/api/dashboard/plugins/:id/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuthOrApiKey.mockResolvedValue({ userId: 'owner-1' })
    userMocks.getUserById.mockResolvedValue({ id: 'owner-1', role: 'user' })
    pluginMocks.getPluginById.mockResolvedValue({
      id: 'plugin-1',
      slug: 'reviewed-plugin',
      userId: 'owner-1',
    })
    h3Mocks.getQuery.mockReturnValue({ days: '14', limit: '50', topLimit: '5' })
    governanceMocks.getPluginGovernanceAnalytics.mockResolvedValue({
      days: 14,
      downloads: 12,
      installs: 7,
      invocations: 5,
      uniqueActors: 3,
      trend: [],
      installTrend: [],
      byAction: [],
      byChannel: [],
      byCountry: [],
      byRegion: [],
      byVersion: [],
      byArtifactType: [],
      packageSize: { min: 0, max: 0, average: 0 },
    })
    reviewMocks.getPluginReviewAnalytics.mockResolvedValue({
      total: 4,
      approved: 2,
      pending: 1,
      rejected: 1,
      averageRating: 4,
      ratingCount: 2,
      ratingDistribution: [
        { rating: 5, count: 1 },
        { rating: 4, count: 0 },
        { rating: 3, count: 1 },
        { rating: 2, count: 0 },
        { rating: 1, count: 0 },
      ],
      latestAt: '2026-05-21T00:00:00.000Z',
    })
  })

  it('merges review analytics into the owner private plugin analytics payload', async () => {
    const result = await analyticsHandler({ context: { params: { id: 'plugin-1' } } })

    expect(authMocks.requireAuthOrApiKey).toHaveBeenCalledWith(expect.anything(), ['plugin:read'])
    expect(governanceMocks.getPluginGovernanceAnalytics).toHaveBeenCalledWith(expect.anything(), 'plugin-1', {
      days: 14,
      limit: 50,
      topLimit: 5,
    })
    expect(reviewMocks.getPluginReviewAnalytics).toHaveBeenCalledWith(expect.anything(), 'plugin-1')
    expect(result).toMatchObject({
      pluginId: 'plugin-1',
      slug: 'reviewed-plugin',
      days: 14,
      analytics: {
        downloads: 12,
        reviews: {
          total: 4,
          approved: 2,
          averageRating: 4,
          ratingDistribution: [
            { rating: 5, count: 1 },
            { rating: 4, count: 0 },
            { rating: 3, count: 1 },
            { rating: 2, count: 0 },
            { rating: 1, count: 0 },
          ],
        },
      },
    })
  })
})
