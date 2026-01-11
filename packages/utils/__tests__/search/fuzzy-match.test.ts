import { describe, expect, it } from 'vitest'

import { fuzzyMatch, indicesToRanges } from '../../search/fuzzy-match'

describe('fuzzyMatch', () => {
  describe('exact match', () => {
    it('should match identical strings with score 1', () => {
      const result = fuzzyMatch('hello', 'hello')
      expect(result.matched).toBe(true)
      expect(result.score).toBe(1)
      expect(result.matchedIndices).toEqual([0, 1, 2, 3, 4])
    })

    it('should be case insensitive', () => {
      const result = fuzzyMatch('Hello', 'hello')
      expect(result.matched).toBe(true)
      expect(result.score).toBe(1)
    })

    it('should match exact with mixed case', () => {
      const result = fuzzyMatch('HeLLo', 'HELLO')
      expect(result.matched).toBe(true)
      expect(result.score).toBe(1)
    })
  })

  describe('substring match', () => {
    it('should match substring with score 0.95', () => {
      const result = fuzzyMatch('hello world', 'hello')
      expect(result.matched).toBe(true)
      expect(result.score).toBe(0.95)
      expect(result.matchedIndices).toEqual([0, 1, 2, 3, 4])
    })

    it('should match substring in middle', () => {
      const result = fuzzyMatch('say hello there', 'hello')
      expect(result.matched).toBe(true)
      expect(result.score).toBe(0.95)
    })
  })

  describe('subsequence match', () => {
    it('should match subsequence like "vsc" to "Visual Studio Code"', () => {
      const result = fuzzyMatch('Visual Studio Code', 'vsc')
      expect(result.matched).toBe(true)
      expect(result.score).toBeGreaterThan(0.8)
    })

    it('should match non-consecutive characters', () => {
      const result = fuzzyMatch('abcdef', 'ace')
      expect(result.matched).toBe(true)
      expect(result.matchedIndices).toEqual([0, 2, 4])
    })
  })

  describe('fuzzy match with errors', () => {
    it('should match with one typo', () => {
      const result = fuzzyMatch('hello', 'helol')
      expect(result.matched).toBe(true)
      expect(result.score).toBeGreaterThan(0.4)
      expect(result.score).toBeLessThan(0.8)
    })

    it('should match with transposed characters', () => {
      const result = fuzzyMatch('hello', 'hlelo')
      expect(result.matched).toBe(true)
    })

    it('should not match with too many errors', () => {
      const result = fuzzyMatch('hello', 'abcde')
      expect(result.matched).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should return no match for empty query', () => {
      const result = fuzzyMatch('hello', '')
      expect(result.matched).toBe(false)
      expect(result.score).toBe(0)
    })

    it('should return no match for empty target', () => {
      const result = fuzzyMatch('', 'hello')
      expect(result.matched).toBe(false)
      expect(result.score).toBe(0)
    })

    it('should handle single character query', () => {
      const result = fuzzyMatch('hello', 'h')
      expect(result.matched).toBe(true)
    })

    it('should handle query longer than target', () => {
      const result = fuzzyMatch('hi', 'hello')
      expect(result.matched).toBe(false)
    })
  })
})

describe('indicesToRanges', () => {
  it('should convert consecutive indices to single range', () => {
    const ranges = indicesToRanges([0, 1, 2, 3, 4])
    expect(ranges).toEqual([{ start: 0, end: 5 }])
  })

  it('should split non-consecutive indices into multiple ranges', () => {
    const ranges = indicesToRanges([0, 2, 4])
    expect(ranges).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 }
    ])
  })

  it('should handle mixed consecutive and non-consecutive', () => {
    const ranges = indicesToRanges([0, 1, 2, 5, 6])
    expect(ranges).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 7 }
    ])
  })

  it('should handle empty array', () => {
    const ranges = indicesToRanges([])
    expect(ranges).toEqual([])
  })

  it('should handle single index', () => {
    const ranges = indicesToRanges([3])
    expect(ranges).toEqual([{ start: 3, end: 4 }])
  })

  it('should handle duplicate indices', () => {
    const ranges = indicesToRanges([0, 0, 1, 1, 2])
    expect(ranges).toEqual([{ start: 0, end: 3 }])
  })
})