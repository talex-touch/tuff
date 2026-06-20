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
export type FeatureSearchTokenSource =
  | 'id'
  | 'title'
  | 'description'
  | 'keyword'
  | 'command'
  | 'pinyin'
  | 'initials'
  | 'legacy'
  | 'name'
  | 'alternate-name'
  | 'alternate-initials'
  | 'alias'
  | 'path'
  | 'displayPath'
  | 'fileName'
  | 'bundleId'
  | 'appIdentity'
  | 'launchTarget'

export interface FeatureSearchTokenSegment {
  tokenStart: number
  tokenEnd: number
  titleStart?: number
  titleEnd?: number
  displayStart?: number
  displayEnd?: number
}

export interface FeatureSearchToken {
  value: string
  source: FeatureSearchTokenSource
  display?: string
  segments?: FeatureSearchTokenSegment[]
}

export type FeatureSearchTokenInput = string | FeatureSearchToken

export interface FeatureMatchAlias {
  text: string
  matchRanges: MatchRange[]
}

export interface FeatureMatchResult {
  /** Whether the feature matches the query */
  matched: boolean
  /** Match score (0-1000, higher is better) */
  score: number
  /** Match type for debugging */
  matchType: 'exact' | 'token' | 'prefix' | 'contains' | 'fuzzy' | 'none'
  /** Match ranges for highlighting in title */
  matchRanges: MatchRange[]
  /** Visible alias to render when the matched token does not map to title text */
  matchedAlias?: FeatureMatchAlias
  /** Which token matched (for debugging) */
  matchedToken?: string
  /** Source of the matched token (for source-specific UI metadata) */
  matchedTokenSource?: FeatureSearchTokenSource
}

/**
 * Options for feature matching
 */
export interface FeatureMatchOptions {
  /** Feature title/name */
  title: string
  /** Feature description */
  desc?: string
  /** Pre-computed search tokens (pinyin, initials, aliases, commands, etc.) */
  searchTokens?: FeatureSearchTokenInput[]
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

  if (index === -1)
    return null

  return { start: index, end: index + query.length }
}

/**
 * Match query against a single token and return match info
 */
function matchToken(
  token: string,
  query: string,
): {
  matched: boolean
  score: number
  type: 'exact' | 'prefix' | 'contains' | 'none'
  range?: MatchRange
} {
  const lowerToken = token.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Exact match
  if (lowerToken === lowerQuery) {
    return { matched: true, score: 1000, type: 'exact', range: { start: 0, end: token.length } }
  }

  // Prefix match (token starts with query)
  if (lowerToken.startsWith(lowerQuery)) {
    // Score based on how much of the token is matched
    const coverage = lowerQuery.length / lowerToken.length
    return {
      matched: true,
      score: 800 + Math.round(coverage * 100),
      type: 'prefix',
      range: { start: 0, end: query.length },
    }
  }

  // Contains match
  if (lowerToken.includes(lowerQuery)) {
    const coverage = lowerQuery.length / lowerToken.length
    const start = lowerToken.indexOf(lowerQuery)
    return {
      matched: true,
      score: 600 + Math.round(coverage * 50),
      type: 'contains',
      range: { start, end: start + query.length },
    }
  }

  return { matched: false, score: 0, type: 'none' }
}

function normalizeSearchToken(input: FeatureSearchTokenInput): FeatureSearchToken | null {
  if (typeof input === 'string') {
    const value = input.trim()
    return value ? { value, source: 'legacy' } : null
  }

  const value = input.value.trim()
  return value ? { ...input, value } : null
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length <= 1) return ranges

  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  const merged: MatchRange[] = []
  const first = sorted[0]
  if (!first) return []

  let current: MatchRange = { start: first.start, end: first.end }

  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]
    if (!next) continue
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end)
      continue
    }
    merged.push(current)
    current = { start: next.start, end: next.end }
  }

  merged.push(current)
  return merged
}

function mapTokenMatchToTitleRanges(
  token: FeatureSearchToken,
  tokenRange?: MatchRange,
): MatchRange[] | null {
  if (!tokenRange || !token.segments?.length) return null

  const ranges: MatchRange[] = []
  for (const segment of token.segments) {
    if (segment.titleStart === undefined || segment.titleEnd === undefined) continue
    const overlapStart = Math.max(tokenRange.start, segment.tokenStart)
    const overlapEnd = Math.min(tokenRange.end, segment.tokenEnd)
    if (overlapStart >= overlapEnd) continue

    const titleOffsetStart = overlapStart - segment.tokenStart
    const titleOffsetEnd = overlapEnd - segment.tokenStart
    ranges.push({
      start: segment.titleStart + titleOffsetStart,
      end: Math.min(segment.titleEnd, segment.titleStart + titleOffsetEnd),
    })
  }

  return ranges.length > 0 ? mergeRanges(ranges) : null
}

