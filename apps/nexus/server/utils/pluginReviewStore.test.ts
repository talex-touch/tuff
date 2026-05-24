import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { getPluginReviewAnalytics as getPluginReviewAnalyticsType, upsertPluginReview as upsertPluginReviewType } from './pluginReviewStore'

const state = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({
    getItem: async (key: string) => state.storage.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      state.storage.set(key, value)
    },
  }),
}))

const event = {} as any
let getPluginReviewAnalytics: typeof getPluginReviewAnalyticsType
let upsertPluginReview: typeof upsertPluginReviewType

beforeAll(async () => {
  const store = await import('./pluginReviewStore')
  getPluginReviewAnalytics = store.getPluginReviewAnalytics
  upsertPluginReview = store.upsertPluginReview
})

describe('pluginReviewStore analytics', () => {
  beforeEach(() => {
    state.storage.clear()
  })

  it('summarizes review status and approved rating distribution for plugin owners', async () => {
    const pluginId = `plugin-${crypto.randomUUID()}`
    await upsertPluginReview(event, {
      pluginId,
      userId: 'approved-5@example.com',
      authorName: 'Approved Five',
      rating: 5,
      title: 'Great',
      content: 'Useful plugin.',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'approved-3@example.com',
      authorName: 'Approved Three',
      rating: 3,
      title: 'Solid',
      content: 'Works well.',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'pending@example.com',
      authorName: 'Pending',
      rating: 1,
      title: 'Pending',
      content: 'Waiting for moderation.',
      status: 'pending',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'rejected@example.com',
      authorName: 'Rejected',
      rating: 1,
      title: 'Rejected',
      content: 'Rejected by moderation.',
      status: 'rejected',
    })
    await upsertPluginReview(event, {
      pluginId: `other-${pluginId}`,
      userId: 'other@example.com',
      authorName: 'Other',
      rating: 5,
      title: 'Other',
      content: 'Other plugin review.',
      status: 'approved',
    })

    const analytics = await getPluginReviewAnalytics(event, pluginId)

    expect(analytics).toMatchObject({
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
    })
    expect(analytics.latestAt).toEqual(expect.any(String))
    expect(analytics.ratingTrend).toHaveLength(1)
    expect(analytics.ratingTrend[0]).toMatchObject({
      ratingCount: 2,
      averageRating: 4,
      lowRatingCount: 0,
      lowRatingRate: 0,
    })
    expect(analytics.comments).toMatchObject({
      withTitle: 4,
      withContent: 4,
      titleCoverageRate: 100,
      contentCoverageRate: 100,
      averageContentLength: 17.75,
      qualityBuckets: [
        {
          key: 'empty',
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          averageRating: 0,
          lowRatingCount: 0,
          lowRatingRate: 0,
          titleCoverageRate: 0,
          contentCoverageRate: 0,
          averageContentLength: 0,
        },
        {
          key: 'short',
          total: 4,
          approved: 2,
          pending: 1,
          rejected: 1,
          averageRating: 2.5,
          lowRatingCount: 2,
          lowRatingRate: 50,
          titleCoverageRate: 100,
          contentCoverageRate: 100,
          averageContentLength: 17.75,
        },
        {
          key: 'medium',
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          averageRating: 0,
          lowRatingCount: 0,
          lowRatingRate: 0,
          titleCoverageRate: 0,
          contentCoverageRate: 0,
          averageContentLength: 0,
        },
        {
          key: 'long',
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          averageRating: 0,
          lowRatingCount: 0,
          lowRatingRate: 0,
          titleCoverageRate: 0,
          contentCoverageRate: 0,
          averageContentLength: 0,
        },
      ],
      byStatus: [
        {
          status: 'approved',
          total: 2,
          withTitle: 2,
          withContent: 2,
          titleCoverageRate: 100,
          contentCoverageRate: 100,
          averageContentLength: 12.5,
        },
        {
          status: 'pending',
          total: 1,
          withTitle: 1,
          withContent: 1,
          titleCoverageRate: 100,
          contentCoverageRate: 100,
          averageContentLength: 23,
        },
        {
          status: 'rejected',
          total: 1,
          withTitle: 1,
          withContent: 1,
          titleCoverageRate: 100,
          contentCoverageRate: 100,
          averageContentLength: 23,
        },
      ],
    })
    expect(analytics.comments.trend).toHaveLength(1)
    expect(analytics.comments.trend[0]).toMatchObject({
      total: 4,
      withTitle: 4,
      withContent: 4,
      titleCoverageRate: 100,
      contentCoverageRate: 100,
      averageContentLength: 17.75,
    })
    expect(analytics.actionQueue).toEqual([
      expect.objectContaining({
        key: 'pending-review-backlog',
        priority: 'high',
        suggestedAction: 'moderate-pending-reviews',
        reason: 'pending-review-backlog',
        total: 4,
        pending: 1,
        rejected: 1,
        lowRatingCount: 0,
        lowRatingRate: 0,
        titleCoverageRate: 100,
        contentCoverageRate: 100,
        latestDate: expect.any(String),
      }),
      expect.objectContaining({
        key: 'rejected-review-pattern',
        priority: 'medium',
        suggestedAction: 'review-rejected-feedback',
        reason: 'rejected-review-pattern',
        total: 4,
        pending: 1,
        rejected: 1,
      }),
    ])
    expect(JSON.stringify(analytics)).not.toContain('example.com')
    expect(JSON.stringify(analytics)).not.toContain('Approved Five')
    expect(JSON.stringify(analytics)).not.toContain('Useful plugin.')
    expect(analytics.statusTrend).toHaveLength(1)
    expect(analytics.statusTrend[0]).toMatchObject({
      total: 4,
      approved: 2,
      pending: 1,
      rejected: 1,
    })
  })

  it('creates aggregate low-rating and prompt coverage actions without exposing review content', async () => {
    const pluginId = `plugin-${crypto.randomUUID()}`
    await upsertPluginReview(event, {
      pluginId,
      userId: 'low-one@example.com',
      authorName: 'Low One',
      rating: 1,
      title: '',
      content: 'bad',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'low-two@example.com',
      authorName: 'Low Two',
      rating: 2,
      title: '',
      content: '',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'good@example.com',
      authorName: 'Good',
      rating: 5,
      title: 'Great',
      content: 'Helpful plugin.',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'medium@example.com',
      authorName: 'Medium',
      rating: 4,
      title: 'Details',
      content: 'This review includes enough context to explain why the plugin is useful for the workflow.',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'long@example.com',
      authorName: 'Long',
      rating: 5,
      title: 'Deep dive',
      content: 'This longer review explains the setup, the workflow impact, the moderation expectations, and the owner-facing feedback loop in enough detail for aggregate quality analytics to classify it as a long comment.',
      status: 'approved',
    })

    const analytics = await getPluginReviewAnalytics(event, pluginId)

    expect(analytics.comments.qualityBuckets).toEqual([
      expect.objectContaining({
        key: 'empty',
        total: 1,
        approved: 1,
        averageRating: 2,
        lowRatingCount: 1,
        lowRatingRate: 100,
        titleCoverageRate: 0,
        contentCoverageRate: 0,
      }),
      expect.objectContaining({
        key: 'short',
        total: 2,
        approved: 2,
        averageRating: 3,
        lowRatingCount: 1,
        lowRatingRate: 50,
        titleCoverageRate: 50,
        contentCoverageRate: 100,
      }),
      expect.objectContaining({
        key: 'medium',
        total: 1,
        approved: 1,
        averageRating: 4,
        lowRatingCount: 0,
        lowRatingRate: 0,
        titleCoverageRate: 100,
        contentCoverageRate: 100,
      }),
      expect.objectContaining({
        key: 'long',
        total: 1,
        approved: 1,
        averageRating: 5,
        lowRatingCount: 0,
        lowRatingRate: 0,
        titleCoverageRate: 100,
        contentCoverageRate: 100,
      }),
    ])
    expect(analytics.actionQueue).toEqual([
      expect.objectContaining({
        key: 'low-rating-signal',
        priority: 'high',
        suggestedAction: 'investigate-low-ratings',
        reason: 'latest-low-rating-spike',
        total: 5,
        approved: 5,
        lowRatingCount: 2,
        lowRatingRate: 40,
        titleCoverageRate: 60,
        contentCoverageRate: 80,
      }),
      expect.objectContaining({
        key: 'review-prompt-coverage',
        priority: 'medium',
        suggestedAction: 'improve-review-prompts',
        reason: 'low-comment-coverage',
        total: 5,
        approved: 5,
        lowRatingCount: 2,
        lowRatingRate: 40,
        titleCoverageRate: 60,
        contentCoverageRate: 80,
      }),
    ])
    expect(JSON.stringify(analytics)).not.toContain('low-one@example.com')
    expect(JSON.stringify(analytics)).not.toContain('Low One')
    expect(JSON.stringify(analytics)).not.toContain('bad')
    expect(JSON.stringify(analytics)).not.toContain('Helpful plugin.')
    expect(JSON.stringify(analytics)).not.toContain('workflow impact')
  })

  it('summarizes moderation timing without exposing review identities', async () => {
    const pluginId = `plugin-${crypto.randomUUID()}`
    await upsertPluginReview(event, {
      pluginId,
      userId: 'pending-slow@example.com',
      authorName: 'Pending Slow',
      rating: 2,
      title: 'Pending',
      content: 'Needs moderation.',
      status: 'pending',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'approved-fast@example.com',
      authorName: 'Approved Fast',
      rating: 5,
      title: 'Fast',
      content: 'Approved quickly.',
      status: 'approved',
    })
    await upsertPluginReview(event, {
      pluginId,
      userId: 'rejected-week@example.com',
      authorName: 'Rejected Week',
      rating: 1,
      title: 'Rejected',
      content: 'Rejected after review.',
      status: 'rejected',
    })

    const reviews = state.storage.get('store:pluginReviews') as Array<{
      pluginId: string
      userId: string
      createdAt: string
      updatedAt: string
    }>
    const pending = reviews.find(item => item.userId === 'pending-slow@example.com')
    const approved = reviews.find(item => item.userId === 'approved-fast@example.com')
    const rejected = reviews.find(item => item.userId === 'rejected-week@example.com')
    if (pending) {
      pending.createdAt = '2026-05-24T00:00:00.000Z'
      pending.updatedAt = '2026-05-24T00:00:00.000Z'
    }
    if (approved) {
      approved.createdAt = '2026-05-24T09:00:00.000Z'
      approved.updatedAt = '2026-05-24T09:30:00.000Z'
    }
    if (rejected) {
      rejected.createdAt = '2026-05-20T00:00:00.000Z'
      rejected.updatedAt = '2026-05-22T00:00:00.000Z'
    }
    state.storage.set('store:pluginReviews', reviews)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-24T12:00:00.000Z'))
    const analytics = await getPluginReviewAnalytics(event, pluginId)
    vi.useRealTimers()

    expect(analytics.moderationTiming.pending).toMatchObject({
      total: 1,
      pending: 1,
      averageHours: 12,
      maxHours: 12,
      buckets: expect.arrayContaining([
        expect.objectContaining({
          key: 'oneTo24h',
          total: 1,
          pending: 1,
          averageHours: 12,
          maxHours: 12,
        }),
      ]),
    })
    expect(analytics.moderationTiming.processed).toMatchObject({
      total: 2,
      approved: 1,
      rejected: 1,
      averageHours: 24.25,
      maxHours: 48,
      buckets: expect.arrayContaining([
        expect.objectContaining({
          key: 'under1h',
          total: 1,
          approved: 1,
          averageHours: 0.5,
          maxHours: 0.5,
        }),
        expect.objectContaining({
          key: 'oneTo7d',
          total: 1,
          rejected: 1,
          averageHours: 48,
          maxHours: 48,
        }),
      ]),
    })
    expect(JSON.stringify(analytics)).not.toContain('pending-slow@example.com')
    expect(JSON.stringify(analytics)).not.toContain('Pending Slow')
    expect(JSON.stringify(analytics)).not.toContain('Needs moderation.')
  })
})
