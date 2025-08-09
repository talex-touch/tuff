import { TuffItem, TuffQuery } from '@talex-touch/utils'
import { ISortMiddleware, SortStat } from '../types'

/**
 * The result of a sort operation, including the sorted items and performance statistics.
 */
export interface SortResult {
  sortedItems: TuffItem[]
  stats: SortStat[]
}

/**
 * Manages and executes a pipeline of sort middleware.
 */
export class Sorter {
  private middlewares: ISortMiddleware[] = []

  /**
   * Registers a sort middleware.
   * @param middleware - The middleware to register.
   */
  register(middleware: ISortMiddleware): void {
    this.middlewares.push(middleware)
  }

  /**
   * Sorts an array of TuffItems by executing the registered middleware in sequence.
   *
   * @param items - The array of TuffItems to sort.
   * @param query - The search query, passed to each middleware for context.
   * @param signal - An AbortSignal to cancel the sorting process.
   * @returns A SortResult object containing the sorted items and performance stats.
   */
  sort(items: TuffItem[], query: TuffQuery, signal: AbortSignal): SortResult {
    const stats: SortStat[] = []
    let processedItems = [...items] // Start with a copy of the original items

    for (const middleware of this.middlewares) {
      if (signal.aborted) {
        console.log(`[Sorter] Sorting aborted by signal during middleware: ${middleware.name}`);
        break; // Exit the loop if sorting is aborted
      }
      const startTime = performance.now()
      processedItems = middleware.sort(processedItems, query, signal)
      const endTime = performance.now()

      stats.push({
        name: middleware.name,
        duration: endTime - startTime
      })
    }

    return {
      sortedItems: processedItems,
      stats
    }
  }
}
