import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS, LEVEL_KEYS, resolveThresholds } from './thresholds'

describe('resolveThresholds', () => {
  it('returns the documented defaults without overrides, as a copy', () => {
    const resolved = resolveThresholds()
    expect(resolved).toEqual(DEFAULT_THRESHOLDS)
    resolved.cpuPct.fail = 1
    expect(DEFAULT_THRESHOLDS.cpuPct.fail).toBe(300)
  })

  it('pins the numbers THRESHOLDS.md promises', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      mainLoopBlockMs: { warn: 100, fail: 250 },
      mainLoopP99Ms: { warn: 30, fail: 50 },
      rendererBlockMs: { warn: 100, fail: 250 },
      frameOver20msRatio: { warn: 0.02, fail: 0.05 },
      frameOver50msRatio: { warn: 0.01, fail: 0.03 },
      frameWorstMs: { warn: 150, fail: 400 },
      cpuPct: { warn: 150, fail: 300 },
      rssMb: { warn: 2560, fail: 4096 },
      sampleOnBlockMs: 300
    })
  })

  it('lets one side of a level change', () => {
    const resolved = resolveThresholds({ cpuPct: { fail: 500 }, rssMb: { warn: 1000 } })
    expect(resolved.cpuPct).toEqual({ warn: 150, fail: 500 })
    expect(resolved.rssMb).toEqual({ warn: 1000, fail: 4096 })
    expect(resolved.mainLoopBlockMs).toEqual({ warn: 100, fail: 250 })
  })

  it('overrides the 20 ms share without touching the 50 ms share', () => {
    const resolved = resolveThresholds({ frameOver20msRatio: { fail: 0.08 } })
    expect(resolved.frameOver20msRatio).toEqual({ warn: 0.02, fail: 0.08 })
    expect(resolved.frameOver50msRatio).toEqual({ warn: 0.01, fail: 0.03 })
  })

  it('lists every level of the defaults, so no override is silently ignored', () => {
    const levels = Object.keys(DEFAULT_THRESHOLDS).filter((key) => key !== 'sampleOnBlockMs')
    expect([...LEVEL_KEYS].sort()).toEqual(levels.sort())
  })

  it.each(LEVEL_KEYS)('applies and validates an override of %s', (key) => {
    const fail = DEFAULT_THRESHOLDS[key].fail
    expect(resolveThresholds({ [key]: { fail: fail * 2 } })[key]).toEqual({
      warn: DEFAULT_THRESHOLDS[key].warn,
      fail: fail * 2
    })
    expect(() => resolveThresholds({ [key]: { warn: fail * 2 } })).toThrow(
      new RegExp(`invalid threshold ${key}`)
    )
  })

  it('accepts a sampleOnBlockMs override', () => {
    expect(resolveThresholds({ sampleOnBlockMs: 150 }).sampleOnBlockMs).toBe(150)
  })

  it.each([
    ['warn above fail', { cpuPct: { warn: 400 } }],
    ['zero', { mainLoopBlockMs: { warn: 0 } }],
    ['negative', { rssMb: { fail: -1 } }],
    ['NaN', { frameWorstMs: { warn: Number.NaN } }],
    ['infinite', { mainLoopP99Ms: { fail: Number.POSITIVE_INFINITY } }]
  ])('rejects %s', (_label, overrides) => {
    expect(() => resolveThresholds(overrides)).toThrow(/invalid threshold/)
  })

  it('rejects a bad sampleOnBlockMs', () => {
    expect(() => resolveThresholds({ sampleOnBlockMs: 0 })).toThrow(/sampleOnBlockMs/)
  })
})
