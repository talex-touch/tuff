import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auxWrites = vi.hoisted(
  () =>
    [] as Array<{ day: number; surface: string; k: number; impressions: number; clicks: number }>
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
  resolveCurrentAuxDb: vi.fn(() => null)
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
    service = new RecommendationExposureService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts one impression per k bucket for a rendered list', async () => {
    service.recordExposure({ itemKeys: ['app-provider:a', 'app-provider:b'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(bucketsFor('impressions')).toEqual([1, 3, 5, 10])
    expect(bucketsFor('clicks')).toEqual([])
  })

  it('ignores an empty exposure report', () => {
    service.recordExposure({ itemKeys: [] })
    expect(auxWrites).toHaveLength(0)
  })

  it('credits a click to every bucket at or beyond the clicked rank', async () => {
    service.recordExposure({ itemKeys: ['app-provider:a', 'app-provider:b', 'app-provider:c'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))
    auxWrites.length = 0

    // Rank 2 (third item) is inside @3, @5 and @10, but not @1.
    service.recordClick('app-provider', 'c')
    await vi.waitFor(() => expect(auxWrites).toHaveLength(3))

    expect(bucketsFor('clicks')).toEqual([3, 5, 10])
  })

  it('does not count executes for items that were never shown', () => {
    service.recordExposure({ itemKeys: ['app-provider:a'] })
    auxWrites.length = 0

    service.recordClick('app-provider', 'never-shown')

    expect(auxWrites).toHaveLength(0)
  })

  it('counts a single click per exposure', async () => {
    service.recordExposure({ itemKeys: ['app-provider:a'] })
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
    service.recordExposure({ itemKeys: ['app-provider:a'] })
    auxWrites.length = 0

    vi.advanceTimersByTime(11 * 60 * 1000)
    service.recordClick('app-provider', 'a')

    expect(auxWrites).toHaveLength(0)
  })

  it('records the surface the items were rendered on', async () => {
    service.recordExposure({ itemKeys: ['app-provider:a'], surface: 'division-box' })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(new Set(auxWrites.map((write) => write.surface))).toEqual(new Set(['division-box']))
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

    service.recordExposure({ itemKeys: keys })

    expect(exposedSize(service)).toBeLessThanOrEqual(500)
  })

  it('keeps the highest-ranked keys when it truncates', () => {
    // Rank order is what the k buckets measure, so a truncation that kept the tail would discard
    // exactly the entries a click is most likely to land on.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 5_000 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ itemKeys: keys })
    const exposed = (service as unknown as { exposed: Map<string, { rank: number }> }).exposed

    expect(exposed.has('app-provider:item-0')).toBe(true)
    expect(exposed.get('app-provider:item-0')?.rank).toBe(0)
    expect(exposed.has('app-provider:item-4999')).toBe(false)
  })

  it('still records an ordinary grid in full', () => {
    // Positive control: every bound above would also hold for a service that recorded nothing.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 12 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ itemKeys: keys })

    expect(exposedSize(service)).toBe(12)
  })

  it('a click on a truncated-away key is simply not counted', () => {
    // The cost of the cap, stated rather than discovered: an item beyond the ceiling was still
    // rendered, but its click cannot be attributed. At 100 keys against a widest bucket of 10,
    // nothing a real grid measures is affected.
    const service = new RecommendationExposureService()
    const keys = Array.from({ length: 5_000 }, (_, index) => `app-provider:item-${index}`)

    service.recordExposure({ itemKeys: keys })
    service.recordClick('app-provider', 'item-4999')

    expect(exposedSize(service)).toBeLessThanOrEqual(500)
  })
})
