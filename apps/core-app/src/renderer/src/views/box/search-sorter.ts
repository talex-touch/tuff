// Import type definitions
import type { SearchItem } from './search-box'

/**
 * Search Result Sorting System
 *
 * Provides comprehensive sorting functionality for search results,
 * combining match relevance, type weights, and usage frequency.
 *
 * Scoring System:
 * - Match Score (0-1000): How well the item matches the search keyword
 * - Type Weight (0-10): Predefined weights for different item types
 * - Usage Frequency (0+): How often the item has been used
 *
 * Final Score Calculation:
 * Score = Match Score × 100000 + Weight × 1000 + Usage Frequency
 * This ensures match relevance has highest priority, then type weight, then usage frequency
 */

/**
 * Default type weights for different item types
 * Higher weights mean higher priority in search results
 *
 * Weight values:
 * - app: 10 (highest priority)
 * - feature/cmd: 5 (medium-high priority)
 * - plugin: 3 (medium priority)
 * - file: 2 (low-medium priority)
 * - text: 1 (lowest priority)
 */
const DEFAULT_WEIGHTS: Record<string, number> = {
  /** Application items have highest priority */
  app: 10,
  /** Feature items have medium-high priority */
  feature: 5,
  /** Command items have medium-high priority */
  cmd: 5,
  /** Plugin items have medium priority */
  plugin: 3,
  /** File items have low-medium priority */
  file: 2,
  /** Text items have lowest priority */
  text: 1
}

/**
 * Get weight for an item type based on its category
 * Implements dynamic weighting for frequently used features
 *
 * Dynamic weighting rules:
 * - Features with usage frequency > 10 get boosted to highest priority (10)
 * - Default weights based on item type from DEFAULT_WEIGHTS
 *
 * @param item - The search item to evaluate
 * @returns Weight value (0-10)
 */
function getWeight(item: SearchItem): number {
  // Dynamic rule: feature with high usage frequency gets boosted weight
  if ((item.pluginType === 'feature' || item.type === 'feature') && (item.amo || 0) > 10) {
    return 10
  }

  // Default weight based on item type
  const type = item.pluginType || item.type || 'unknown'
  return DEFAULT_WEIGHTS[type] || 0
}

/**
 * Calculate match score based on how well the item matches the search keyword
 * Uses a tiered scoring system with different priorities
 *
 * Scoring tiers:
 * - Exact match: 1000 points
 * - Prefix match: 800-900 points (based on match length)
 * - Full keyword match: 600-700 points (based on match length)
 * - Partial match: 400-500 points (based on match length)
 * - Starts with keyword: 500 points
 * - Contains keyword: 300 points
 * - No match: 0 points
 *
 * @param item - The search item to score
 * @param keyword - The search keyword
 * @returns Match score (higher is better, 0-1000)
 */
function calculateMatchScore(item: SearchItem, keyword?: string): number {
  // No keyword means no match score
  if (!keyword) return 0

  // Convert to lowercase for case-insensitive comparison
  const name = item.name.toLowerCase()
  const searchKey = keyword.toLowerCase()

  // Exact match gets highest score
  if (name === searchKey) return 1000

  // If item has pre-calculated match positions
  if (item.matched) {
    const [start, end] = item.matched
    const matchLength = end - start + 1
    const nameLength = name.length

    // Prefix match (starts at beginning of name)
    if (start === 0) return 800 + (matchLength / nameLength) * 100

    // Full keyword match (match length equals search keyword length)
    if (matchLength === searchKey.length) return 600 + (matchLength / nameLength) * 100

    // Partial match (anywhere in the name)
    return 400 + (matchLength / nameLength) * 100
  }

  // Simple string inclusion checks
  if (name.includes(searchKey)) {
    // Starts with keyword
    if (name.startsWith(searchKey)) return 500
    // Contains keyword
    return 300
  }

  // No match found
  return 0
}

