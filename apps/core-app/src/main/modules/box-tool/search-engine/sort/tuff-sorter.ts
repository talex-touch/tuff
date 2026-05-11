import type { TuffQuery } from '@talex-touch/utils/core-box'
import type { ISortMiddleware, TuffItem } from '../types'
import { calculateFrequencyScore } from '../usage-utils'

const DEFAULT_KIND_BIAS: Record<string, number> = {
  app: 12,
  feature: 12,
  command: 11,
  plugin: 8,
  file: 6,
  url: 4,
  text: 4,
  preview: 10000
}

const MATCH_SCORE_MULTIPLIER = 20_000
const FREQUENCY_SCORE_MULTIPLIER = 120_000
const RECENCY_SCORE_MULTIPLIER = 500
const KIND_SCORE_MULTIPLIER = 300
const APP_TITLE_PREFIX_INTENT_BONUS = 480_000
const APP_TITLE_SUBSTRING_INTENT_BONUS = 180_000
const APP_EXACT_TOKEN_INTENT_BONUS = 6_200_000
const APP_PREFIX_TOKEN_INTENT_BONUS = 5_700_000
const LOW_CONFIDENCE_FEATURE_FREQUENCY_CAP = 18
const LOW_CONFIDENCE_FEATURE_RECENCY_CAP = 1

function getKindBias(item: TuffItem): number {
  const kind = item.kind || 'unknown'
  const baseBias = DEFAULT_KIND_BIAS[kind] || 0

  // Feature manifest priority remains effective, but only as a soft bias.
  const metaPriority = Number(item.meta?.priority) || 0
  return baseBias + metaPriority
}

function getFrequencyWeightFactor(item: TuffItem): number {
  if (item.kind === 'feature') {
    return 1.35
  }

  if (item.kind === 'command') {
    return 1.2
  }

  return 1
}

function getMatchSource(item: TuffItem): string | null {
  const source = item.meta?.extension?.source
  return typeof source === 'string' && source ? source : null
}

function hasSearchTokenMatch(item: TuffItem, normalizedKey: string): boolean {
  const rawTokens = item.meta?.extension?.searchTokens
  if (!Array.isArray(rawTokens)) return false

  return rawTokens.some((token) => {
    if (typeof token !== 'string') return false
    const lowerToken = token.toLowerCase()
    return (
      lowerToken === normalizedKey ||
      lowerToken.startsWith(normalizedKey) ||
      lowerToken.includes(normalizedKey)
    )
  })
}

function hasExactSearchTokenMatch(item: TuffItem, normalizedKey: string): boolean {
  const rawTokens = item.meta?.extension?.searchTokens
  if (!Array.isArray(rawTokens)) return false

  return rawTokens.some((token) => {
    if (typeof token !== 'string') return false
    return token.toLowerCase() === normalizedKey
  })
}

function hasSearchTokenPrefixMatch(item: TuffItem, normalizedKey: string): boolean {
  const rawTokens = item.meta?.extension?.searchTokens
  if (!Array.isArray(rawTokens)) return false

  return rawTokens.some((token) => {
    if (typeof token !== 'string') return false
    const lowerToken = token.toLowerCase()
    return lowerToken !== normalizedKey && lowerToken.startsWith(normalizedKey)
  })
}

function hasTitleWordPrefixMatch(titleLower: string, normalizedKey: string): boolean {
  if (normalizedKey.length < 2) return false

  return titleLower
    .split(/[\s._/\\()[\]{}:+-]+/)
    .filter(Boolean)
    .some((word) => word.startsWith(normalizedKey))
}

function isLowConfidenceFeatureRecall(item: TuffItem, searchKey?: string): boolean {
  if (item.kind !== 'feature') return false

  const normalizedKey = searchKey?.trim().toLowerCase()
  if (!normalizedKey) return false

  const titleLower = item.render.basic?.title?.toLowerCase() || ''
  if (titleLower.includes(normalizedKey)) return false

  const matchSource = getMatchSource(item)
  if (matchSource === 'token' || matchSource === 'fuzzy-token') return true
  if (hasSearchTokenMatch(item, normalizedKey)) return true

  const sourceIdLower = item.source?.id?.toLowerCase()
  return Boolean(sourceIdLower?.includes(normalizedKey))
}

