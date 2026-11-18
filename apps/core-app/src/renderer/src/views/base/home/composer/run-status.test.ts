import { describe, expect, it } from 'vitest'
import { contextPercent, deriveRunStep, formatElapsed, formatWindow } from './run-status'

describe('formatWindow', () => {
  it('formats token windows across M, k, and sub-k scales while rejecting non-positive values', () => {
    expect(formatWindow(1_000_000)).toBe('1M')
    expect(formatWindow(1_500_000)).toBe('1.5M')
    expect(formatWindow(128_000)).toBe('128k')
    expect(formatWindow(4_096)).toBe('4.1k')
    expect(formatWindow(950)).toBe('950')
    expect(formatWindow(0)).toBe('')
    expect(formatWindow(-128)).toBe('')
    expect(formatWindow(Number.NaN)).toBe('')
  })
})

describe('contextPercent', () => {
  it('clamps occupancy ratio to 0..100 and returns null when inputs are invalid', () => {
    expect(contextPercent(50, 200)).toBe(25)
    expect(contextPercent(300, 200)).toBe(100)
    expect(contextPercent(0, 200)).toBe(0)
    expect(contextPercent(undefined, 200)).toBeNull()
    expect(contextPercent(50, undefined)).toBeNull()
    expect(contextPercent(50, 0)).toBeNull()
    expect(contextPercent(-1, 200)).toBeNull()
  })
})

describe('formatElapsed', () => {
  it('formats elapsed milliseconds as whole s / m s / h m units', () => {
    expect(formatElapsed(3_000)).toBe('3s')
    expect(formatElapsed(2_643_000)).toBe('44m 3s')
    expect(formatElapsed(3_720_000)).toBe('1h 2m')
  })
})

describe('deriveRunStep', () => {
  it('derives the current step from the tail of message parts', () => {
    expect(deriveRunStep(undefined)).toEqual({ kind: 'waiting' })
    expect(
      deriveRunStep([
        { type: 'reasoning', text: '**Planning** step\nsecond line' },
        { type: 'tool-call', id: 't1', name: 'search', status: 'running', summary: 'Searching' }
      ])
    ).toEqual({ kind: 'tool', name: 'search', summary: 'Searching' })
    expect(
      deriveRunStep([{ type: 'tool-call', id: 't1', name: 'search', status: 'done' }])
    ).toEqual({ kind: 'thinking' })
    expect(deriveRunStep([{ type: 'reasoning', text: '## Analyzing query' }])).toEqual({
      kind: 'thinking',
      title: 'Analyzing query'
    })
    expect(deriveRunStep([{ type: 'text', text: 'Hello' }])).toEqual({ kind: 'writing' })
  })
})
