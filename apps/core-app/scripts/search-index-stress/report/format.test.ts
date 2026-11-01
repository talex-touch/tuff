import { describe, expect, it } from 'vitest'
import { T0, dist } from './testing/builders'
import {
  cell,
  code,
  dist3,
  finiteOrNull,
  fmtCpu,
  fmtDuration,
  fmtMb,
  fmtMs,
  fmtPct,
  iso,
  offset,
  shellQuote,
  table,
  thousands,
  truncate
} from './format'

describe('number formatting', () => {
  it('groups thousands and keeps sign and fraction', () => {
    expect(thousands(0)).toBe('0')
    expect(thousands(999)).toBe('999')
    expect(thousands(10_000)).toBe('10,000')
    expect(thousands(1_234_567)).toBe('1,234,567')
    expect(thousands(-1_234)).toBe('-1,234')
    expect(thousands(1_234.5)).toBe('1,234.5')
    expect(thousands(Infinity)).toBe('Infinity')
  })

  it('writes milliseconds at the precision that matters at each magnitude', () => {
    expect(fmtMs(0)).toBe('0 ms')
    expect(fmtMs(3.14)).toBe('3.1 ms')
    expect(fmtMs(12.4)).toBe('12 ms')
    expect(fmtMs(250)).toBe('250 ms')
    expect(fmtMs(1_200)).toBe('1.2 s')
    expect(fmtMs(15_000)).toBe('15 s')
    expect(fmtMs(100_000)).toBe('1m40s')
    expect(fmtMs(-5)).toBe('-5 ms')
  })

  it('says never for an unreached deadline and n/a for a missing value', () => {
    expect(fmtMs(Infinity)).toBe('never')
    expect(fmtMs(null)).toBe('n/a')
    expect(fmtMs(undefined)).toBe('n/a')
    expect(fmtMs(Number.NaN)).toBe('n/a')
  })

  it('formats durations as minutes and, past an hour, hours', () => {
    expect(fmtDuration(0)).toBe('0m00s')
    expect(fmtDuration(61_000)).toBe('1m01s')
    expect(fmtDuration(3_725_000)).toBe('1h02m05s')
    expect(fmtDuration(Number.NaN)).toBe('n/a')
    expect(fmtDuration(-1)).toBe('n/a')
  })

  it('never rounds a non-zero share down to 0%', () => {
    expect(fmtPct(0.5)).toBe('50.0%')
    expect(fmtPct(0)).toBe('0.0%')
    expect(fmtPct(0.0000001)).toBe('<0.1%')
    expect(fmtPct(0.0000001, 2)).toBe('<0.01%')
    expect(fmtPct(0.0123, 2)).toBe('1.23%')
    expect(fmtPct(Number.NaN)).toBe('n/a')
  })

  it('writes memory and CPU for people', () => {
    expect(fmtMb(512)).toBe('512 MB')
    expect(fmtMb(2560)).toBe('2.50 GB')
    expect(fmtMb(Number.NaN)).toBe('n/a')
    expect(fmtCpu(149.6)).toBe('150%')
    expect(fmtCpu(Number.POSITIVE_INFINITY)).toBe('n/a')
  })

  it('shows a distribution as p50 / p95 / p99 and nothing for an empty one', () => {
    expect(dist3(dist(100, 200, 300, 400, 500))).toBe('300 ms / 500 ms / 500 ms')
    expect(dist3(dist())).toBe('n/a')
  })

  it('turns a non-finite number into null for JSON', () => {
    expect(finiteOrNull(12)).toBe(12)
    expect(finiteOrNull(Infinity)).toBeNull()
    expect(finiteOrNull(Number.NaN)).toBeNull()
  })
})

describe('time formatting', () => {
  it('writes UTC ISO without milliseconds', () => {
    expect(iso(T0)).toBe('2026-10-30T12:00:00Z')
    expect(iso(T0 + 1_999)).toBe('2026-10-30T12:00:01Z')
  })

  it('writes offsets from an origin and clamps going backwards to zero', () => {
    expect(offset(T0 + 725_000, T0)).toBe('+12m05s')
    expect(offset(T0 - 5_000, T0)).toBe('+0m00s')
  })
})

describe('markdown helpers', () => {
  it('escapes pipes and newlines inside a table cell', () => {
    expect(cell('a|b\nc')).toBe('a\\|b c')
    expect(cell(null)).toBe('')
    expect(cell(0)).toBe('0')
    expect(cell(false)).toBe('false')
  })

  it('builds a GFM table with right alignment and keeps hostile text on its row', () => {
    const text = table(
      [{ header: 'Name' }, { header: 'Count', align: 'right' }],
      [
        ['plain', 1],
        ['a|b\nc', 22]
      ]
    )
    expect(text.split('\n')).toEqual([
      '| Name | Count |',
      '| --- | ---: |',
      '| plain | 1 |',
      '| a\\|b c | 22 |'
    ])
  })

  it('wraps code in backticks that cannot be closed from inside', () => {
    expect(code('a`b\nc')).toBe("`a'b c`")
  })

  it('truncates with an ellipsis at the limit', () => {
    expect(truncate('abcdef', 6)).toBe('abcdef')
    expect(truncate('abcdefg', 6)).toBe('abcde…')
    expect(truncate('abc', 0)).toBe('…')
  })

  it('quotes shell arguments only when needed', () => {
    expect(shellQuote('--profile')).toBe('--profile')
    expect(shellQuote('--seed=1030')).toBe('--seed=1030')
    expect(shellQuote('a b')).toBe("'a b'")
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
    expect(shellQuote('')).toBe("''")
  })
})
