import { describe, expect, it } from 'vitest'
import { createXScale, createYScale, defaultTickFormat, isBandScale, xPosition, xTickValues } from '../scales'

describe('createXScale', () => {
  it('builds a linear scale over the numeric domain', () => {
    const scale = createXScale('linear', [0, 100], [0, 500])
    expect(isBandScale(scale)).toBe(false)
    expect(xPosition(scale, 50)).toBe(250)
  })

  it('builds a time scale from millisecond bounds', () => {
    const start = Date.UTC(2026, 0, 1)
    const end = Date.UTC(2026, 0, 3)
    const scale = createXScale('time', [start, end], [0, 200])
    expect(xPosition(scale, Date.UTC(2026, 0, 2))).toBe(100)
  })

  it('builds a band scale and centers positions within bands', () => {
    const scale = createXScale('band', ['a', 'b'], [0, 100])
    expect(isBandScale(scale)).toBe(true)
    if (!isBandScale(scale))
      return
    const centerA = xPosition(scale, 'a')
    const centerB = xPosition(scale, 'b')
    expect(centerA).toBeLessThan(centerB)
    expect(centerA).toBeCloseTo((scale('a') ?? 0) + scale.bandwidth() / 2)
  })
})

describe('tick helpers', () => {
  it('lists every band for band scales, d3 ticks otherwise', () => {
    const band = createXScale('band', ['a', 'b', 'c'], [0, 100])
    expect(xTickValues(band, 2)).toEqual(['a', 'b', 'c'])

    const linear = createXScale('linear', [0, 10], [0, 100])
    expect(xTickValues(linear, 2)).toContain(0)
    expect(xTickValues(linear, 2)).toContain(10)
  })

  it('formats continuous ticks with d3 defaults and echoes band values', () => {
    const linear = createXScale('linear', [0, 1000], [0, 100])
    expect(defaultTickFormat(linear, 5)(500)).toBe('500')

    const band = createXScale('band', ['a'], [0, 100])
    expect(defaultTickFormat(band, 5)('a')).toBe('a')
  })
})

describe('createYScale', () => {
  it('inverts the pixel range and optionally nices the domain', () => {
    const scale = createYScale([0, 97], [280, 20], true)
    expect(scale.domain()[1]).toBeGreaterThanOrEqual(97)
    expect(scale(0)).toBe(280)

    const raw = createYScale([0, 97], [280, 20], false)
    expect(raw.domain()).toEqual([0, 97])
  })
})
