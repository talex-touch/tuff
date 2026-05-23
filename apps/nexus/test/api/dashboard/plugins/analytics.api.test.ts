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
      packageSize: { count: 0, max: 0, average: 0 },
      retention: {
        activeActors: 3,
        newActors: 1,
        returningActors: 2,
        repeatActors: 2,
        invocationActors: 2,
        retentionRate: 66.67,
        repeatRate: 100,
        averageActiveDays: 2,
        averageInvocationsPerActor: 1.67,
        averageInvocationsPerReturningActor: 2.5,
        byActiveDays: [
          { key: '2-3', events: 2, quantity: 2, uniqueActors: 2 },
          { key: '1', events: 1, quantity: 1, uniqueActors: 1 },
        ],
        trend: [
          {
            date: '2026-05-21',
            newActors: 2,
            returningActors: 0,
            activeActors: 2,
            invocationActors: 1,
            invocations: 2,
            retentionRate: 0,
          },
          {
            date: '2026-05-22',
            newActors: 1,
            returningActors: 1,
            activeActors: 2,
            invocationActors: 2,
            invocations: 3,
            retentionRate: 50,
          },
        ],
      },
      invocationHealth: {
        total: 5,
        successful: 3,
        failed: 1,
        skipped: 1,
        unknown: 0,
        uniqueActors: 2,
        successRate: 60,
        failureRate: 20,
        durationMs: { count: 3, average: 120, max: 200 },
        byStatus: [
          { key: 'successful', events: 1, quantity: 3, uniqueActors: 1 },
          { key: 'failed', events: 1, quantity: 1, uniqueActors: 1 },
          { key: 'skipped', events: 1, quantity: 1, uniqueActors: 1 },
        ],
        byFailureReason: [
          { key: 'adapter-timeout', events: 1, quantity: 1, uniqueActors: 1 },
        ],
        bySurface: [
          { key: 'corebox', events: 3, quantity: 5, uniqueActors: 2 },
        ],
        byCountry: [
          { key: 'us', events: 2, quantity: 4, uniqueActors: 2 },
        ],
        byRegion: [
          { key: 'ca', events: 1, quantity: 3, uniqueActors: 1 },
        ],
        byChannel: [
          { key: 'stable', events: 3, quantity: 5, uniqueActors: 2 },
        ],
        byVersion: [
          { key: '1.0.0', events: 2, quantity: 4, uniqueActors: 2 },
        ],
        byLocalTimeSlot: [
          { key: 'morning', events: 2, quantity: 4, uniqueActors: 2 },
        ],
        trend: [],
      },
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
      ratingTrend: [
        {
          date: '2026-05-21',
          ratingCount: 2,
          averageRating: 4,
          lowRatingCount: 0,
          lowRatingRate: 0,
        },
      ],
      comments: {
        withTitle: 3,
        withContent: 4,
        titleCoverageRate: 75,
        contentCoverageRate: 100,
        averageContentLength: 42,
        byStatus: [],
        trend: [
          {
            date: '2026-05-21',
            total: 4,
            withTitle: 3,
            withContent: 4,
            titleCoverageRate: 75,
            contentCoverageRate: 100,
            averageContentLength: 42,
          },
        ],
      },
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
        retention: {
          activeActors: 3,
          returningActors: 2,
          repeatActors: 2,
          retentionRate: 66.67,
          repeatRate: 100,
          byActiveDays: expect.arrayContaining([
            expect.objectContaining({ key: '2-3', quantity: 2 }),
          ]),
          trend: expect.arrayContaining([
            expect.objectContaining({
              date: '2026-05-22',
              returningActors: 1,
              activeActors: 2,
              retentionRate: 50,
            }),
          ]),
        },
        invocationHealth: {
          total: 5,
          successful: 3,
          failed: 1,
          skipped: 1,
          uniqueActors: 2,
          successRate: 60,
          failureRate: 20,
          byFailureReason: [
            { key: 'adapter-timeout', quantity: 1 },
          ],
          byCountry: [
            { key: 'us', quantity: 4 },
          ],
          byRegion: [
            { key: 'ca', quantity: 3 },
          ],
          byChannel: [
            { key: 'stable', quantity: 5 },
          ],
          byVersion: [
            { key: '1.0.0', quantity: 4 },
          ],
          byLocalTimeSlot: [
            { key: 'morning', quantity: 4 },
          ],
        },
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
          ratingTrend: [
            {
              date: '2026-05-21',
              ratingCount: 2,
              averageRating: 4,
              lowRatingCount: 0,
              lowRatingRate: 0,
            },
          ],
          comments: {
            withTitle: 3,
            withContent: 4,
            titleCoverageRate: 75,
            contentCoverageRate: 100,
            averageContentLength: 42,
          },
        },
      },
    })
  })
})
