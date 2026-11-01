import { describe, expect, it } from 'vitest'
import type { Breach } from '../eval-types'
import { PhaseBook } from './phases'

const breach = (phase: string, at: number): Breach => ({
  at,
  phase,
  kind: 'cpu',
  severity: 'warn',
  value: 200,
  limit: 150
})

describe('PhaseBook', () => {
  it('collects samples per phase and resumes a phase by name', () => {
    const book = new PhaseBook('seed', 0)
    book.current.cpu.push(10, 20)
    book.set('steady', 5_000)
    book.current.cpu.push(100)
    book.set('seed', 9_000)
    book.current.cpu.push(30)
    const summaries = book.summaries([], 12_000, 0)
    expect(summaries.map((s) => s.phase)).toEqual(['seed', 'steady'])
    expect(summaries[0].cpuPct.count).toBe(3)
    expect(summaries[0].cpuPct.max).toBe(30)
    expect(summaries[1].cpuPct.count).toBe(1)
  })

  it('reports frames as null when no visible window delivered one', () => {
    const book = new PhaseBook('steady', 0)
    book.current.cpu.push(1)
    expect(book.summaries([], 3_000, 0)[0].frames).toBeNull()
  })

  it('maps frame counters to the contract names and counts distinct windows', () => {
    const book = new PhaseBook('steady', 0)
    book.current.addFrames('CoreBox', { n: 120, o33: 6, o50: 2, o100: 1, worst: 130 })
    book.current.addFrames('CoreBox', { n: 60, o33: 0, o50: 0, o100: 0, worst: 20 })
    book.current.addFrames('Main', { n: 60, o33: 1, o50: 0, o100: 0, worst: 40 })
    const frames = book.summaries([], 3_000, 0)[0].frames
    expect(frames).toEqual({
      total: 240,
      over33ms: 7,
      over50ms: 2,
      over100ms: 1,
      worstMs: 130,
      visibleWindows: 2
    })
  })

  it('a page that reported zero frames is not a visible window', () => {
    const book = new PhaseBook('steady', 0)
    book.current.addFrames('Hidden', { n: 0, o33: 0, o50: 0, o100: 0, worst: 0 })
    expect(book.summaries([], 3_000, 0)[0].frames).toBeNull()
  })

  it('files each breach under the phase it opened in', () => {
    const book = new PhaseBook('seed', 0)
    book.current.cpu.push(1)
    book.set('burst', 1_000)
    book.current.cpu.push(1)
    const all = [breach('seed', 100), breach('burst', 1_500), breach('burst', 1_800)]
    const summaries = book.summaries(all, 5_000, 0)
    expect(summaries[0].breaches).toHaveLength(1)
    expect(summaries[1].breaches).toHaveLength(2)
  })

  it('leaves out an empty phase shorter than the minimum span', () => {
    const book = new PhaseBook('unphased', 0)
    book.set('seed', 500)
    book.current.cpu.push(1)
    const phases = book.summaries([], 10_000, 2_000).map((s) => s.phase)
    expect(phases).toEqual(['seed'])
  })

  it('records start and end times, ending the current phase at the stop time', () => {
    const book = new PhaseBook('seed', 100)
    book.current.cpu.push(1)
    book.set('steady', 4_000)
    book.current.cpu.push(1)
    const [seed, steady] = book.summaries([], 9_000, 0)
    expect([seed.startedAt, seed.endedAt]).toEqual([100, 4_000])
    expect([steady.startedAt, steady.endedAt]).toEqual([4_000, 9_000])
  })
})
