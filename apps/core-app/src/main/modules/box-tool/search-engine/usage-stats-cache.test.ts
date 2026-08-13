import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() })
}))

import { getUsageStatsBatchCached, UsageStatsCache } from './usage-stats-cache'

/**
 * Keys with no usage row must stop costing a database round trip (#658).
 *
 * injectUsageStats runs on every debounced keystroke. A search returning items the user has never
 * executed produced the same batch of misses each time — a query with two bound parameters per
 * item that returns nothing, on the interactive path.
 */

function row(itemId: string) {
  return {
    sourceId: 'app-provider',
    itemId,
    sourceType: 'app',
    searchCount: 1,
    executeCount: 1,
    clickCount: 0,
    cancelCount: 0,
    lastUsed: new Date(),
    keywords: null,
    updatedAt: new Date()
  } as never
}

function createDbUtils(known: string[]) {
  const getUsageStatsBatch = vi.fn(async (keys: Array<{ sourceId: string; itemId: string }>) =>
    keys.filter((key) => known.includes(key.itemId)).map((key) => row(key.itemId))
  )
  return { dbUtils: { getUsageStatsBatch } as never, getUsageStatsBatch }
}

const keysFor = (...itemIds: string[]) =>
  itemIds.map((itemId) => ({ sourceId: 'app-provider', itemId }))

describe('getUsageStatsBatchCached negative caching', () => {
  it('does not re-query keys the database had no row for', async () => {
    const cache = new UsageStatsCache()
    const { dbUtils, getUsageStatsBatch } = createDbUtils([])

    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a', 'b', 'c'))
    expect(getUsageStatsBatch).toHaveBeenCalledOnce()

    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a', 'b', 'c'))

    // The regression: this was a second identical query returning zero rows.
    expect(getUsageStatsBatch).toHaveBeenCalledOnce()
  })

  it('still returns the rows that do exist', async () => {
    // Positive control: every assertion about skipped queries would also hold for a cache that
    // returned nothing at all.
    const cache = new UsageStatsCache()
    const { dbUtils } = createDbUtils(['b'])

    const first = await getUsageStatsBatchCached(dbUtils, cache, keysFor('a', 'b'))
    const second = await getUsageStatsBatchCached(dbUtils, cache, keysFor('a', 'b'))

    expect(first.map((stat) => stat.itemId)).toEqual(['b'])
    expect(second.map((stat) => stat.itemId)).toEqual(['b'])
  })

  it('only asks for the keys it has not resolved either way', async () => {
    const cache = new UsageStatsCache()
    const { dbUtils, getUsageStatsBatch } = createDbUtils(['b'])

    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a', 'b'))
    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a', 'b', 'c'))

    // Second call: 'a' is a known absence, 'b' is a cached row, so only 'c' is unknown.
    expect(getUsageStatsBatch.mock.calls[1]?.[0]).toEqual(keysFor('c'))
  })

  it('re-queries once the negative entry expires', async () => {
    // Absences are held briefly on purpose: an item the user runs stops being absent, and although
    // executeItem invalidates the key directly, the short TTL bounds the damage if it does not.
    const cache = new UsageStatsCache(10_000, 15 * 60 * 1000, 20)
    const { dbUtils, getUsageStatsBatch } = createDbUtils([])

    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a'))
    await new Promise((resolve) => setTimeout(resolve, 40))
    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a'))

    expect(getUsageStatsBatch).toHaveBeenCalledTimes(2)
  })

  it('drops the absence when the key is invalidated', async () => {
    // executeItem calls invalidate() when an item is used, which is what makes a newly created row
    // visible before the negative TTL elapses.
    const cache = new UsageStatsCache()
    const { dbUtils, getUsageStatsBatch } = createDbUtils([])

    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a'))
    cache.invalidate('app-provider', 'a')
    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a'))

    expect(getUsageStatsBatch).toHaveBeenCalledTimes(2)
  })

  it('never reports a tombstone as a usage row', async () => {
    const cache = new UsageStatsCache()
    const { dbUtils } = createDbUtils([])

    await getUsageStatsBatchCached(dbUtils, cache, keysFor('a'))

    expect(cache.get('app-provider', 'a')).toBeNull()
    expect(cache.getBatch(keysFor('a')).size).toBe(0)
  })
})
