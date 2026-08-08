import { describe, expect, it } from 'vitest'
import { LEVENSHTEIN_MAX_LENGTH, levenshteinDistance } from '../search/levenshtein-utils'

/**
 * The helper built a full (m+1)x(n+1) table, so two 20,000-character strings from a plugin
 * allocated ~400 million slots across 20,001 nested arrays and froze the renderer before
 * running out of memory (#887). It is now the two-row rolling form with an explicit ceiling.
 *
 * A rewrite of a numeric algorithm needs more than spot checks, so the main guard is a
 * differential test against the original implementation, reproduced verbatim below.
 */

/** The pre-#887 implementation, kept here purely as the differential oracle. */
function originalLevenshtein(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0))

  for (let i = 0; i <= m; i++) {
    const row = dp[i]
    if (row)
      row[0] = i
  }
  const firstRow = dp[0]
  if (firstRow) {
    for (let j = 0; j <= n; j++)
      firstRow[j] = j
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      const row = dp[i]
      const prevRow = dp[i - 1]
      if (!row || !prevRow)
        continue
      row[j] = Math.min(
        (prevRow[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prevRow[j - 1] ?? 0) + cost,
      )
    }
  }

  return dp[m]?.[n] ?? 0
}

/** Deterministic PRNG so a failure is reproducible rather than a one-off flake. */
function makeRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('levenshteinDistance', () => {
  it('matches known distances', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('flaw', 'lawn')).toBe(2)
    expect(levenshteinDistance('', '')).toBe(0)
    expect(levenshteinDistance('abc', '')).toBe(3)
    expect(levenshteinDistance('', 'abc')).toBe(3)
    expect(levenshteinDistance('same', 'same')).toBe(0)
  })

  it('is symmetric, which the shorter/longer swap could easily break', () => {
    expect(levenshteinDistance('a', 'abcdef')).toBe(5)
    expect(levenshteinDistance('abcdef', 'a')).toBe(5)
    expect(levenshteinDistance('sitting', 'kitten')).toBe(3)
  })

  it('agrees with the original implementation across randomised pairs', () => {
    const random = makeRandom(20260808)
    const alphabet = 'abcde'

    const word = (maxLen: number) => {
      const length = Math.floor(random() * maxLen)
      let out = ''
      for (let i = 0; i < length; i++)
        out += alphabet[Math.floor(random() * alphabet.length)]
      return out
    }

    for (let i = 0; i < 300; i++) {
      const a = word(12)
      const b = word(12)
      expect(levenshteinDistance(a, b), `mismatch for ${JSON.stringify([a, b])}`)
        .toBe(originalLevenshtein(a, b))
    }
  })

  it('agrees with the original on lopsided lengths', () => {
    // The swap only engages when the lengths differ, so it needs its own coverage.
    const long = 'abcde'.repeat(20)
    for (const short of ['', 'a', 'ace', 'edcba', 'abcde']) {
      expect(levenshteinDistance(short, long)).toBe(originalLevenshtein(short, long))
      expect(levenshteinDistance(long, short)).toBe(originalLevenshtein(long, short))
    }
  })

  it('refuses input beyond the documented ceiling instead of allocating', () => {
    const huge = 'a'.repeat(LEVENSHTEIN_MAX_LENGTH + 1)

    expect(() => levenshteinDistance(huge, 'short')).toThrow(RangeError)
    expect(() => levenshteinDistance('short', huge)).toThrow(RangeError)
    expect(() => levenshteinDistance(huge, huge)).toThrow(/LEVENSHTEIN_MAX_LENGTH/)
  })

  it('still accepts input exactly at the ceiling', () => {
    // Guards against an off-by-one that would reject legitimate input.
    const atLimit = 'a'.repeat(LEVENSHTEIN_MAX_LENGTH)

    expect(levenshteinDistance(atLimit, atLimit)).toBe(0)
  })
})
