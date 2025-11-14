import { TuffQuery } from '@talex-touch/utils/core-box'
import { ISortMiddleware, TuffItem } from '../types'
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

function calculateMatchScore(item: TuffItem, searchKey?: string): number {
  const title = item.render.basic?.title
  if (!searchKey || !title) return 0

  const name = title.toLowerCase()
  const nameLength = name.length
  if (nameLength === 0) return 0

  if (name === searchKey) return 1000

  const matchRanges = item.meta?.extension?.matchResult as
    | { start: number; end: number }[]
    | undefined
  if (matchRanges && matchRanges.length > 0) {
    // Using the first match range to calculate the score
    const { start, end } = matchRanges[0]
    const matchLength = end - start

    let score = 400

    // 1. Match length reward
    score += (matchLength / nameLength) * 100 // Match length reward

    // 2. Beginning match reward
    if (start === 0) {
      score += 300 // 开头匹配，大幅加分
    }

    // 3. Continuity/relevance reward (compared to search term length)
    if (matchLength === searchKey.length) {
      score += 200
    }

    return Math.round(score)
  }

  if (name.includes(searchKey)) {
    if (name.startsWith(searchKey)) return 500
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
      0.1 // lambda 参数，PRD 要求
    )
  }

  const finalScore = weight * 1000000 + matchScore * 10000 + recency * 100 + frequency * 10

  return finalScore
}

export const tuffSorter: ISortMiddleware = {
  name: 'tuff-sorter',
  sort: (items: TuffItem[], query: TuffQuery) => {
    const searchKey = query.text?.toLowerCase()

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
