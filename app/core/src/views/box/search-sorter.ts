import type { SearchItem } from './search-box'

/**
 * Search Result Sorting System
 *
 * Provides comprehensive sorting functionality for search results,
 * combining match relevance, type weights, and usage frequency.
 */

/**
 * Default type weights
 */
const DEFAULT_WEIGHTS: Record<string, number> = {
  app: 10,
  feature: 5,
  cmd: 5,
  plugin: 3,
  file: 2,
  text: 1
}

/**
 * Get weight for an item type
 */
function getWeight(item: SearchItem): number {
  // Dynamic rule: feature with high amo gets boosted weight
  if ((item.pluginType === 'feature' || item.type === 'feature') && (item.amo || 0) > 10) {
    return 10
  }

  // Default weight based on type
  const type = item.pluginType || item.type || 'unknown'
  return DEFAULT_WEIGHTS[type] || 0
}

/**
 * Calculate match score based on how well the item matches the search keyword
 * Priority: Exact match > Prefix match > Contains match > Other matches
 * @param item - The search item to score
 * @param keyword - The search keyword
 * @returns Match score (higher is better)
 */
function calculateMatchScore(item: SearchItem, keyword?: string): number {
  if (!keyword) return 0

  const name = item.name.toLowerCase()
  const searchKey = keyword.toLowerCase()

  if (name === searchKey) return 1000

  if (item.matched) {
    const [start, end] = item.matched
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

/**
 * Calculate comprehensive sorting score for an item
 * Score = Match Score × 100000 + Weight × 1000 + Usage Frequency
 * This ensures match relevance has highest priority, then type weight, then usage frequency
 * @param item - The search item to score
 * @param keyword - The search keyword
 * @returns Comprehensive sort score
 */
export function calculateSortScore(item: SearchItem, keyword?: string): number {
  const matchScore = calculateMatchScore(item, keyword)
  const weight = getWeight(item)
  const amo = item.amo || 0

  return matchScore * 100000 + weight * 1000 + amo
}

/**
 * Sort search results by comprehensive score
 * @param items - Array of search items to sort
 * @param keyword - The search keyword
 * @returns Sorted array (highest scores first)
 */
export function sortSearchResults(items: SearchItem[], keyword?: string): SearchItem[] {
  return items.sort((a, b) => {
    const scoreA = calculateSortScore(a, keyword)
    const scoreB = calculateSortScore(b, keyword)
    return scoreB - scoreA
  })
}

/**
 * Insert new item into sorted array while maintaining sort order
 * Used for real-time search result updates
 * @param items - Existing sorted array
 * @param newItem - New item to insert
 * @param keyword - The search keyword
 * @returns New sorted array with item inserted
 */
export function insertSorted(items: SearchItem[], newItem: SearchItem, keyword?: string): SearchItem[] {
  const newScore = calculateSortScore(newItem, keyword)

  let insertIndex = 0
  for (let i = 0; i < items.length; i++) {
    const currentScore = calculateSortScore(items[i], keyword)
    if (newScore > currentScore) {
      insertIndex = i
      break
    }
    insertIndex = i + 1
  }

  const result = [...items]
  result.splice(insertIndex, 0, newItem)
  return result
}

/**
 * Add multiple items and sort the combined array
 * @param existingItems - Current array of items
 * @param newItems - New items to add
 * @param keyword - The search keyword
 * @returns Combined and sorted array
 */
export function addAndSort(existingItems: SearchItem[], newItems: SearchItem[], keyword?: string): SearchItem[] {
  const allItems = [...existingItems, ...newItems]
  return sortSearchResults(allItems, keyword)
}
