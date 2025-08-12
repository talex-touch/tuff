import { TuffQuery } from '@talex-touch/utils/core-box'
import { ISortMiddleware, TuffItem } from '../types'

const DEFAULT_WEIGHTS: Record<string, number> = {
  app: 10,
  feature: 5,
  command: 5,
  plugin: 3,
  file: 2,
  url: 1,
  text: 1
}

function getWeight(item: TuffItem): number {
  const kind = item.kind || 'unknown'
  // Special case for frequently used features
  if (kind === 'feature' && (item.scoring?.frequency || 0) > 0.5) {
    return 10
  }
  return DEFAULT_WEIGHTS[kind] || 0
}

function calculateMatchScore(item: TuffItem, keyword?: string): number {
  const title = item.render.basic?.title
  if (!keyword || !title) return 0

  const name = title.toLowerCase()
  const searchKey = keyword.toLowerCase()

  if (name === searchKey) return 1000

  const pinyinMatch = item.meta?.extension?.matchResult
  if (pinyinMatch) {
    const [start, end] = pinyinMatch
    const matchLength = end - start + 1
    const nameLength = name.length

    // Higher score for matches at the beginning
    if (start === 0) return 800 + (matchLength / nameLength) * 100

    // Higher score for exact length matches
    if (matchLength === searchKey.length) return 600 + (matchLength / nameLength) * 100

    return 400 + (matchLength / nameLength) * 100
  }

  if (name.includes(searchKey)) {
    if (name.startsWith(searchKey)) return 500
    return 300
  }

  return 0
}

export function calculateSortScore(item: TuffItem, keyword?: string): number {
  const matchScore = calculateMatchScore(item, keyword)
  const weight = getWeight(item)
  const recency = item.scoring?.recency || 0
  const frequency = item.scoring?.frequency || 0

  // Final score combines match quality, item type weight, and usage stats
  return matchScore * 10000 + weight * 1000 + recency * 100 + frequency * 10
}

export const tuffSorter: ISortMiddleware = {
  name: 'tuff-sorter',
  sort: (items: TuffItem[], query: TuffQuery) => {
    return items.sort((a, b) => {
      const scoreA = calculateSortScore(a, query.text)
      const scoreB = calculateSortScore(b, query.text)
      return scoreB - scoreA
    })
  }
}
