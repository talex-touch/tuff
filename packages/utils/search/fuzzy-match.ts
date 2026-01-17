/**
 * Fuzzy matching utilities for typo-tolerant search
 * Supports matching queries like "helol" to "hello"
 */

export interface FuzzyMatchResult {
  /** Whether the match was successful */
  matched: boolean
  /** Match score (0-1, higher is better) */
  score: number
  /** Indices of matched characters in the target string */
  matchedIndices: number[]
}

/**
 * Performs fuzzy matching with typo tolerance
 * Uses a combination of subsequence matching and edit distance
 *
 * @param target - The string to match against (e.g., "hello")
 * @param query - The search query (e.g., "helol")
 * @param maxErrors - Maximum allowed errors (default: 2)
 * @returns FuzzyMatchResult with match info and indices
 */
export function fuzzyMatch(
  target: string,
  query: string,
  maxErrors = 2,
): FuzzyMatchResult {
  if (!query || !target) {
    return { matched: false, score: 0, matchedIndices: [] }
  }

  const targetLower = target.toLowerCase()
  const queryLower = query.toLowerCase()

  // Exact match - highest score
  if (targetLower === queryLower) {
    return {
      matched: true,
      score: 1,
      matchedIndices: Array.from({ length: target.length }, (_, i) => i),
    }
  }

  // Substring match
  const substringIndex = targetLower.indexOf(queryLower)
  if (substringIndex !== -1) {
    return {
      matched: true,
      score: 0.95,
      matchedIndices: Array.from({ length: query.length }, (_, i) => substringIndex + i),
    }
  }

  // Try subsequence matching first (for cases like "vsc" -> "Visual Studio Code")
  const subsequenceResult = subsequenceMatch(targetLower, queryLower)
  if (subsequenceResult.matched && subsequenceResult.matchedIndices.length === queryLower.length) {
    return {
      matched: true,
      score: 0.8 + (subsequenceResult.matchedIndices.length / target.length) * 0.1,
      matchedIndices: subsequenceResult.matchedIndices,
    }
  }

  // Fuzzy match with edit distance for typo tolerance
  const fuzzyResult = fuzzyMatchWithErrors(targetLower, queryLower, maxErrors)
  if (fuzzyResult.matched) {
    return fuzzyResult
  }

  return { matched: false, score: 0, matchedIndices: [] }
}

/**
 * Subsequence matching - matches characters in order but not necessarily consecutive
 * e.g., "vsc" matches "Visual Studio Code" at indices [0, 7, 14]
 */
function subsequenceMatch(
  target: string,
  query: string,
): { matched: boolean, matchedIndices: number[] } {
  const matchedIndices: number[] = []
  let queryIdx = 0

  for (let i = 0; i < target.length && queryIdx < query.length; i++) {
    if (target[i] === query[queryIdx]) {
      matchedIndices.push(i)
      queryIdx++
    }
  }

  return {
    matched: queryIdx === query.length,
    matchedIndices,
  }
}

/**
 * Fuzzy matching with error tolerance using dynamic programming
 * Finds the best matching substring allowing for insertions, deletions, and substitutions
 */
function fuzzyMatchWithErrors(
  target: string,
  query: string,
  maxErrors: number,
): FuzzyMatchResult {
  const m = query.length
  const n = target.length

  if (m === 0)
    return { matched: true, score: 1, matchedIndices: [] }
  if (n === 0)
    return { matched: false, score: 0, matchedIndices: [] }

  // Allow more errors for longer queries
  const allowedErrors = Math.min(maxErrors, Math.floor(m / 3) + 1)

  // Find best matching window using sliding window with edit distance
  let bestScore = 0
  let bestStart = -1
  let bestMatchedIndices: number[] = []

  // Try different window sizes around query length
  const minWindowSize = Math.max(1, m - allowedErrors)
  const maxWindowSize = Math.min(n, m + allowedErrors)

  for (let windowSize = minWindowSize; windowSize <= maxWindowSize; windowSize++) {
    for (let start = 0; start <= n - windowSize; start++) {
      const window = target.substring(start, start + windowSize)
      const { distance, matchedIndices } = editDistanceWithPath(window, query)

      if (distance <= allowedErrors) {
        // Calculate score based on edit distance and position
        const score = calculateFuzzyScore(distance, m, start, n)

        if (score > bestScore) {
          bestScore = score
          bestStart = start
          // Adjust indices to be relative to the full target string
          bestMatchedIndices = matchedIndices.map(i => start + i)
        }
      }
    }
  }

  if (bestStart !== -1) {
    return {
      matched: true,
      score: bestScore,
      matchedIndices: bestMatchedIndices,
    }
  }

  return { matched: false, score: 0, matchedIndices: [] }
}

/**
 * Computes edit distance and tracks which characters matched
 */
function editDistanceWithPath(
  s1: string,
  s2: string,
): { distance: number, matchedIndices: number[] } {
  const m = s1.length
  const n = s2.length

  // DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  // Initialize
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      }
      else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  // Backtrack to find matched indices
  const matchedIndices: number[] = []
  let i = m
  let j = n

  while (i > 0 && j > 0) {
    if (s1[i - 1] === s2[j - 1]) {
      matchedIndices.unshift(i - 1)
      i--
      j--
    }
    else if (dp[i - 1][j - 1] <= dp[i - 1][j] && dp[i - 1][j - 1] <= dp[i][j - 1]) {
      // Substitution
      i--
      j--
    }
    else if (dp[i - 1][j] <= dp[i][j - 1]) {
      // Deletion from s1
      i--
    }
    else {
      // Insertion into s1
      j--
    }
  }

  return { distance: dp[m][n], matchedIndices }
}

/**
 * Calculate fuzzy match score based on various factors
 */
function calculateFuzzyScore(
  editDistance: number,
  queryLength: number,
  matchStart: number,
  targetLength: number,
): number {
  // Base score from edit distance (0.5 - 0.7 range for fuzzy matches)
  const distanceScore = Math.max(0, 1 - editDistance / queryLength) * 0.3 + 0.4

  // Bonus for matching at the start
  const positionBonus = matchStart === 0 ? 0.15 : 0

  // Bonus for shorter targets (more specific matches)
  const lengthBonus = Math.min(0.1, queryLength / targetLength * 0.1)

  return Math.min(0.75, distanceScore + positionBonus + lengthBonus)
}

/**
 * Convert matched indices to Range array for highlighting
 */
export function indicesToRanges(indices: number[]): Array<{ start: number, end: number }> {
  if (!indices.length)
    return []

  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b)
  const ranges: Array<{ start: number, end: number }> = []

  let start = sorted[0]
  let end = sorted[0] + 1

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end) {
      end++
    }
    else {
      ranges.push({ start, end })
      start = sorted[i]
      end = sorted[i] + 1
    }
  }
  ranges.push({ start, end })

  return ranges
}
