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

  // Perfect title match
  if (titleLower === normalizedKey) return 1000

  // Token match (keywords/pinyin/initials generated at registration)
  if (searchTokens.length > 0) {
    for (const token of searchTokens) {
      const lowerToken = token.toLowerCase()
      if (!lowerToken) continue

      if (lowerToken === normalizedKey) return 950
      if (lowerToken.startsWith(normalizedKey)) return 800
      if (lowerToken.includes(normalizedKey)) return 650
    }
  }

  // Check source.id match for features (e.g., 'clipboard' matches 'clipboard-history')
  // This is especially useful for English searches matching features with Chinese titles
  if (item.kind === 'feature' && item.source?.id) {
    const sourceIdLower = item.source.id.toLowerCase()

    // Exact source.id match
    if (sourceIdLower === normalizedKey) {
      return 900
    }

    // Source.id contains search key (e.g., 'clipboard-history' contains 'clipboard')
    if (sourceIdLower.includes(normalizedKey)) {
      // Higher score if search key is at the start
      if (sourceIdLower.startsWith(normalizedKey)) {
        return 850
      }
      return 800
    }
  }

  // Title-based matching (original logic)
  if (titleLength === 0) return 0

  const matchRanges = item.meta?.extension?.matchResult as
    | { start: number; end: number }[]
    | undefined
  if (matchRanges && matchRanges.length > 0) {
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

  if (titleLower.includes(normalizedKey)) {
    if (titleLower.startsWith(normalizedKey)) return 500
    return 300
  }

  return 0
}

export function calculateSortScore(item: TuffItem, searchKey?: string): number {
  const matchScore = calculateMatchScore(item, searchKey)
  const kindBias = getKindBias(item)
  const recency = item.scoring?.recency || 0

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
    kindBias * KIND_SCORE_MULTIPLIER

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
