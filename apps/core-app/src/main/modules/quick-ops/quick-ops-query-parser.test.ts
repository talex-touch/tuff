import { describe, expect, it } from 'vitest'
import { parseDurationMs, parseDurationPartsMs } from './quick-ops-query-parser'

/**
 * Free-text duration parsing (#930).
 *
 * This output sets wall-clock timers directly, and no test imported the module. A
 * unit-conversion regression — minutes read as seconds, or a regex matching `25` before `25m`
 * — makes a 25-minute focus session fire after 25 seconds, or a one-hour screen clean never
 * end. Nothing would have caught the off-by-1000.
 *
 * Every expectation below is an exact millisecond value, written from observed behaviour
 * rather than from what the units ought to mean, so the table records what the parser does.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

describe('parseDurationMs unit conversion', () => {
  it.each([
    ['25m', 25 * MINUTE],
    ['25 m', 25 * MINUTE],
    ['25min', 25 * MINUTE],
    ['25mins', 25 * MINUTE],
    ['25 minutes', 25 * MINUTE],
    ['25分钟', 25 * MINUTE],
    ['25分', 25 * MINUTE]
  ])('%s is %d ms', (text, expected) => {
    // The off-by-1000 the issue names: each of these must be minutes, not seconds.
    expect(parseDurationMs(text)).toBe(expected)
  })

  it.each([
    ['1h', HOUR],
    ['1 hour', HOUR],
    ['2hrs', 2 * HOUR],
    ['1小时', HOUR]
  ])('%s is %d ms', (text, expected) => {
    expect(parseDurationMs(text)).toBe(expected)
  })

  it.each([
    ['30s', 30 * SECOND],
    ['30 sec', 30 * SECOND],
    ['30 seconds', 30 * SECOND],
    ['30秒', 30 * SECOND]
  ])('%s is %d ms', (text, expected) => {
    expect(parseDurationMs(text)).toBe(expected)
  })

  it('keeps the three units distinct', () => {
    // Stated as a relationship rather than three separate numbers: a regression that collapses
    // two units into one fails here even if someone updates the literals above to match.
    expect(parseDurationMs('1h')).toBe(60 * (parseDurationMs('1m') as number))
    expect(parseDurationMs('1m')).toBe(60 * (parseDurationMs('1s') as number))
  })

  it('handles a fractional amount', () => {
    expect(parseDurationMs('1.5h')).toBe(90 * MINUTE)
    expect(parseDurationMs('0.5m')).toBe(30 * SECOND)
  })
})

describe('parseDurationMs with no usable duration', () => {
  it('returns null for a bare number', () => {
    // The ambiguity the issue calls out. A bare `25` must not be read as a duration in some
    // default unit — it has to carry one.
    expect(parseDurationMs('25')).toBeNull()
    expect(parseDurationMs('focus 25')).toBeNull()
  })

  it.each(['', 'pomodoro', 'focus', '专注', 'keep awake', 'no numbers here'])(
    'returns null for %s',
    (text) => {
      expect(parseDurationMs(text)).toBeNull()
    }
  )

  it('returns null for a zero duration rather than 0', () => {
    // A zero-length timer would fire immediately; null lets the caller fall back to a default.
    expect(parseDurationMs('0m')).toBeNull()
    expect(parseDurationMs('0h 0m 0s')).toBeNull()
  })
})

describe('parseDurationMs in a sentence', () => {
  it.each([
    ['focus 25 minutes', 25 * MINUTE],
    ['专注25分钟', 25 * MINUTE],
    ['keep awake for 2 hours', 2 * HOUR],
    ['screen clean for 1h', HOUR],
    ['休息5分钟', 5 * MINUTE]
  ])('%s is %d ms', (text, expected) => {
    expect(parseDurationMs(text)).toBe(expected)
  })

  it('sums the parts of a compound duration', () => {
    expect(parseDurationMs('1h30m')).toBe(90 * MINUTE)
    expect(parseDurationMs('1 hour 30 minutes')).toBe(90 * MINUTE)
  })
})

describe('parseDurationPartsMs', () => {
  it('keeps the parts in order', () => {
    // parsePomodoroCycle reads parts[0] as focus and parts[1] as break, so the order is load
    // bearing rather than incidental.
    expect(parseDurationPartsMs('25m 5m')).toEqual([25 * MINUTE, 5 * MINUTE])
    expect(parseDurationPartsMs('1h30m')).toEqual([HOUR, 30 * MINUTE])
  })

  it('returns an empty list when nothing parses', () => {
    expect(parseDurationPartsMs('pomodoro')).toEqual([])
    expect(parseDurationPartsMs('25')).toEqual([])
  })

  it('drops zero-length parts rather than keeping a 0', () => {
    // A retained 0 would become a break that ends instantly.
    expect(parseDurationPartsMs('25m 0m')).toEqual([25 * MINUTE])
  })

  it('agrees with parseDurationMs on the total', () => {
    for (const text of ['25m', '1h30m', '25m 5m 10s', 'focus 50 minutes break 10 minutes']) {
      const parts = parseDurationPartsMs(text)
      const total = parts.reduce((sum, part) => sum + part, 0)
      expect(parseDurationMs(text), text).toBe(total)
    }
  })
})