interface AliasTextPart {
  rawStart: number
  rawText: string
  aliasText: string
}

const ALIAS_WORD_REGEX = /[^\s._/\\()[\]{}:+-]+/g

function isAliasCamelBoundary(previous: string | undefined, current: string | undefined): boolean {
  return Boolean(previous && current && /[a-z0-9]/.test(previous) && /[A-Z]/.test(current))
}

function capitalizeAliasPart(part: string): string {
  return part.charAt(0).toUpperCase() + part.slice(1)
}

function collectAliasTextParts(text: string): AliasTextPart[] {
  const parts: AliasTextPart[] = []

  for (const match of text.matchAll(ALIAS_WORD_REGEX)) {
    const rawWord = match[0]
    const rawStart = match.index ?? 0
    let partStart = 0

    for (let offset = 1; offset < rawWord.length; offset += 1) {
      if (!isAliasCamelBoundary(rawWord[offset - 1], rawWord[offset])) continue

      const rawText = rawWord.slice(partStart, offset)
      if (rawText) {
        parts.push({
          rawStart: rawStart + partStart,
          rawText,
          aliasText: capitalizeAliasPart(rawText),
        })
      }
      partStart = offset
    }

    const rawText = rawWord.slice(partStart)
    if (rawText) {
      parts.push({
        rawStart: rawStart + partStart,
        rawText,
        aliasText: capitalizeAliasPart(rawText),
      })
    }
  }

  return parts
}

function mapRawDisplayRangeToAliasRange(
  rawToAliasIndex: Map<number, number>,
  rawStart: number,
  rawEnd: number,
): MatchRange | null {
  if (rawEnd <= rawStart) return null

  const start = rawToAliasIndex.get(rawStart)
  const end = rawToAliasIndex.get(rawEnd - 1)
  if (start === undefined || end === undefined || start > end) return null

  return { start, end: end + 1 }
}

function mapSegmentedTokenRangeToAliasRanges(
  token: FeatureSearchToken,
  tokenRange: MatchRange,
  rawToAliasIndex: Map<number, number>,
): MatchRange[] {
  const ranges: MatchRange[] = []

  for (const segment of token.segments ?? []) {
    if (segment.displayStart === undefined || segment.displayEnd === undefined) continue

    const overlapStart = Math.max(tokenRange.start, segment.tokenStart)
    const overlapEnd = Math.min(tokenRange.end, segment.tokenEnd)
    if (overlapStart >= overlapEnd) continue

    const displayStart = segment.displayStart + (overlapStart - segment.tokenStart)
    const displayEnd = Math.min(
      segment.displayEnd,
      segment.displayStart + (overlapEnd - segment.tokenStart),
    )
    const range = mapRawDisplayRangeToAliasRange(rawToAliasIndex, displayStart, displayEnd)
    if (range) ranges.push(range)
  }

  return ranges.length > 0 ? mergeRanges(ranges) : []
}

