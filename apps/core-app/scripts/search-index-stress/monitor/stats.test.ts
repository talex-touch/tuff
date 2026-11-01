import { describe, expect, it } from 'vitest'
import {
  censoredDistribution,
  distribution,
  emptyDistribution,
  percentileSorted,
  round
} from './stats'

describe('percentileSorted', () => {
  const hundred = Array.from({ length: 100 }, (_, index) => index + 1)

  it('uses the nearest-rank definition', () => {
    expect(percentileSorted(hundred, 50)).toBe(50)
    expect(percentileSorted(hundred, 90)).toBe(90)
    expect(percentileSorted(hundred, 99)).toBe(99)
    expect(percentileSorted(hundred, 100)).toBe(100)
  })

  it('clamps to the ends and copes with tiny inputs', () => {
    expect(percentileSorted([], 99)).toBe(0)
    expect(percentileSorted([7], 1)).toBe(7)
    expect(percentileSorted([7], 99)).toBe(7)
    expect(percentileSorted([1, 2], 0)).toBe(1)
    expect(percentileSorted([1, 2, 3, 4], 50)).toBe(2)
  })
})

describe('distribution', () => {
  it('summarises an unsorted sample', () => {
    const d = distribution([5, 1, 9, 3, 7])
    expect(d).toEqual({ count: 5, min: 1, p50: 5, p90: 9, p95: 9, p99: 9, max: 9, mean: 5 })
  })

  it('is all zeros for no data', () => {
    expect(distribution([])).toEqual(emptyDistribution())
    expect(emptyDistribution().count).toBe(0)
  })

  it('drops non-finite values instead of poisoning the tail', () => {
    const d = distribution([1, 2, Number.NaN, Number.POSITIVE_INFINITY, 3])
    expect(d.count).toBe(3)
    expect(d.max).toBe(3)
    expect(d.mean).toBe(2)
  })

  it('does not reorder its input', () => {
    const input = [3, 1, 2]
    distribution(input)
    expect(input).toEqual([3, 1, 2])
  })

  it('p99 of 1000 samples with a single outlier ignores it, max does not', () => {
    const values = Array.from({ length: 999 }, () => 10).concat([5000])
    const d = distribution(values)
    expect(d.p99).toBe(10)
    expect(d.max).toBe(5000)
  })
})

describe('censoredDistribution', () => {
  it('keeps +Infinity so unfinished checks drag the tail up', () => {
    const d = censoredDistribution([10, 20, 30, Number.POSITIVE_INFINITY])
    expect(d.count).toBe(4)
    expect(d.p50).toBe(20)
    expect(d.p99).toBe(Number.POSITIVE_INFINITY)
    expect(d.max).toBe(Number.POSITIVE_INFINITY)
  })

  it('still drops NaN', () => {
    expect(censoredDistribution([Number.NaN]).count).toBe(0)
  })
})

describe('round', () => {
  it('rounds to the requested digits', () => {
    expect(round(1.2345)).toBe(1.2)
    expect(round(1.2355, 2)).toBe(1.24)
    expect(round(2.5, 0)).toBe(3)
  })
})
