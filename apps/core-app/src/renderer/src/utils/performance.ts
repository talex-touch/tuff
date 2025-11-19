/**
 * Performance optimization utilities
 */

/**
 * Debounce function - delays execution until after wait milliseconds have elapsed
 * since the last time it was invoked
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout !== null) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle function - ensures function is called at most once per specified time period
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false

  return function executedFunction(...args: Parameters<T>): void {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Request Animation Frame throttle - throttles to browser's animation frame rate
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  func: T,
): (...args: Parameters<T>) => void {
  let rafId: number | null = null

  return function executedFunction(...args: Parameters<T>): void {
    if (rafId !== null) {
      return
    }

    rafId = requestAnimationFrame(() => {
      func(...args)
      rafId = null
    })
  }
}

/**
 * Memoize function results with optional cache size limit
 */
export function memoize<T extends (...args: any[]) => any>(
  func: T,
  maxCacheSize: number = 100,
): T {
  const cache = new Map<string, ReturnType<T>>()
  const cacheOrder: string[] = []

  return function memoized(...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args)

    if (cache.has(key)) {
      return cache.get(key)!
    }

    const result = func(...args)
    cache.set(key, result)
    cacheOrder.push(key)

    // Limit cache size
    if (cacheOrder.length > maxCacheSize) {
      const oldestKey = cacheOrder.shift()!
      cache.delete(oldestKey)
    }

    return result
  } as T
}

/**
 * Batch multiple calls into a single execution
 */
export function batch<T>(
  func: (items: T[]) => void,
  wait: number = 100,
): (item: T) => void {
  let items: T[] = []
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function batchedFunction(item: T): void {
    items.push(item)

    if (timeout !== null) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      func(items)
      items = []
      timeout = null
    }, wait)
  }
}
