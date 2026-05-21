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
    expect(JSON.stringify(analytics)).not.toContain('example.com')
  })
})
