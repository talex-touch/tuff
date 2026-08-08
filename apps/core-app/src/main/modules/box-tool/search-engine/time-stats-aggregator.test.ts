import { describe, expect, it } from 'vitest'
import { toParsedItemTimeStats } from './time-stats-aggregator'

/**
 * A corrupt row must cost that row its history, not take down every caller (#655).
 *
 * hourDistribution / dayOfWeekDistribution / timeSlotDistribution are plain TEXT columns holding
 * JSON. `parseTimeStats` ran raw JSON.parse on all three, and it sits under the public
 * getItemTimeStats / getItemTimeStatsBatch API — so one partially written or truncated row threw
 * out of every consumer at once.
 */

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sourceId: 'app-provider',
    itemId: 'com.apple.Terminal',
    hourDistribution: JSON.stringify(Array.from({ length: 24 }, (_, index) => index)),
    dayOfWeekDistribution: JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
    timeSlotDistribution: JSON.stringify({ morning: 1, afternoon: 2, evening: 3, night: 4 }),
    lastUpdated: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides
  } as never
}

describe('toParsedItemTimeStats', () => {
  it('parses a well-formed row', () => {
    // Positive control: every tolerance assertion below would also hold for a parser that always
    // returned zeros.
    const parsed = toParsedItemTimeStats(row())

    expect(parsed.hourDistribution).toHaveLength(24)
    expect(parsed.hourDistribution[5]).toBe(5)
    expect(parsed.dayOfWeekDistribution).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(parsed.timeSlotDistribution).toEqual({ morning: 1, afternoon: 2, evening: 3, night: 4 })
    expect(parsed.sourceId).toBe('app-provider')
  })

  it('does not throw on malformed JSON in any single column', () => {
    for (const column of [
      'hourDistribution',
      'dayOfWeekDistribution',
      'timeSlotDistribution'
    ] as const) {
      expect(() => toParsedItemTimeStats(row({ [column]: '{"truncated' })), column).not.toThrow()
    }
  })

  it('keeps the columns it can still read', () => {
    // The point of per-column tolerance: one bad column must not discard the other two, or a
    // partial write would silently erase an item's whole history.
    const parsed = toParsedItemTimeStats(row({ hourDistribution: 'not json at all' }))

    expect(parsed.hourDistribution).toEqual(Array.from({ length: 24 }, () => 0))
    expect(parsed.dayOfWeekDistribution).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(parsed.timeSlotDistribution.night).toBe(4)
  })

  it('normalises shapes that parse but are not the expected type', () => {
    // Valid JSON of the wrong shape is the case a try/catch alone would miss.
    const parsed = toParsedItemTimeStats(
      row({
        hourDistribution: JSON.stringify('a string'),
        dayOfWeekDistribution: JSON.stringify({ not: 'an array' }),
        timeSlotDistribution: JSON.stringify({ morning: 'lots', night: -3 })
      })
    )

    expect(parsed.hourDistribution).toHaveLength(24)
    expect(parsed.dayOfWeekDistribution).toHaveLength(7)
    expect(parsed.timeSlotDistribution.morning).toBe(0)
    expect(parsed.timeSlotDistribution.night).toBe(0)
  })

  it('tolerates null columns', () => {
    const parsed = toParsedItemTimeStats(
      row({ hourDistribution: null, dayOfWeekDistribution: null, timeSlotDistribution: null })
    )

    expect(parsed.hourDistribution).toHaveLength(24)
    expect(parsed.timeSlotDistribution).toEqual({
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0
    })
  })
})