function getAppTitleIntentBonus(item: TuffItem, searchKey?: string): number {
  if (item.kind !== 'app') return 0

  const normalizedKey = searchKey?.trim().toLowerCase()
  if (!normalizedKey || normalizedKey.length < 2) return 0

  const titleLower = item.render.basic?.title?.toLowerCase() || ''
  if (!titleLower.includes(normalizedKey)) return 0

  if (titleLower.startsWith(normalizedKey)) return APP_TITLE_PREFIX_INTENT_BONUS
  if (hasTitleWordPrefixMatch(titleLower, normalizedKey)) return APP_TITLE_PREFIX_INTENT_BONUS
  return APP_TITLE_SUBSTRING_INTENT_BONUS
}

function getAppAliasIntentBonus(item: TuffItem, searchKey?: string): number {
  if (item.kind !== 'app') return 0

  const normalizedKey = searchKey?.trim().toLowerCase()
  if (!normalizedKey || normalizedKey.length < 2) return 0

  if (hasExactSearchTokenMatch(item, normalizedKey)) {
    return APP_EXACT_TOKEN_INTENT_BONUS
  }

  const titleLower = item.render.basic?.title?.toLowerCase() || ''
  if (titleLower.includes(normalizedKey)) return 0

  return hasSearchTokenPrefixMatch(item, normalizedKey) ? APP_PREFIX_TOKEN_INTENT_BONUS : 0
}

/**
 * Calculate match score based on title and source.id matching
 * @param item - TuffItem to calculate score for
 * @param searchKey - Search keyword (lowercase)
 * @returns Match score (higher is better)
 */
function calculateMatchScore(item: TuffItem, searchKey?: string): number {
  const normalizedKey = searchKey?.trim().toLowerCase()

  if (!normalizedKey) return 0

  const title = item.render.basic?.title
  const titleLower = title?.toLowerCase() || ''
  const titleLength = titleLower.length
  const hasDirectTitleMatch = titleLower.includes(normalizedKey)
  const matchSource = getMatchSource(item)
  const rawTokens = item.meta?.extension?.searchTokens
  const searchTokens = Array.isArray(rawTokens)
    ? rawTokens.filter((t): t is string => typeof t === 'string' && Boolean(t))
    : []
  const isTokenBackedMatch = matchSource === 'token' || matchSource === 'fuzzy-token'

  // Visible title matches should beat hidden token/source matches. This keeps
  // application searches from being displaced by plugin feature aliases.
  if (titleLower === normalizedKey) return 1000

  const matchRanges = item.meta?.extension?.matchResult as
    | { start: number; end: number }[]
    | undefined
  if (titleLength > 0 && matchRanges && matchRanges.length > 0 && !isTokenBackedMatch) {
    // Using the first match range to calculate the score
    const { start, end } = matchRanges[0]
    const matchLength = end - start

    let score = 400

    // 1. Match length reward
    score += (matchLength / titleLength) * 100 // Match length reward

    // 2. Beginning match reward
    if (start === 0) {
      const isInitialsMatch = matchSource === 'initials'
      if (titleLower.startsWith(normalizedKey)) {
        score += 300 // 标题真实开头匹配，大幅加分
      } else if (isInitialsMatch) {
        score += 140 // 缩写命中给适度奖励，避免被别名伪高亮压制
      }
    }

    // 3. Continuity/relevance reward (compared to search term length)
    if (hasDirectTitleMatch && matchLength === normalizedKey.length) {
      score += 200
    }

    // Non-title sources (tag/path/description) may use fallback highlight ranges.
    // Prevent synthetic ranges from outranking direct title matches.
    if (
      !hasDirectTitleMatch &&
      (matchSource === 'tag' || matchSource === 'path' || matchSource === 'description')
    ) {
      return Math.min(Math.round(score), 280)
    }

    return Math.round(score)
  }

  if (titleLength > 0 && titleLower.includes(normalizedKey)) {
    if (titleLower.startsWith(normalizedKey)) return 500
    if (hasTitleWordPrefixMatch(titleLower, normalizedKey)) return 500
    return 300
  }

  // Token match (keywords/pinyin/initials generated at registration). Tokens
  // are recall signals, so they stay below visible title matches.
  if (searchTokens.length > 0) {
    for (const token of searchTokens) {
      const lowerToken = token.toLowerCase()
      if (!lowerToken) continue

      if (lowerToken === normalizedKey) return 260
      if (lowerToken.startsWith(normalizedKey)) return 240
      if (lowerToken.includes(normalizedKey)) return 180
    }
  }

  // Check source.id match for features as a low-confidence fallback.
  if (item.kind === 'feature' && item.source?.id) {
    const sourceIdLower = item.source.id.toLowerCase()

    if (sourceIdLower === normalizedKey) {
      return 250
    }

    if (sourceIdLower.includes(normalizedKey)) {
      if (sourceIdLower.startsWith(normalizedKey)) {
        return 230
      }
      return 170
    }
  }

  return 0
}

