import { describe, expect, it } from 'vitest'
import {
  calculateHourAffinity,
  calculateTimeContextBoost,
  calculateTimeRelevanceScore,
  TIME_CONTEXT_DAY_BOOST,
  TIME_CONTEXT_SLOT_BOOST,
  TIME_RELEVANCE_SCALE
} from '../core-box/recommendation-weights'
import type { ItemTimeDistribution } from '../core-box/recommendation-weights'
import type { TimePattern } from '../core-box/recommendation'
import { recommendWeights } from '../plugin/sdk/recommend'

/**
 * These are a published SDK surface: a plugin's `RecommendProvider` ranks its candidates with the
 * same functions the host ranks the grid with. Changing a constant here changes third-party
 * ordering, so the numbers are pinned rather than recomputed from the implementation.
 */

const monday9am: TimePattern = {
  hourOfDay: 9,
  dayOfWeek: 1,
  isWorkingHours: true,
  timeSlot: 'morning'
}

function stats(overrides: Partial<ItemTimeDistribution> = {}): ItemTimeDistribution {
  return {
    hourDistribution: overrides.hourDistribution ?? [],
    dayOfWeekDistribution: overrides.dayOfWeekDistribution ?? [0, 0, 0, 0, 0, 0, 0],
    timeSlotDistribution: overrides.timeSlotDistribution ?? {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0
    }
  }
}

describe('calculateTimeContextBoost', () => {
  it('is neutral for an item with no history at this time', () => {
    expect(calculateTimeContextBoost(stats(), monday9am)).toBe(1)
  })

  it('applies the slot and weekday multipliers independently', () => {
    const slotOnly = stats({
      timeSlotDistribution: { morning: 3, afternoon: 0, evening: 0, night: 0 }
    })
    const dayOnly = stats({ dayOfWeekDistribution: [0, 4, 0, 0, 0, 0, 0] })

    expect(calculateTimeContextBoost(slotOnly, monday9am)).toBeCloseTo(TIME_CONTEXT_SLOT_BOOST)
    expect(calculateTimeContextBoost(dayOnly, monday9am)).toBeCloseTo(TIME_CONTEXT_DAY_BOOST)
  })

  it('multiplies both when the item matches slot and weekday', () => {
    const both = stats({
      timeSlotDistribution: { morning: 3, afternoon: 0, evening: 0, night: 0 },
      dayOfWeekDistribution: [0, 4, 0, 0, 0, 0, 0]
    })

    expect(calculateTimeContextBoost(both, monday9am)).toBeCloseTo(
      TIME_CONTEXT_SLOT_BOOST * TIME_CONTEXT_DAY_BOOST
    )
  })
})

describe('calculateHourAffinity', () => {
  it('returns null rather than 0 when there is no hour history', () => {
    // null and 0 mean different things: null is "cannot judge", which callers fall back on
    // instead of penalising the item.
    expect(calculateHourAffinity(undefined, 9)).toBeNull()
    expect(calculateHourAffinity([], 9)).toBeNull()
    expect(calculateHourAffinity(new Array(24).fill(0), 9)).toBeNull()
  })

  it('scores the current hour against the item’s busiest hour', () => {
    const hours = new Array(24).fill(0)
    hours[9] = 5
    hours[14] = 10

    expect(calculateHourAffinity(hours, 14)).toBe(1)
    expect(calculateHourAffinity(hours, 9)).toBe(0.5)
    expect(calculateHourAffinity(hours, 3)).toBe(0)
  })
})

describe('calculateTimeRelevanceScore', () => {
  it('returns 0 for an item with no time history at all', () => {
    expect(calculateTimeRelevanceScore(stats(), monday9am)).toBe(0)
  })

  it('never zeroes an item merely for having no history on today’s weekday (#650)', () => {
    // A bare dayUsage/avg ratio would make this 0 and erase the item; the +1 smoothing keeps it
    // positive while still ranking below an item that does have Monday history.
    const noMonday = stats({
      timeSlotDistribution: { morning: 10, afternoon: 0, evening: 0, night: 0 },
      dayOfWeekDistribution: [0, 0, 5, 5, 0, 0, 0]
    })

    expect(calculateTimeRelevanceScore(noMonday, monday9am)).toBeGreaterThan(0)
  })

  it('ranks weak weekday evidence above none (#650)', () => {
    const weakEvidence = stats({
      timeSlotDistribution: { morning: 10, afternoon: 0, evening: 0, night: 0 },
      dayOfWeekDistribution: [0, 2, 10, 0, 0, 0, 0]
    })
    const noEvidence = stats({
      timeSlotDistribution: { morning: 10, afternoon: 0, evening: 0, night: 0 },
      dayOfWeekDistribution: [0, 0, 12, 0, 0, 0, 0]
    })

    expect(calculateTimeRelevanceScore(weakEvidence, monday9am)).toBeGreaterThan(
      calculateTimeRelevanceScore(noEvidence, monday9am)
    )
  })

  it('falls back to the slot-only score when hour history is absent', () => {
    const slotOnly = stats({
      timeSlotDistribution: { morning: 8, afternoon: 2, evening: 0, night: 0 }
    })

    const score = calculateTimeRelevanceScore(slotOnly, monday9am)
    const slotRatio = 8 / 10
    const dayFactor = 1 // no weekday history: (0 + 1) / (0 + 1)

    expect(score).toBeCloseTo(slotRatio * TIME_RELEVANCE_SCALE * dayFactor * TIME_CONTEXT_SLOT_BOOST)
  })

  it('rewards an item used at exactly this hour over one merely in the same slot', () => {
    const base = {
      timeSlotDistribution: { morning: 10, afternoon: 0, evening: 0, night: 0 },
      dayOfWeekDistribution: [0, 10, 0, 0, 0, 0, 0]
    }
    const onThisHour = new Array(24).fill(0)
    onThisHour[9] = 10
    const onAnotherHour = new Array(24).fill(0)
    onAnotherHour[11] = 10

    expect(
      calculateTimeRelevanceScore(stats({ ...base, hourDistribution: onThisHour }), monday9am)
    ).toBeGreaterThan(
      calculateTimeRelevanceScore(stats({ ...base, hourDistribution: onAnotherHour }), monday9am)
    )
  })
})

describe('recommendWeights SDK surface', () => {
  it('exposes the same functions the host ranks with, not copies', () => {
    // A reimplementation here would drift from the grid the plugin is trying to rank into.
    expect(recommendWeights.timeContextBoost).toBe(calculateTimeContextBoost)
    expect(recommendWeights.hourAffinity).toBe(calculateHourAffinity)
    expect(recommendWeights.timeRelevanceScore).toBe(calculateTimeRelevanceScore)
  })

  it('publishes the constants behind them', () => {
    expect(recommendWeights.constants).toEqual({
      slotBoost: 1.35,
      dayBoost: 1.15,
      scale: 100,
      slotWeight: 0.5,
      hourWeight: 0.5
    })
  })

  it('does not expose a frecency or usage-stats entry point', () => {
    // Frecency reads item_usage_stats row shapes; publishing it would freeze an internal table as
    // an API and hand a plugin behaviour it never observed.
    const keys = Object.keys(recommendWeights)
    expect(keys).toEqual(['timeContextBoost', 'hourAffinity', 'timeRelevanceScore', 'constants'])
  })
})
