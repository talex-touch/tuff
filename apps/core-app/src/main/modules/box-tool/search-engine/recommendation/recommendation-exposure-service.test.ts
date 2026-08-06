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

  it('counts a tagged item only in the buckets that actually contained it', async () => {
    service.setTaggedKeys('newly-installed', ['app-provider:b'])
    // Rank 1: inside @3, @5 and @10, but not @1.
    service.recordExposure({ itemKeys: ['app-provider:a', 'app-provider:b'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(7))

    const slice = auxWrites.filter((write) => write.surface === 'core-box:newly-installed')
    expect(slice.map((write) => write.k)).toEqual([3, 5, 10])
    expect(slice.every((write) => write.impressions === 1 && write.clicks === 0)).toBe(true)
  })

  it('credits a click on a tagged item to both the surface and its slice', async () => {
    service.setTaggedKeys('newly-installed', ['app-provider:a'])
    service.recordExposure({ itemKeys: ['app-provider:a'] })
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
    service.recordExposure({ itemKeys: ['app-provider:a'] })
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
    service.recordExposure({ itemKeys: ['app-provider:a'] })
    await vi.waitFor(() => expect(auxWrites).toHaveLength(4))

    expect(auxWrites.every((write) => write.surface === 'core-box')).toBe(true)
  })
})
