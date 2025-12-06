import type { TuffQuery } from '@talex-touch/utils/core-box'
import type { ISortMiddleware, TuffItem } from '../types'
import { calculateFrequencyScore } from '../usage-utils'

const DEFAULT_WEIGHTS: Record<string, number> = {
  app: 100,
  feature: 5,
  command: 5,
  plugin: 3,
  file: 2,
  url: 1,
  text: 1,
  preview: 10000
}

function getWeight(item: TuffItem): number {
  const kind = item.kind || 'unknown'
  return DEFAULT_WEIGHTS[kind] || 0
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
      score += 300 // 开头匹配，大幅加分
    }

    // 3. Continuity/relevance reward (compared to search term length)
    if (matchLength === normalizedKey.length) {
      score += 200
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
  const weight = getWeight(item)
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

  const finalScore = weight * 1000000 + matchScore * 10000 + recency * 100 + frequency * 10

  return finalScore
}

export const tuffSorter: ISortMiddleware = {
  name: 'tuff-sorter',
  sort: (items: TuffItem[], query: TuffQuery) => {
    const searchKey = query.text?.trim().toLowerCase()

    // Use the Schwartzian transform (decorate-sort-undecorate) for performance.
    // Decorate: Calculate the sort score for each item once.
    const decoratedItems = items.map((item) => ({
      item,
      score: calculateSortScore(item, searchKey)
    }))

    // Sort: The comparison function is now a simple number comparison.
    decoratedItems.sort((a, b) => b.score - a.score)

    // Undecorate: Extract the sorted items.
    return decoratedItems.map((decorated) => decorated.item)
  }
}
