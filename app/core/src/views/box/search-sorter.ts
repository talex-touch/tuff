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
 */
function calculateMatchScore(item: SearchItem, keyword?: string): number {
  if (!keyword) return 0

  const name = item.name.toLowerCase()
  const searchKey = keyword.toLowerCase()

  // Exact match (highest priority)
  if (name === searchKey) return 1000

  // Check if there's match information from search
  if (item.matched) {
    const [start, end] = item.matched
    const matchLength = end - start + 1
    const nameLength = name.length

    // Prefix match
    if (start === 0) return 800 + (matchLength / nameLength) * 100

    // Complete word match
    if (matchLength === searchKey.length) return 600 + (matchLength / nameLength) * 100

    // Partial match
    return 400 + (matchLength / nameLength) * 100
  }

  // Simple contains match
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
 */
export function calculateSortScore(item: SearchItem, keyword?: string): number {
  const matchScore = calculateMatchScore(item, keyword)
  const weight = getWeight(item)
  const amo = item.amo || 0

  return matchScore * 100000 + weight * 1000 + amo
}

/**
 * Sort search results by comprehensive score
 */
export function sortSearchResults(items: SearchItem[], keyword?: string): SearchItem[] {
  return items.sort((a, b) => {
    const scoreA = calculateSortScore(a, keyword)
    const scoreB = calculateSortScore(b, keyword)
    return scoreB - scoreA // Descending order, higher scores first
  })
}

/**
 * Insert new item into sorted array while maintaining sort order
 * Used for real-time search result updates
 */
export function insertSorted(items: SearchItem[], newItem: SearchItem, keyword?: string): SearchItem[] {
  const newScore = calculateSortScore(newItem, keyword)

  // Find insertion position
  let insertIndex = 0
  for (let i = 0; i < items.length; i++) {
    const currentScore = calculateSortScore(items[i], keyword)
    if (newScore > currentScore) {
      insertIndex = i
      break
    }
    insertIndex = i + 1
  }

  // Insert new item
  const result = [...items]
  result.splice(insertIndex, 0, newItem)
  return result
}

/**
 * Add multiple items and sort the combined array
 */
export function addAndSort(existingItems: SearchItem[], newItems: SearchItem[], keyword?: string): SearchItem[] {
  const allItems = [...existingItems, ...newItems]
  return sortSearchResults(allItems, keyword)
}
