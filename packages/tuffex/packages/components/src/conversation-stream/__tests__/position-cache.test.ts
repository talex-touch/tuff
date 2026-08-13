import { describe, expect, it } from 'vitest'
import { createPositionCache } from '../src/use-position-cache'

const EST = 100

function cacheWith(keys: (string | number)[]) {
  const cache = createPositionCache(EST)
  cache.syncKeys(keys)
  return cache
}

describe('createPositionCache', () => {
  it('assumes the estimated height for unmeasured items', () => {
    const cache = cacheWith(['a', 'b', 'c'])
    expect(cache.heightOf('a')).toBe(EST)
    expect(cache.totalHeight()).toBe(3 * EST)
    expect(cache.offsetOf(2)).toBe(2 * EST)
  })

  it('returns the correction delta from setHeight', () => {
    const cache = cacheWith(['a', 'b'])
    expect(cache.setHeight('a', 140)).toBe(40)
    expect(cache.setHeight('a', 140)).toBe(0)
    expect(cache.setHeight('a', 120)).toBe(-20)
    expect(cache.totalHeight()).toBe(120 + EST)
    expect(cache.offsetOf(1)).toBe(120)
  })

  it('keeps measurements across a prepend because heights are keyed', () => {
    const cache = cacheWith(['m1', 'm2'])
    cache.setHeight('m1', 150)
    cache.setHeight('m2', 90)

    cache.syncKeys(['old1', 'old2', 'old3', 'm1', 'm2'])

    // Prepended items are estimated; the anchoring delta is their prefix.
    expect(cache.prefixHeight(3)).toBe(3 * EST)
    // Existing measurements survived the index shift.
    expect(cache.heightOf('m1')).toBe(150)
    expect(cache.offsetOf(4)).toBe(3 * EST + 150)
    expect(cache.totalHeight()).toBe(3 * EST + 150 + 90)
  })

  it('computes the visible range over mixed heights', () => {
    const cache = cacheWith(['a', 'b', 'c', 'd', 'e'])
    cache.setHeight('a', 50) // [0, 50)
    cache.setHeight('b', 200) // [50, 250)
    cache.setHeight('c', 100) // [250, 350)
    cache.setHeight('d', 300) // [350, 650)
    cache.setHeight('e', 100) // [650, 750)

    // Viewport [100, 400) touches b, c, d.
    expect(cache.visibleRange(100, 300, 0)).toEqual({ start: 1, end: 4 })
    // Overscan widens but clamps at the bounds.
    expect(cache.visibleRange(100, 300, 2)).toEqual({ start: 0, end: 5 })
    // A viewport inside a single tall item renders just that item.
    expect(cache.visibleRange(400, 100, 0)).toEqual({ start: 3, end: 4 })
  })

  it('clamps out-of-bounds scroll positions', () => {
    const cache = cacheWith(['a', 'b'])
    expect(cache.visibleRange(10_000, 300, 0).end).toBe(2)
    expect(cache.visibleRange(-50, 300, 0).start).toBe(0)
  })

  it('handles the empty list', () => {
    const cache = cacheWith([])
    expect(cache.totalHeight()).toBe(0)
    expect(cache.visibleRange(0, 300, 4)).toEqual({ start: 0, end: 0 })
  })

  it('clamps offsetOf beyond the list to the total height', () => {
    const cache = cacheWith(['a'])
    cache.setHeight('a', 80)
    expect(cache.offsetOf(99)).toBe(80)
  })

  it('prunes measurements whose keys left the list', () => {
    // Reused instance switching datasets: "user-1" exists in both threads and
    // must not inherit the other thread's measurement.
    const cache = cacheWith(['user-1', 'assistant-2'])
    cache.setHeight('user-1', 500)
    cache.setHeight('assistant-2', 700)

    cache.syncKeys(['user-1', 'assistant-4'])

    // Same key, still present: measurement survives.
    expect(cache.heightOf('user-1')).toBe(500)
    // Departed key: back to the estimate, not the ghost of thread A.
    expect(cache.heightOf('assistant-2')).toBe(EST)
    expect(cache.totalHeight()).toBe(500 + EST)
  })

  it('retains the live key across prunes until it joins the list', () => {
    const cache = cacheWith(['a'])
    // The live row is measured before its key ever appears in the ordered
    // list; pruning it would send the migrating row back to the estimate.
    cache.setHeight('live', 320)

    cache.syncKeys(['a', 'b'], 'live')
    expect(cache.heightOf('live')).toBe(320)

    // Migration: the live key joins the list with its measurement intact.
    cache.syncKeys(['a', 'b', 'live'], 'next-live')
    expect(cache.offsetOf(3)).toBe(2 * EST + 320)

    // Without retention it is pruned like anything else.
    cache.syncKeys(['a'])
    expect(cache.heightOf('live')).toBe(EST)
  })
})
