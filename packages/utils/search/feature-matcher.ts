/**
 * Feature Matching Utilities
 *
 * Provides enhanced search matching for plugin features with:
 * - Pinyin/English token matching
 * - Fuzzy match support
 * - Match range generation for UI highlighting
 */

import { fuzzyMatch, indicesToRanges } from './fuzzy-match'

/**
 * Match range for highlighting
 */
export interface MatchRange {
  start: number
  end: number
}

/**
 * Feature match result with score and highlight ranges
 */
export interface FeatureMatchResult {
  /** Whether the feature matches the query */
  matched: boolean
  /** Match score (0-1000, higher is better) */
  score: number
  /** Match type for debugging */
  matchType: 'exact' | 'token' | 'prefix' | 'contains' | 'fuzzy' | 'none'
  /** Match ranges for highlighting in title */
  matchRanges: MatchRange[]
  /** Which token matched (for debugging) */
  matchedToken?: string
}

/**
 * Options for feature matching
 */
export interface FeatureMatchOptions {
  /** Feature title/name */
  title: string
  /** Feature description */
  desc?: string
  /** Pre-computed search tokens (pinyin, initials, etc.) */
  searchTokens?: string[]
  /** Search query */
  query: string
  /** Enable fuzzy matching (default: true) */
  enableFuzzy?: boolean
  /** Maximum fuzzy errors (default: 2) */
  maxFuzzyErrors?: number
}

/**
 * Find substring match and return range
 */
function findSubstringMatch(text: string, query: string): MatchRange | null {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return null

  return { start: index, end: index + query.length }
}

/**
 * Match query against a single token and return match info
 */
function matchToken(
  token: string,
  query: string
): { matched: boolean; score: number; type: 'exact' | 'prefix' | 'contains' | 'none' } {
  const lowerToken = token.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Exact match
  if (lowerToken === lowerQuery) {
    return { matched: true, score: 1000, type: 'exact' }
  }

  // Prefix match (token starts with query)
  if (lowerToken.startsWith(lowerQuery)) {
    // Score based on how much of the token is matched
    const coverage = lowerQuery.length / lowerToken.length
    return { matched: true, score: 800 + Math.round(coverage * 100), type: 'prefix' }
  }

  // Contains match
  if (lowerToken.includes(lowerQuery)) {
    const coverage = lowerQuery.length / lowerToken.length
    return { matched: true, score: 600 + Math.round(coverage * 50), type: 'contains' }
  }

  return { matched: false, score: 0, type: 'none' }
}

/**
 * Match feature against search query
 *
 * This is the main matching function that:
 * 1. Tries exact/prefix/contains match against title
 * 2. Tries token matching (pinyin, initials, keywords)
 * 3. Falls back to fuzzy matching
 *
 * @returns FeatureMatchResult with score and highlight ranges
 */
export function matchFeature(options: FeatureMatchOptions): FeatureMatchResult {
  const {
    title,
    desc,
    searchTokens = [],
    query,
    enableFuzzy = true,
    maxFuzzyErrors = 2
  } = options

  const trimmedQuery = query.trim()

  // Empty query - no match
  if (!trimmedQuery) {
    return { matched: false, score: 0, matchType: 'none', matchRanges: [] }
  }

  const lowerQuery = trimmedQuery.toLowerCase()
  const lowerTitle = title.toLowerCase()

  // 1. Exact title match
  if (lowerTitle === lowerQuery) {
    return {
      matched: true,
      score: 1000,
      matchType: 'exact',
      matchRanges: [{ start: 0, end: title.length }]
    }
  }

  // 2. Title prefix match
  if (lowerTitle.startsWith(lowerQuery)) {
    return {
      matched: true,
      score: 900,
      matchType: 'prefix',
      matchRanges: [{ start: 0, end: trimmedQuery.length }]
    }
  }

  // 3. Title contains match
  const titleMatch = findSubstringMatch(title, trimmedQuery)
  if (titleMatch) {
    return {
      matched: true,
      score: 700,
      matchType: 'contains',
      matchRanges: [titleMatch]
    }
  }

  // 4. Search tokens matching (pinyin, initials, keywords)
  // This enables searching "fanyi" to match "翻译"
  if (searchTokens.length > 0) {
    let bestTokenMatch: {
      score: number
      type: 'exact' | 'prefix' | 'contains'
      token: string
    } | null = null

    for (const token of searchTokens) {
      if (!token) continue

      const result = matchToken(token, trimmedQuery)
      if (result.matched && (!bestTokenMatch || result.score > bestTokenMatch.score)) {
        bestTokenMatch = {
          score: result.score,
          type: result.type as 'exact' | 'prefix' | 'contains',
          token
        }
      }
    }

    if (bestTokenMatch) {
      // Token matched - highlight entire title since we can't map token back to characters
      // For pinyin matches, the full Chinese title is relevant
      return {
        matched: true,
        score: bestTokenMatch.score - 50, // Slightly lower than direct title match
        matchType: 'token',
        matchRanges: [{ start: 0, end: title.length }],
        matchedToken: bestTokenMatch.token
      }
    }
  }

  // 5. Description matching (lower priority)
  if (desc) {
    const descMatch = findSubstringMatch(desc, trimmedQuery)
    if (descMatch) {
      return {
        matched: true,
        score: 400,
        matchType: 'contains',
        matchRanges: [] // No title highlight for desc matches
      }
    }
  }

  // 6. Fuzzy matching on title
  if (enableFuzzy) {
    const fuzzyResult = fuzzyMatch(title, trimmedQuery, maxFuzzyErrors)
    if (fuzzyResult.matched && fuzzyResult.score > 0.5) {
      return {
        matched: true,
        score: Math.round(fuzzyResult.score * 500), // Scale to 0-500 range
        matchType: 'fuzzy',
        matchRanges: indicesToRanges(fuzzyResult.matchedIndices)
      }
    }

    // Try fuzzy on tokens
    for (const token of searchTokens) {
      if (!token || token.length < 2) continue

      const tokenFuzzy = fuzzyMatch(token, trimmedQuery, maxFuzzyErrors)
      if (tokenFuzzy.matched && tokenFuzzy.score > 0.6) {
        return {
          matched: true,
          score: Math.round(tokenFuzzy.score * 400),
          matchType: 'fuzzy',
          matchRanges: [{ start: 0, end: title.length }],
          matchedToken: token
        }
      }
    }
  }

  return { matched: false, score: 0, matchType: 'none', matchRanges: [] }
}

/**
 * Batch match multiple features and return sorted results
 *
 * @param features Array of features with their search metadata
 * @param query Search query
 * @returns Features sorted by match score (highest first), with match metadata
 */
export function matchFeatures<T extends { searchTokens?: string[] }>(
  features: Array<{
    feature: T
    title: string
    desc?: string
  }>,
  query: string
): Array<{
  feature: T
  result: FeatureMatchResult
}> {
  const results: Array<{ feature: T; result: FeatureMatchResult }> = []

  for (const { feature, title, desc } of features) {
    const result = matchFeature({
      title,
      desc,
      searchTokens: feature.searchTokens,
      query
    })

    if (result.matched) {
      results.push({ feature, result })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.result.score - a.result.score)

  return results
}
