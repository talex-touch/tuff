import { TuffItem, TuffQuery } from '@talex-touch/utils'
import { ISortMiddleware } from '../types'

const DEFAULT_WEIGHTS: Record<string, number> = {
  app: 10,
  feature: 5,
  cmd: 5,
  plugin: 3,
  file: 2,
  text: 1
}

function getWeight(item: TuffItem): number {
  if ((item.type === 'feature' || item.type === 'feature') && (item.scoring?.amo || 0) > 10) {
    return 10
  }

  const type = item.type || 'unknown'
  return DEFAULT_WEIGHTS[type] || 0
}

function calculateMatchScore(item: TuffItem, keyword?: string): number {
  if (!keyword) return 0

  const name = item.title.toLowerCase()
  const searchKey = keyword.toLowerCase()

  if (name === searchKey) return 1000

  if (item.scoring?.match) {
    const [start, end] = item.scoring.match
    const matchLength = end - start + 1
    const nameLength = name.length

    if (start === 0) return 800 + (matchLength / nameLength) * 100

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
  const amo = item.scoring?.amo || 0

  return matchScore * 100000 + weight * 1000 + amo
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