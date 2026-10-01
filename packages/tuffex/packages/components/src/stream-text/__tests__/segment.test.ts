import { afterEach, describe, expect, it, vi } from 'vitest'
import { segmentWords } from '../src/segment'

const texts = (source: string) => segmentWords(source).map(unit => unit.text)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('segmentWords', () => {
  it('splits Chinese into words, not characters, and keeps punctuation on the word it follows', () => {
    const units = texts('终端不会报错，而是放出一列蒸汽火车。')
    expect(units).toContain('终端')
    expect(units).toContain('不会')
    expect(units).toContain('火车。')
    expect(units.some(unit => unit.endsWith('，'))).toBe(true)
    expect(units.every(unit => !/^[，。]/.test(unit))).toBe(true)
  })

  it('carries the space after an English word as trailing whitespace, outside the word', () => {
    const units = segmentWords('margins beat vanilla by 8 points.')
    expect(units.map(unit => unit.text)).toEqual(['margins', 'beat', 'vanilla', 'by', '8', 'points.'])
    expect(units.map(unit => unit.ws)).toEqual([' ', ' ', ' ', ' ', ' ', ''])
  })

  it('keeps a percentage and a trailing full stop with their word', () => {
    expect(texts('up 23% this month.')).toEqual(['up', '23%', 'this', 'month.'])
  })

  it('leads the next word with opening brackets and quotes, and closes on the word before', () => {
    const units = texts('“引号”和（括号）')
    expect(units[0]!.startsWith('“')).toBe(true)
    expect(units.some(unit => unit.endsWith('”'))).toBe(true)
    expect(units.some(unit => unit.startsWith('（'))).toBe(true)
    expect(units.some(unit => unit.endsWith('）'))).toBe(true)
    expect(units.some(unit => /^[”）]/.test(unit))).toBe(false)
  })

  it('makes an emoji a unit of its own', () => {
    expect(texts('Hello 👋 world')).toEqual(['Hello', '👋', 'world'])
  })

  it('reassembles to the original text', () => {
    const source = '把 ls 打成 sl，终端会放出火车 — Ctrl-C (也) 拦不住它！ Done. '
    expect(segmentWords(source).map(unit => unit.text + unit.ws).join('')).toBe(source)
  })

  it('falls back to whitespace runs and single CJK characters without Intl.Segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    const units = texts('Hello world 你好')
    expect(units).toEqual(['Hello', 'world', '你', '好'])
    expect(segmentWords('Hello world 你好').map(unit => unit.text + unit.ws).join('')).toBe('Hello world 你好')
  })
})