function formatMatchedAlias(token: FeatureSearchToken, tokenRange?: MatchRange): FeatureMatchAlias {
  const normalized = (token.display || token.value).trim()
  const parts = collectAliasTextParts(normalized)
  const text = parts.map((part) => part.aliasText).join(' ') || normalized
  const rawToAliasIndex = new Map<number, number>()

  let displayIndex = 0
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (!part) continue
    if (index > 0) displayIndex += 1

    for (let offset = 0; offset < part.rawText.length; offset += 1) {
      rawToAliasIndex.set(part.rawStart + offset, displayIndex + offset)
    }

    displayIndex += part.aliasText.length
  }

  const range = tokenRange
  if (!range) return { text, matchRanges: [] }

  const segmentedRanges = mapSegmentedTokenRangeToAliasRanges(token, range, rawToAliasIndex)
  if (segmentedRanges.length > 0) {
    return { text, matchRanges: segmentedRanges }
  }

  const tokenDisplayStart = normalized.toLowerCase().indexOf(token.value.toLowerCase())
  if (tokenDisplayStart !== -1) {
    const displayRange = mapRawDisplayRangeToAliasRange(
      rawToAliasIndex,
      tokenDisplayStart + range.start,
      tokenDisplayStart + range.end,
    )
    if (displayRange) {
      return { text, matchRanges: [displayRange] }
    }
  }

  const hasCustomDisplay = Boolean(
    token.display?.trim() && token.display.trim().toLowerCase() !== token.value.toLowerCase(),
  )
  if (hasCustomDisplay) {
    return { text, matchRanges: [] }
  }

  const start = rawToAliasIndex.get(range.start) ?? 0
  const end =
    range.end <= range.start
      ? start
      : (rawToAliasIndex.get(range.end - 1) ?? Math.max(0, text.length - 1)) + 1

  return {
    text,
    matchRanges: start < end ? [{ start, end }] : [],
  }
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
    maxFuzzyErrors = 2,
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
      matchRanges: [{ start: 0, end: title.length }],
    }
  }

  // 2. Title prefix match
  if (lowerTitle.startsWith(lowerQuery)) {
    return {
      matched: true,
      score: 900,
      matchType: 'prefix',
      matchRanges: [{ start: 0, end: trimmedQuery.length }],
    }
  }

  // 3. Title contains match
  const titleMatch = findSubstringMatch(title, trimmedQuery)
  if (titleMatch) {
    return {
      matched: true,
      score: 700,
      matchType: 'contains',
      matchRanges: [titleMatch],
    }
  }

  // 4. Search tokens matching (pinyin, initials, keywords)
  // This enables searching "fanyi" to match "翻译"
  if (searchTokens.length > 0) {
    const tokenMatches: Array<{
      score: number
      type: 'exact' | 'prefix' | 'contains'
      token: FeatureSearchToken
      range?: MatchRange
      titleRanges: MatchRange[] | null
    }> = []

    for (const rawToken of searchTokens) {
      const token = normalizeSearchToken(rawToken)
      if (!token)
        continue

      const result = matchToken(token.value, trimmedQuery)
      if (!result.matched) continue

      tokenMatches.push({
        score: result.score,
        type: result.type as 'exact' | 'prefix' | 'contains',
        token,
        range: result.range,
        titleRanges: mapTokenMatchToTitleRanges(token, result.range),
      })
    }

    const bestTokenMatch = tokenMatches.sort((a, b) => {
      const titleRangeDelta = Number(Boolean(b.titleRanges)) - Number(Boolean(a.titleRanges))
      if (titleRangeDelta !== 0) return titleRangeDelta
      return b.score - a.score
    })[0]

    if (bestTokenMatch) {
      return {
        matched: true,
        score: bestTokenMatch.score - 50, // Slightly lower than direct title match
        matchType: 'token',
        matchRanges: bestTokenMatch.titleRanges ?? [],
        matchedAlias: bestTokenMatch.titleRanges
          ? undefined
          : formatMatchedAlias(bestTokenMatch.token, bestTokenMatch.range),
        matchedToken: bestTokenMatch.token.value,
        matchedTokenSource: bestTokenMatch.token.source,
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
        matchRanges: [], // No title highlight for desc matches
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
        matchRanges: indicesToRanges(fuzzyResult.matchedIndices),
      }
    }

    // Try fuzzy on tokens
    for (const rawToken of searchTokens) {
      const token = normalizeSearchToken(rawToken)
      if (!token || token.value.length < 2)
        continue

      const tokenFuzzy = fuzzyMatch(token.value, trimmedQuery, maxFuzzyErrors)
      if (tokenFuzzy.matched && tokenFuzzy.score > 0.6) {
        return {
          matched: true,
          score: Math.round(tokenFuzzy.score * 400),
          matchType: 'fuzzy',
          matchRanges: [],
          matchedAlias: formatMatchedAlias(token),
          matchedToken: token.value,
          matchedTokenSource: token.source,
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
export function matchFeatures<T extends { searchTokens?: FeatureSearchTokenInput[] }>(
  features: Array<{
    feature: T
    title: string
    desc?: string
  }>,
  query: string,
): Array<{
  feature: T
  result: FeatureMatchResult
}> {
  const results: Array<{ feature: T, result: FeatureMatchResult }> = []

  for (const { feature, title, desc } of features) {
    const result = matchFeature({
      title,
      desc,
      searchTokens: feature.searchTokens,
      query,
    })

    if (result.matched) {
      results.push({ feature, result })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.result.score - a.result.score)

  return results
}
