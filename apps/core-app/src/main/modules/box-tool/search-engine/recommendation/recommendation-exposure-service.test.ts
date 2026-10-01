import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auxWrites = vi.hoisted(
  () =>
    [] as Array<{ day: number; surface: string; k: number; impressions: number; clicks: number }>
)

/** Persisted counter rows the read path (`getHitRate`) sees. */
const auxRows = vi.hoisted(
  () => [] as Array<{ surface: string; k: number; impressions: number; clicks: number }>
)

vi.mock('../../../../db/db-write', () => ({
  // The counters are written through a fake aux lane: the assertions are about
  // WHICH buckets get bumped, not about SQL.
  scheduleAuxWrite: vi.fn(async (_label: string, opFactory: (db: unknown) => Promise<unknown>) => {
    const db = {
      insert: () => ({
        values: (row: (typeof auxWrites)[number]) => ({
          onConflictDoUpdate: async () => {
            auxWrites.push({ ...row })
          }
        })
      })
    }
    return await opFactory(db)
  }),
  resolveCurrentAuxDb: vi.fn(() => ({
    db: {
      select: () => ({ from: () => ({ where: () => ({ orderBy: async () => auxRows }) }) })
    }
  }))
}))

vi.mock('../../../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}))

import { RecommendationExposureService } from './recommendation-exposure-service'

function bucketsFor(kind: 'impressions' | 'clicks'): number[] {
  return auxWrites.filter((write) => write[kind] > 0).map((write) => write.k)
}

describe('RecommendationExposureService', () => {
  let service: RecommendationExposureService

  beforeEach(() => {
    auxWrites.length = 0
    auxRows.length = 0
    service = new RecommendationExposureService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts one impression per k bucket for a rendered list', async () => {
    service.recordExposure({
      sessionId: 'exposure-session',
      itemKeys: ['app-provider:a', 'app-provider:b']
    })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(bucketsFor('impressions')).toEqual([1, 3, 5, 10])
    expect(bucketsFor('clicks')).toEqual([])
  })

  it('ignores an empty exposure report', () => {
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: [] })
    expect(auxWrites).toHaveLength(0)
  })

  it('credits a click to every bucket at or beyond the clicked rank', async () => {
    service.recordExposure({
      sessionId: 'exposure-session',
      itemKeys: ['app-provider:a', 'app-provider:b', 'app-provider:c']
    })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))
    auxWrites.length = 0

    // Rank 2 (third item) is inside @3, @5 and @10, but not @1.
    service.recordClick('app-provider', 'c')
    await vi.waitFor(() => expect(auxWrites).toHaveLength(3))

    expect(bucketsFor('clicks')).toEqual([3, 5, 10])
  })

  it('does not count executes for items that were never shown', () => {
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    auxWrites.length = 0

    service.recordClick('app-provider', 'never-shown')

    expect(auxWrites).toHaveLength(0)
  })

  it('counts a single click per exposure', async () => {
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))
    auxWrites.length = 0

    service.recordClick('app-provider', 'a')
    await vi.waitFor(() => expect(auxWrites.length).toBeGreaterThan(0))
    const afterFirstClick = auxWrites.length

    service.recordClick('app-provider', 'a')

    expect(auxWrites).toHaveLength(afterFirstClick)
  })

  it('drops exposures that aged out before the execute', () => {
    vi.useFakeTimers()
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    auxWrites.length = 0

    vi.advanceTimersByTime(11 * 60 * 1000)
    service.recordClick('app-provider', 'a')

    expect(auxWrites).toHaveLength(0)
  })

  it('records the surface the items were rendered on', async () => {
    service.recordExposure({
      sessionId: 'exposure-session',
      itemKeys: ['app-provider:a'],
      surface: 'division-box'
    })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(new Set(auxWrites.map((write) => write.surface))).toEqual(new Set(['division-box']))
  })

  it('counts a tagged item only in the buckets that actually contained it', async () => {
    service.setTaggedKeys('newly-installed', ['app-provider:b'])
    // Rank 1: inside @3, @5 and @10, but not @1.
    service.recordExposure({
      sessionId: 'exposure-session',
      itemKeys: ['app-provider:a', 'app-provider:b']
    })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(7))

    const slice = auxWrites.filter((write) => write.surface === 'core-box:newly-installed')
    expect(slice.map((write) => write.k)).toEqual([3, 5, 10])
    expect(slice.every((write) => write.impressions === 1 && write.clicks === 0)).toBe(true)
  })

  it('credits a click on a tagged item to both the surface and its slice', async () => {
    service.setTaggedKeys('newly-installed', ['app-provider:a'])
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(8))
    auxWrites.length = 0

    service.recordClick('app-provider', 'a')
    await vi.waitFor(() => expect(auxWrites).toHaveLength(8))

    const slice = auxWrites.filter((write) => write.surface === 'core-box:newly-installed')
    expect(slice.map((write) => write.k)).toEqual([1, 3, 5, 10])
    expect(slice.every((write) => write.clicks === 1)).toBe(true)
  })

  it('writes no slice rows when nothing in the render was tagged', async () => {
    service.setTaggedKeys('newly-installed', ['app-provider:not-rendered'])
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(auxWrites.every((write) => write.surface === 'core-box')).toBe(true)
  })

  it('reads a slice separately without letting it inflate the overall hit rate', async () => {
    // The slice re-counts items already counted on their base surface, so
    // summing both would double-count them into the headline number.
    auxRows.push(
      { surface: 'core-box', k: 3, impressions: 10, clicks: 2 },
      { surface: 'core-box:newly-installed', k: 3, impressions: 4, clicks: 3 }
    )

    await expect(service.getHitRate()).resolves.toEqual([
      { k: 3, impressions: 10, clicks: 2, hitRate: 0.2 }
    ])
    await expect(service.getHitRate(7, 'newly-installed')).resolves.toEqual([
      { k: 3, impressions: 4, clicks: 3, hitRate: 0.75 }
    ])
  })

  it('drops ids the engine no longer reports as part of the slice', async () => {
    service.setTaggedKeys('newly-installed', ['app-provider:a'])
    service.setTaggedKeys('newly-installed', ['app-provider:b'])
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(auxWrites.every((write) => write.surface === 'core-box')).toBe(true)
  })

  it('reports a rendered id as exposed and anything else as not', async () => {
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(service.isExposed('app-provider', 'a')).toBe(true)
    expect(service.isExposed('app-provider', 'never-shown')).toBe(false)
    // Identity is `sourceId:itemId`: the same item id under another source is a
    // different key, and answering from `itemId` alone would mislabel it.
    expect(service.isExposed('other-provider', 'a')).toBe(false)
  })

  it('is read-only: repeated reads leave the entry for recordClick to consume', async () => {
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))
    auxWrites.length = 0

    // A read that answered through `recordClick` — or any read that consumed
    // the entry — flips this to false on the second call, because the usage
    // recorder asks immediately before the click it is trying to measure.
    expect(service.isExposed('app-provider', 'a')).toBe(true)
    expect(service.isExposed('app-provider', 'a')).toBe(true)

    service.recordClick('app-provider', 'a')
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    // One click's worth of counters, not two: the reads contributed nothing.
    expect(bucketsFor('clicks')).toEqual([1, 3, 5, 10])
  })

  it('stops reporting an exposure once it ages past the TTL', () => {
    vi.useFakeTimers()
    service.recordExposure({ sessionId: 'exposure-session', itemKeys: ['app-provider:a'] })

    // Live first, so the assertion below is about the TTL and not about an
    // entry that was never recorded.
    expect(service.isExposed('app-provider', 'a')).toBe(true)

    vi.advanceTimersByTime(11 * 60 * 1000)

    expect(service.isExposed('app-provider', 'a')).toBe(false)
  })
})