/**
 * Calculate comprehensive sorting score for an item
 * Combines match score, type weight, and usage frequency into a single score
 *
 * Formula: Score = Match Score × 100000 + Weight × 1000 + Usage Frequency
 * This ensures match relevance has highest priority, then type weight, then usage frequency
 *
 * @param item - The search item to score
 * @param keyword - The search keyword
 * @returns Comprehensive sort score (higher is better)
 */
export function calculateSortScore(item: SearchItem, keyword?: string): number {
  // Calculate individual components
  const matchScore = calculateMatchScore(item, keyword)
  const weight = getWeight(item)
  const amo = item.amo || 0

  // Combine into final score
  return matchScore * 100000 + weight * 1000 + amo
}

/**
 * Sort search results by comprehensive score in descending order
 * Highest scoring items appear first
 *
 * @param items - Array of search items to sort
 * @param keyword - The search keyword
 * @returns Sorted array (highest scores first)
 */
export function sortSearchResults(items: SearchItem[], keyword?: string): SearchItem[] {
  return items.sort((a, b) => {
    // Calculate scores for both items
    const scoreA = calculateSortScore(a, keyword)
    const scoreB = calculateSortScore(b, keyword)
    // Sort in descending order (highest score first)
    return scoreB - scoreA
  })
}

/**
 * Creates a unique key for deduplication based on item properties
 * Combines multiple item properties to create a unique identifier
 *
 * @param item - The search item
 * @returns Unique key string
 */
function createItemKey(item: SearchItem): string {
  // Use core properties to create a base key
  const baseKey = `${item.name}-${item.desc || ''}-${item.value || ''}-${item.pluginType || ''}-${item.type || ''}`;

  // Add additional unique identifiers if available
  const additionalKeys: string[] = [];
  if (item.id) additionalKeys.push(item.id);
  if (item.action) additionalKeys.push(item.action);
  if (item.featureId) additionalKeys.push(item.featureId);
  if (item.pushedItemId) additionalKeys.push(item.pushedItemId);

  // Combine base key with additional identifiers
  const finalKey = additionalKeys.length > 0 ? `${baseKey}-${additionalKeys.join('-')}` : baseKey;
  // Removed debug log for production
  return finalKey;
}

/**
 * Insert new item into sorted array while maintaining sort order and preventing duplicates
 * Used for real-time search result updates
 *
 * @param items - Existing sorted array
 * @param newItem - New item to insert
 * @param keyword - The search keyword
 * @returns New sorted array with item inserted (if not duplicate)
 */
export function insertSorted(items: SearchItem[], newItem: SearchItem, keyword?: string): SearchItem[] {
  // Check for duplicates first
  const newItemKey = createItemKey(newItem);
  const isDuplicate = items.some(item => createItemKey(item) === newItemKey);

  // Skip insertion if duplicate found
  if (isDuplicate) {
    return items; // Return original array if duplicate found
  }

  // Calculate score for new item
  const newScore = calculateSortScore(newItem, keyword)

  // Find correct insertion position to maintain sort order
  let insertIndex = 0
  for (let i = 0; i < items.length; i++) {
    const currentScore = calculateSortScore(items[i], keyword)
    // Insert before first item with lower score
    if (newScore > currentScore) {
      insertIndex = i
      break
    }
    // If we reach the end, insert at the end
    insertIndex = i + 1
  }

  // Create new array with item inserted at correct position
  const result = [...items]
  result.splice(insertIndex, 0, newItem)
  return result
}

/**
 * Add multiple items and sort the combined array
 * Combines existing and new items, then sorts by comprehensive score
 *
 * @param existingItems - Current array of items
 * @param newItems - New items to add
 * @param keyword - The search keyword
 * @returns Combined and sorted array
 */
export function addAndSort(existingItems: SearchItem[], newItems: SearchItem[], keyword?: string): SearchItem[] {
  // Combine arrays
  const allItems = [...existingItems, ...newItems]
  // Sort combined array
  return sortSearchResults(allItems, keyword)
}
