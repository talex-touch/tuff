import { beforeEach, describe, expect, it } from 'vitest'
import { BlindTracker } from './blind'
import { Episodes } from './episodes'

describe('BlindTracker', () => {
  let time = 0
  let book: Episodes
  let blind: BlindTracker

  beforeEach(() => {
    time = 0
    book = new Episodes({
      now: () => time,
      phase: () => 'steady',
      marks: () => [],
      emit: () => undefined
    })
    blind = new BlindTracker(() => time, book)
  })

  it('counts a closed span', () => {
    time = 1_000
    blind.begin('main-loop')
    time = 4_000
    blind.end('main-loop')
    expect(blind.totalMs(10_000)).toBe(3_000)
    expect(blind.isBlind('main-loop')).toBe(false)
  })

  it('counts a span that is still open up to the given time', () => {
    time = 1_000
    blind.begin('cpu')
    expect(blind.isBlind('cpu')).toBe(true)
    expect(blind.totalMs(2_500)).toBe(1_500)
  })

  it('begin twice keeps the first start, end without begin is a no-op', () => {
    time = 1_000
    blind.begin('cpu')
    time = 2_000
    blind.begin('cpu')
    time = 3_000
    blind.end('cpu')
    blind.end('cpu')
    expect(blind.totalMs(9_000)).toBe(2_000)
  })

  it('counts overlapping spans once in total and per family', () => {
    time = 0
    blind.begin('renderer:a')
    time = 2_000
    blind.begin('renderer:b')
    time = 5_000
    blind.end('renderer:a')
    time = 6_000
    blind.end('renderer:b')
    time = 6_000
    blind.begin('cpu')
    time = 7_000
    blind.end('cpu')
    expect(blind.totalMs(10_000)).toBe(7_000)
    expect(blind.byFamily(10_000)).toEqual({ renderer: 6_000, cpu: 1_000 })
  })

  it('surfaces a long span as a monitor-blind breach: warn at 5 s, fail at 20 s', () => {
    blind.begin('main-loop')
    time = 4_900
    blind.evaluate()
    expect(book.all).toHaveLength(0)
    time = 5_000
    blind.evaluate()
    expect(book.all[0]).toMatchObject({ kind: 'monitor-blind', severity: 'warn' })
    time = 21_000
    blind.evaluate()
    expect(book.all).toHaveLength(1)
    expect(book.all[0].severity).toBe('fail')
    expect(book.all[0].detail).toContain('main-loop')
  })

  it('a short outage never becomes a breach', () => {
    blind.begin('cpu')
    time = 2_000
    blind.evaluate()
    blind.end('cpu')
    expect(book.all).toHaveLength(0)
  })

  it('endAll closes every open span', () => {
    blind.begin('cpu')
    blind.begin('renderer:x')
    time = 3_000
    blind.endAll()
    expect(blind.isBlind('cpu')).toBe(false)
    expect(blind.totalMs(9_000)).toBe(3_000)
  })
})