/**
 * A visible display session is one evaluation opportunity. Re-reporting the same rows (§ a stream
 * callback, a scroll back into view, a metadata update) must not buy the surface a second
 * impression or a second click, or hit-rate@k drifts away from the behaviour it measures.
 */
describe('RecommendationExposureService display sessions', () => {
  beforeEach(() => {
    auxWrites.length = 0
    auxRows.length = 0
  })

  it('counts one impression per k bucket however many times a session reports its rows', async () => {
    const service = new RecommendationExposureService()
    service.recordExposure({
      sessionId: 'session-1',
      itemKeys: ['app-provider:a', 'app-provider:b']
    })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    // The same display session re-reports: a later visibility or update callback, the same rows.
    service.recordExposure({
      sessionId: 'session-1',
      itemKeys: ['app-provider:a', 'app-provider:b']
    })
    service.recordExposure({ sessionId: 'session-1', itemKeys: ['app-provider:a'] })

    expect(auxWrites).toHaveLength(4)
    expect(bucketsFor('impressions')).toEqual([1, 3, 5, 10])
  })

  it('counts a fresh impression only when a new session reports the same row', async () => {
    const service = new RecommendationExposureService()
    service.recordExposure({ sessionId: 'session-1', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    service.recordExposure({ sessionId: 'session-2', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(8))

    expect(bucketsFor('impressions')).toEqual([1, 3, 5, 10, 1, 3, 5, 10])
  })

  it('does not let a repeated report make a consumed exposure clickable again', async () => {
    const service = new RecommendationExposureService()
    service.recordExposure({ sessionId: 'session-1', itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))
    auxWrites.length = 0

    service.recordClick('app-provider', 'a')
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    // The next render of the same session sends the row again. It must not reinstate the entry
    // recordClick consumed — otherwise the item's next execute is counted as a second click.
    service.recordExposure({ sessionId: 'session-1', itemKeys: ['app-provider:a'] })
    expect(service.isExposed('app-provider', 'a')).toBe(false)

    auxWrites.length = 0
    service.recordClick('app-provider', 'a')
    expect(auxWrites).toHaveLength(0)
  })

  it('counts at most one click per k bucket in a session', async () => {
    const service = new RecommendationExposureService()
    service.recordExposure({
      sessionId: 'session-1',
      itemKeys: ['app-provider:a', 'app-provider:b']
    })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))
    auxWrites.length = 0

    // Two different items clicked in one display: two opportunities cannot be bought from one
    // impression, or hit-rate@k reads 2.
    service.recordClick('app-provider', 'a')
    service.recordClick('app-provider', 'b')
    await vi.waitFor(() => expect(auxWrites.length).toBeGreaterThan(0))

    expect(bucketsFor('clicks')).toEqual([1, 3, 5, 10])
  })
})

describe('RecommendationExposureService report bounds', () => {
  function exposedSize(target: RecommendationExposureService): number {
    return (target as unknown as { exposed: Map<string, unknown> }).exposed.size
  }

  it('does not hold an oversized report in full', () => {
    // #651: the transport handler passes data?.itemKeys ?? [] through unchecked, and the prune ran
    // *before* the insert — so a report of a million keys sat in the map for the whole TTL, until
    // whenever the next call happened to arrive.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 5_000 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ sessionId: 'exposure-session', itemKeys: keys })

    expect(exposedSize(service)).toBeLessThanOrEqual(500)
  })

  it('keeps the highest-ranked keys when it truncates', () => {
    // Rank order is what the k buckets measure, so a truncation that kept the tail would discard
    // exactly the entries a click is most likely to land on.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 5_000 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ sessionId: 'exposure-session', itemKeys: keys })
    const exposed = (service as unknown as { exposed: Map<string, { rank: number }> }).exposed

    expect(exposed.has('app-provider:item-0')).toBe(true)
    expect(exposed.get('app-provider:item-0')?.rank).toBe(0)
    expect(exposed.has('app-provider:item-4999')).toBe(false)
  })

  it('still records an ordinary grid in full', () => {
    // Positive control: every bound above would also hold for a service that recorded nothing.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 12 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ sessionId: 'exposure-session', itemKeys: keys })

    expect(exposedSize(service)).toBe(12)
  })

  it('a click on a truncated-away key is simply not counted', () => {
    // The cost of the cap, stated rather than discovered: an item beyond the ceiling was still
    // rendered, but its click cannot be attributed. At 100 keys against a widest bucket of 10,
    // nothing a real grid measures is affected.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 5_000 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ sessionId: 'exposure-session', itemKeys: keys })
    service.recordClick('app-provider', 'item-4999')

    expect(exposedSize(service)).toBeLessThanOrEqual(500)
  })
})
