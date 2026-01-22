/**
 * Performance optimization utilities
 */

/**
 * Debounce function - delays execution until after wait milliseconds have elapsed
 * since the last time it was invoked
 */
export function debounce<Args extends unknown[], TThis = unknown>(
  func: (this: TThis, ...args: Args) => void,
  wait: number
): (this: TThis, ...args: Args) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function executedFunction(this: TThis, ...args: Args) {
    const later = () => {
      timeout = null
      func.apply(this, args)
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
export function throttle<Args extends unknown[], TThis = unknown>(
  func: (this: TThis, ...args: Args) => void,
  limit: number
): (this: TThis, ...args: Args) => void {
  let inThrottle: boolean = false

  return function executedFunction(this: TThis, ...args: Args): void {
    if (!inThrottle) {
      func.apply(this, args)
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
export function rafThrottle<Args extends unknown[], TThis = unknown>(
  func: (this: TThis, ...args: Args) => void
): (this: TThis, ...args: Args) => void {
  let rafId: number | null = null

  return function executedFunction(this: TThis, ...args: Args): void {
    if (rafId !== null) {
      return
    }

    rafId = requestAnimationFrame(() => {
      func.apply(this, args)
      rafId = null
    })
  }
}

/**
 * Memoize function results with optional cache size limit
 */
export function memoize<Args extends unknown[], R, TThis = unknown>(
  func: (this: TThis, ...args: Args) => R,
  maxCacheSize: number = 100
): (this: TThis, ...args: Args) => R {
  const cache = new Map<string, R>()
  const cacheOrder: string[] = []

  return function memoized(this: TThis, ...args: Args): R {
    const key = JSON.stringify(args)

    if (cache.has(key)) {
      return cache.get(key)!
    }

    const result = func.apply(this, args)
    cache.set(key, result)
    cacheOrder.push(key)

    // Limit cache size
    if (cacheOrder.length > maxCacheSize) {
      const oldestKey = cacheOrder.shift()!
      cache.delete(oldestKey)
    }

    return result
  }
}

/**
 * Batch multiple calls into a single execution
 */
export function batch<T>(func: (items: T[]) => void, wait: number = 100): (item: T) => void {
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