export function calculateSortScore(item: TuffItem, searchKey?: string): number {
  const matchScore = calculateMatchScore(item, searchKey)
  const kindBias = getKindBias(item)
  const appTitleIntentBonus = getAppTitleIntentBonus(item, searchKey)
  const appAliasIntentBonus = getAppAliasIntentBonus(item, searchKey)
  let recency = item.scoring?.recency || 0

  // 使用增强的频率计算（从 meta.usageStats 读取）
  let frequency = item.scoring?.frequency || 0

  // 如果存在使用统计元数据，使用带时间衰减的计算（含 cancel 惩罚）
  if (item.meta?.usageStats) {
    const stats = item.meta.usageStats

    const lastExecuted = stats.lastExecuted ? new Date(stats.lastExecuted) : null
    const lastSearched = stats.lastSearched ? new Date(stats.lastSearched) : null
    const lastCancelled = stats.lastCancelled ? new Date(stats.lastCancelled) : null

    frequency = calculateFrequencyScore(
      stats.executeCount,
      stats.searchCount,
      stats.cancelCount || 0,
      lastExecuted,
      lastSearched,
      lastCancelled,
      0.1
    )
  }

  if (isLowConfidenceFeatureRecall(item, searchKey)) {
    frequency = Math.min(frequency, LOW_CONFIDENCE_FEATURE_FREQUENCY_CAP)
    recency = Math.min(recency, LOW_CONFIDENCE_FEATURE_RECENCY_CAP)
  }

  // Scoring formula:
  // 1) matchScore 主导排序，避免按 kind 强制置顶；
  // 2) frequency/recency 作为行为学习信号；
  // 3) kindBias 与 manifest priority 仅作为软偏置；
  // 4) feature/command 频次权重略高，提升常用功能的自学习效果；
  // 5) 频次使用 log 增长，避免超高历史次数压过明显更高的匹配分。
  const frequencyWeighted = Math.log1p(Math.max(0, frequency)) * getFrequencyWeightFactor(item)
  const finalScore =
    matchScore * MATCH_SCORE_MULTIPLIER +
    frequencyWeighted * FREQUENCY_SCORE_MULTIPLIER +
    recency * RECENCY_SCORE_MULTIPLIER +
    kindBias * KIND_SCORE_MULTIPLIER +
    appTitleIntentBonus +
    appAliasIntentBonus

  return finalScore
}

export const tuffSorter: ISortMiddleware = {
  name: 'tuff-sorter',
  sort: (items: TuffItem[], query: TuffQuery) => {
    const searchKey = query.text?.trim().toLowerCase()

    const isPinnedItem = (item: TuffItem): boolean => {
      return Boolean(item.meta?.pinned?.isPinned)
    }

    // Use the Schwartzian transform (decorate-sort-undecorate) for performance.
    // Decorate: Calculate the sort score for each item once.
    const decoratedItems = items.map((item) => ({
      item,
      score: calculateSortScore(item, searchKey),
      pinned: isPinnedItem(item)
    }))

    // Sort: The comparison function is now a simple number comparison.
    decoratedItems.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.score - a.score
    })

    // Undecorate: Extract the sorted items.
    return decoratedItems.map((decorated) => decorated.item)
  }
}
