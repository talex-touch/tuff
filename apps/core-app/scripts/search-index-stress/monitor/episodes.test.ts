import { beforeEach, describe, expect, it } from 'vitest'
import type { Breach } from '../eval-types'
import { Episodes } from './episodes'

const LIMITS = { warn: 100, fail: 250 }

describe('Episodes', () => {
  let time = 0
  let phase = 'steady'
  let marks: string[] = []
  let emitted: Array<{ breach: Breach; change: string; severity: string; value: number }> = []
  let book: Episodes

  beforeEach(() => {
    time = 1_000
    phase = 'steady'
    marks = ['batch:1']
    emitted = []
    book = new Episodes({
      now: () => time,
      phase: () => phase,
      marks: () => [...marks],
      emit: (breach, change) =>
        emitted.push({ breach, change, severity: breach.severity, value: breach.value })
    })
  })

  const at = (ms: number, value: number, key = 'k', limits = LIMITS): void => {
    time = ms
    book.observe(key, 'main-loop-block', value, limits, { unit: 'ms' })
  }

  it('turns a continuous overage into one breach with duration and peak', () => {
    at(1_000, 120)
    at(2_000, 180)
    at(3_000, 160)
    at(4_000, 90)
    expect(book.all).toHaveLength(1)
    const [breach] = book.all
    expect(breach).toMatchObject({
      at: 1_000,
      phase: 'steady',
      kind: 'main-loop-block',
      severity: 'warn',
      value: 180,
      limit: 100
    })
    expect(breach.detail).toContain('lasted 2.0 s over 3 samples')
    expect(breach.detail).toContain('peak 180 ms at +1.0 s')
    expect(emitted.map((entry) => entry.change)).toEqual(['open'])
  })

  it('ignores values under warn', () => {
    at(1_000, 99.9)
    at(2_000, 0)
    expect(book.all).toHaveLength(0)
    expect(emitted).toHaveLength(0)
  })

  it('rises from warn to fail in place and announces it once', () => {
    at(1_000, 120)
    at(2_000, 300)
    at(3_000, 280)
    expect(book.all).toHaveLength(1)
    expect(book.all[0]).toMatchObject({ severity: 'fail', limit: 250, value: 300 })
    expect(emitted.map((entry) => `${entry.change}:${entry.severity}`)).toEqual([
      'open:warn',
      'escalate:fail'
    ])
    expect(book.openFail).toBe(1)
    expect(book.openWarn).toBe(0)
  })

  it('opens straight at fail when the first sample is that bad', () => {
    at(1_000, 900)
    expect(book.all[0]).toMatchObject({ severity: 'fail', limit: 250, value: 900 })
    expect(book.openFail).toBe(1)
  })

  it('never lowers severity within an episode', () => {
    at(1_000, 400)
    at(2_000, 120)
    expect(book.all[0].severity).toBe('fail')
    expect(book.openFail).toBe(1)
  })

  it('starts a second breach after the first one ended', () => {
    at(1_000, 150)
    at(2_000, 10)
    at(3_000, 160)
    at(4_000, 10)
    expect(book.all).toHaveLength(2)
    expect(book.openWarn).toBe(0)
  })

  it('keeps independent episodes per key', () => {
    at(1_000, 150, 'page:a')
    at(1_000, 300, 'page:b')
    at(2_000, 10, 'page:a')
    expect(book.all).toHaveLength(2)
    expect(book.isOpen('page:a')).toBe(false)
    expect(book.isOpen('page:b')).toBe(true)
    expect(book.openFail).toBe(1)
    expect(book.openWarn).toBe(0)
  })

  it('captures phase and marks at the moment the episode opens', () => {
    at(1_000, 150)
    phase = 'burst'
    marks = ['batch:2']
    at(2_000, 160)
    expect(book.all[0].phase).toBe('steady')
    expect(book.all[0].marks).toEqual(['batch:1'])
  })

  it('records the context of the latest sample in the detail', () => {
    time = 1_000
    book.observe(
      'cpu',
      'cpu',
      180,
      { warn: 150, fail: 300 },
      { unit: 'pct', context: 'renderer 90%' }
    )
    expect(book.all[0].detail).toMatch(
      /^renderer 90%; lasted 0\.0 s over 1 sample; peak 180% at \+0\.0 s$/
    )
  })

  it('formats ratios and sizes in their own units', () => {
    time = 1_000
    book.observe('f', 'frame-drop', 0.0432, { warn: 0.01, fail: 0.03 }, { unit: 'ratio' })
    book.observe('r', 'rss', 3000, { warn: 2560, fail: 4096 }, { unit: 'mb' })
    expect(book.all[0].detail).toContain('peak 4.3%')
    expect(book.all[1].detail).toContain('peak 3000 MB')
    expect(book.lastFailReason).toBe('frame-drop 4.3% >= 3.0%')
    expect(book.lastWarnReason).toBe('rss 3000 MB >= 2560 MB')
  })

  it('closeAll ends open episodes and says they were ongoing', () => {
    at(1_000, 150)
    time = 5_000
    book.closeAll()
    expect(book.openWarn).toBe(0)
    expect(book.all[0].detail).toContain('ongoing at stop')
  })

  describe('point', () => {
    it('records a one-sample breach and drops repeats inside the dedupe window', () => {
      time = 1_000
      const first = book.point('db-repair-marker', 'fail', 1, 0, 'quarantined', {
        dedupeKey: 'q',
        dedupeMs: 5_000
      })
      time = 2_000
      const repeat = book.point('db-repair-marker', 'fail', 1, 0, 'quarantined', {
        dedupeKey: 'q',
        dedupeMs: 5_000
      })
      time = 7_000
      const later = book.point('db-repair-marker', 'fail', 1, 0, 'quarantined', {
        dedupeKey: 'q',
        dedupeMs: 5_000
      })
      expect(first).not.toBeNull()
      expect(repeat).toBeNull()
      expect(later).not.toBeNull()
      expect(book.all).toHaveLength(2)
      expect(book.all[0]).toMatchObject({
        kind: 'db-repair-marker',
        severity: 'fail',
        detail: 'quarantined',
        marks: ['batch:1']
      })
    })

    it('attaches evidence and feeds the pressure counters', () => {
      time = 1_000
      const breach = book.point('process-exit', 'fail', 1, 0, 'gone', { evidence: '/tmp/x.txt' })
      expect(breach?.evidence).toBe('/tmp/x.txt')
      expect(book.lastFailAt).toBe(1_000)
      expect(book.lastFailReason).toBe('process-exit: gone')
    })
  })

  describe('correctPeak', () => {
    it('raises the peak of an episode that has already closed', () => {
      at(1_000, 120)
      at(2_000, 0)
      time = 2_500
      book.correctPeak('k', 2_800, LIMITS)
      expect(book.all[0].value).toBe(2_800)
      expect(book.all[0].detail).toContain('peak 2800 ms')
    })

    it('lifts warn to fail, moving the open counters and announcing it', () => {
      at(1_000, 120)
      book.correctPeak('k', 600, LIMITS)
      expect(book.all[0]).toMatchObject({ severity: 'fail', limit: 250, value: 600 })
      expect(book.openWarn).toBe(0)
      expect(book.openFail).toBe(1)
      expect(emitted.map((entry) => entry.change)).toEqual(['open', 'escalate'])
      at(2_000, 0)
      expect(book.openFail).toBe(0)
    })

    it('does nothing for a smaller figure or an unknown key', () => {
      at(1_000, 200)
      book.correctPeak('k', 150, LIMITS)
      book.correctPeak('missing', 9_999, LIMITS)
      expect(book.all[0].value).toBe(200)
      expect(book.all).toHaveLength(1)
    })
  })

  it('reports when an episode was last over the limit', () => {
    expect(book.lastSeenAt('k')).toBe(-Infinity)
    at(1_000, 150)
    at(3_000, 160)
    expect(book.lastSeenAt('k')).toBe(3_000)
  })

  it('latest returns the newest episode under a key, open or closed', () => {
    at(1_000, 150)
    at(2_000, 0)
    at(3_000, 170)
    expect(book.latest('k')?.at).toBe(3_000)
    expect(book.latest('nope')).toBeUndefined()
  })
})
