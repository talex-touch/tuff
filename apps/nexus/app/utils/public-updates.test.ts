import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import {
  hasNonAnnouncementUpdates,
  hasPopulatedUpdates,
  hydratePrerenderedUpdates,
  isLivePublicUpdatesPayload,
  markLivePublicUpdatesPayload,
  resolvePublicUpdatesCachedData,
  resolvePublicUpdatesFromApp,
  shouldRefreshPublicUpdates,
} from './public-updates'

const staticAnnouncement = {
  id: 'official-core-app-performance-2026-03',
  type: 'announcement' as const,
  scope: 'both' as const,
  channels: ['RELEASE', 'BETA', 'SNAPSHOT'],
  releaseTag: null,
  title: { zh: '核心性能落地', en: 'Core performance rollout' },
  timestamp: '2026-03-04T06:00:00.000Z',
  summary: { zh: '公告', en: 'Announcement' },
  tags: [],
  link: '/docs/dev/release/performance-persistence',
}

const releaseItem = {
  id: 'u1',
  type: 'release' as const,
  scope: 'web' as const,
  channels: ['BETA'],
  releaseTag: 'v2.4.15-beta.10',
  title: { zh: 'Release v2.4.15-beta.10', en: 'Release v2.4.15-beta.10' },
  timestamp: '2026-11-18T06:27:57.852Z',
  summary: { zh: '更新说明', en: 'Release notes' },
  tags: [],
  link: '/updates',
}

describe('public-updates cold hydration helpers', () => {
  it('distinguishes empty payloads, static-only fallback announcements, and release payloads', () => {
    expect(hasPopulatedUpdates(null)).toBe(false)
    expect(hasPopulatedUpdates({ updates: [] })).toBe(false)
    expect(hasPopulatedUpdates({ updates: [staticAnnouncement] })).toBe(true)

    expect(hasNonAnnouncementUpdates(null)).toBe(false)
    expect(hasNonAnnouncementUpdates({ updates: [] })).toBe(false)
    expect(hasNonAnnouncementUpdates({ updates: [staticAnnouncement] })).toBe(false)
    expect(hasNonAnnouncementUpdates({ updates: [staticAnnouncement, releaseItem] })).toBe(true)
  })

  it('requires live refresh when prerendered even if a static announcement is present', () => {
    expect(shouldRefreshPublicUpdates({
      payload: { updates: [staticAnnouncement] },
      prerenderedAt: 1794996369434,
      liveLoaded: false,
    })).toBe(true)

    expect(shouldRefreshPublicUpdates({
      payload: { updates: [staticAnnouncement, releaseItem] },
      prerenderedAt: 1794996369434,
      liveLoaded: false,
    })).toBe(true)

    expect(shouldRefreshPublicUpdates({
      payload: { updates: [staticAnnouncement, releaseItem] },
      prerenderedAt: 1794996369434,
      liveLoaded: true,
    })).toBe(false)

    expect(shouldRefreshPublicUpdates({
      payload: { updates: [staticAnnouncement, releaseItem] },
      prerenderedAt: undefined,
      liveLoaded: false,
    })).toBe(false)
  })

  it('keeps the prerendered payload during hydration, then drops stale/static cache until live fetch succeeds', () => {
    const staticOnly = { updates: [staticAnnouncement] }
    const populated = { updates: [staticAnnouncement, releaseItem] }

    expect(resolvePublicUpdatesCachedData(staticOnly, {
      cause: 'initial',
      isHydrating: true,
      prerenderedAt: 1794996369434,
      liveLoaded: false,
    })).toBe(staticOnly)

    expect(resolvePublicUpdatesCachedData(staticOnly, {
      cause: 'refresh:manual',
      isHydrating: true,
      prerenderedAt: 1794996369434,
      liveLoaded: false,
    })).toBeUndefined()

    expect(resolvePublicUpdatesCachedData(populated, {
      cause: 'refresh:hook',
      isHydrating: false,
      prerenderedAt: 1794996369434,
      liveLoaded: true,
    })).toBeUndefined()

    expect(resolvePublicUpdatesCachedData(staticOnly, {
      isHydrating: false,
      prerenderedAt: 1794996369434,
      liveLoaded: false,
    })).toBeUndefined()

    expect(resolvePublicUpdatesCachedData(populated, {
      isHydrating: false,
      prerenderedAt: 1794996369434,
      liveLoaded: true,
    })).toBe(populated)
  })

  it('reads payload.data on SPA navigation after committed live payload is marked', () => {
    const staticOnly = { updates: [staticAnnouncement] }
    const committedLive = markLivePublicUpdatesPayload({ updates: [staticAnnouncement, releaseItem] })
    const proxiedLive = reactive(markLivePublicUpdatesPayload({ updates: [staticAnnouncement, releaseItem] }))

    expect(isLivePublicUpdatesPayload(staticOnly)).toBe(false)
    expect(isLivePublicUpdatesPayload(committedLive)).toBe(true)
    expect(isLivePublicUpdatesPayload(proxiedLive)).toBe(true)

    expect(resolvePublicUpdatesFromApp({
      isHydrating: false,
      payload: { prerenderedAt: undefined, data: {} },
      static: { data: { 'public-updates': staticOnly } },
    }, 'public-updates', 'initial')).toBeUndefined()

    expect(resolvePublicUpdatesFromApp({
      isHydrating: false,
      payload: { prerenderedAt: 1794996369434, data: { 'public-updates': committedLive } },
      static: { data: {} },
    }, 'public-updates', 'initial')).toBe(committedLive)

    // Unmarked prerendered payload stays ineligible even if a stale superseded call finished in the background
    expect(resolvePublicUpdatesFromApp({
      isHydrating: false,
      payload: { prerenderedAt: 1794996369434, data: { 'public-updates': staticOnly } },
      static: { data: {} },
    }, 'public-updates', 'initial')).toBeUndefined()

    expect(resolvePublicUpdatesFromApp({
      isHydrating: true,
      payload: { prerenderedAt: 1794996369434, data: { 'public-updates': staticOnly } },
      static: { data: {} },
    }, 'public-updates', 'refresh:manual')).toBeUndefined()
  })

  it('refreshes on cold mount of prerendered payload and only skips once committed live payload exists', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(hydratePrerenderedUpdates({
      payload: { updates: [staticAnnouncement] },
      prerenderedAt: 1794996369434,
      refresh,
    })).resolves.toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)

    refresh.mockClear()

    await expect(hydratePrerenderedUpdates({
      payload: markLivePublicUpdatesPayload({ updates: [staticAnnouncement, releaseItem] }),
      prerenderedAt: 1794996369434,
      refresh,
    })).resolves.toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })
})
