import { describe, expect, it } from 'vitest'
import {
  APP_LAG_FLOOR_MS,
  DEFAULT_REPORT_LIMITS,
  FLAG_MIN_P95_MS,
  FLAG_MIN_SAMPLES,
  resolveLimits
} from './limits'

describe('report limits', () => {
  it('defaults are the numbers THRESHOLDS.md documents', () => {
    expect(DEFAULT_REPORT_LIMITS).toEqual({
      indexP95WarnMs: 6_000,
      indexP99FailMs: 15_000,
      answerP95WarnMs: 300,
      answerP99FailMs: 1_000,
      blindShareFail: 0.02,
      undecidedShareFail: 0.02,
      frameCoverageMin: 0.8,
      outlierFactor: 2
    })
    expect([FLAG_MIN_SAMPLES, FLAG_MIN_P95_MS, APP_LAG_FLOOR_MS]).toEqual([5, 50, 200])
  })

  it('returns the defaults without sharing the object', () => {
    const limits = resolveLimits()
    expect(limits).toEqual(DEFAULT_REPORT_LIMITS)
    limits.indexP95WarnMs = 1
    expect(DEFAULT_REPORT_LIMITS.indexP95WarnMs).toBe(6_000)
  })

  it('overrides any subset and ignores undefined', () => {
    const limits = resolveLimits({
      indexP99FailMs: 9_000,
      answerP95WarnMs: undefined,
      outlierFactor: 3
    })
    expect(limits.indexP99FailMs).toBe(9_000)
    expect(limits.answerP95WarnMs).toBe(300)
    expect(limits.outlierFactor).toBe(3)
  })

  it.each([
    ['indexP95WarnMs', 0],
    ['indexP99FailMs', -1],
    ['answerP95WarnMs', Number.NaN],
    ['answerP99FailMs', Number.POSITIVE_INFINITY],
    ['blindShareFail', 1.5],
    ['undecidedShareFail', 0],
    ['frameCoverageMin', 2],
    ['outlierFactor', 1]
  ] as const)('rejects %s = %s and names the key', (key, value) => {
    expect(() => resolveLimits({ [key]: value })).toThrow(`invalid report limit ${key}: ${value}`)
  })

  it('accepts a share of exactly 1', () => {
    expect(resolveLimits({ blindShareFail: 1 }).blindShareFail).toBe(1)
  })
})
