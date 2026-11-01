import { beforeEach, describe, expect, it } from 'vitest'
import { Episodes } from './episodes'
import { PressureGauge } from './pressure'
import { DEFAULT_THRESHOLDS } from './thresholds'

describe('PressureGauge', () => {
  let time = 0
  let book: Episodes
  let gauge: PressureGauge

  beforeEach(() => {
    time = 100_000
    book = new Episodes({
      now: () => time,
      phase: () => 'steady',
      marks: () => [],
      emit: () => undefined
    })
    gauge = new PressureGauge(book, DEFAULT_THRESHOLDS, () => time)
  })

  const block = (value: number): void =>
    book.observe('loop', 'main-loop-block', value, { warn: 100, fail: 250 })

  it('is ok on a quiet system', () => {
    expect(gauge.read()).toEqual({ level: 'ok' })
  })

  it('goes critical while a fail-level breach is open, with the reason', () => {
    block(400)
    const pressure = gauge.read()
    expect(pressure.level).toBe('critical')
    expect(pressure.reason).toBe('main-loop-block 400 ms >= 250 ms')
  })

  it('stays critical for 5 s after the breach ended, then drops to elevated hold and ok', () => {
    block(400)
    time += 1_000
    block(0)
    expect(gauge.read().level).toBe('critical')
    time += 4_000
    expect(gauge.read().level).toBe('critical')
    time += 1_000
    expect(gauge.read().level).toBe('ok')
  })

  it('is elevated for a warn-level breach and holds the same 5 s', () => {
    block(150)
    expect(gauge.read().level).toBe('elevated')
    time += 1_000
    block(0)
    expect(gauge.read().level).toBe('elevated')
    time += 5_000
    expect(gauge.read().level).toBe('ok')
  })

  it('critical wins over elevated', () => {
    block(150)
    book.observe('other', 'rss', 5000, { warn: 2560, fail: 4096 })
    expect(gauge.read().level).toBe('critical')
  })

  it('is elevated above 70% of the CPU fail limit without any breach', () => {
    gauge.setCpu(209)
    expect(gauge.read().level).toBe('ok')
    gauge.setCpu(211)
    const pressure = gauge.read()
    expect(pressure.level).toBe('elevated')
    expect(pressure.reason).toContain('70%')
    gauge.setCpu(10)
    expect(gauge.read().level).toBe('ok')
  })

  it('a point breach (log marker) raises pressure for the hold time', () => {
    book.point('db-repair-marker', 'fail', 1, 0, 'rebuilt')
    expect(gauge.read().level).toBe('critical')
    time += 5_001
    expect(gauge.read().level).toBe('ok')
  })

  it('escalating an open warn episode makes it critical immediately', () => {
    block(150)
    block(300)
    expect(gauge.read().level).toBe('critical')
    expect(book.openFail).toBe(1)
    expect(book.openWarn).toBe(0)
  })
})
