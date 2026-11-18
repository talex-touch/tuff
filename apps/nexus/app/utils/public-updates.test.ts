import { describe, expect, it, vi } from 'vitest'
import {
  hasPopulatedUpdates,
  hydratePrerenderedUpdates,
  resolvePublicUpdatesCachedData,
  resolvePublicUpdatesFromApp,
} from './public-updates'

const sampleItem = {
  id: 'u1',
  type: 'release' as const,
  scope: 'web' as const,
  channels: ['BETA'],
  releaseTag: 'v2.4.15-beta.9',
  title: { zh: 'Release v2.4.15-beta.9', en: 'Release v2.4.15-beta.9' },
  timestamp: '2026-11-15T15:56:00.000Z',
  summary: { zh: '更新说明', en: 'Release notes' },
  tags: [],
  link: '/updates',
}

describe('public-updates cold hydration helpers', () => {
  it('detects whether an updates payload has rows', () => {
    expect(hasPopulatedUpdates(null)).toBe(false)
    expect(hasPopulatedUpdates(undefined)).toBe(false)
    expect(hasPopulatedUpdates({ updates: [] })).toBe(false)
    expect(hasPopulatedUpdates({ updates: [sampleItem] })).toBe(true)
  })

  it('keeps the prerendered empty payload during hydration, then drops empty static cache outside hydration', () => {
    const empty = { updates: [] }
    const populated = { updates: [sampleItem] }

    expect(resolvePublicUpdatesCachedData(empty, true)).toBe(empty)
    expect(resolvePublicUpdatesCachedData(empty, false)).toBeUndefined()
    expect(resolvePublicUpdatesCachedData(populated, false)).toBe(populated)
  })

  it('reads populated payload.data across client SPA navigations and drops empty static entries', () => {
    const empty = { updates: [] }
    const populated = { updates: [sampleItem] }

    expect(resolvePublicUpdatesFromApp({
      isHydrating: true,
      payload: { data: { 'public-updates': empty } },
      static: { data: {} },
    }, 'public-updates')).toBe(empty)

    expect(resolvePublicUpdatesFromApp({
      isHydrating: false,
      payload: { data: {} },
      static: { data: { 'public-updates': empty } },
    }, 'public-updates')).toBeUndefined()

    expect(resolvePublicUpdatesFromApp({
      isHydrating: false,
      payload: { data: { 'public-updates': populated } },
      static: { data: {} },
    }, 'public-updates')).toBe(populated)
  })

  it('refreshes on mount when prerendered payload is empty and skips refresh when already populated', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(hydratePrerenderedUpdates({ updates: [] }, refresh)).resolves.toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)

    refresh.mockClear()
    await expect(hydratePrerenderedUpdates({ updates: [sampleItem] }, refresh)).resolves.toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })
})
