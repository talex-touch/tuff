import type { ConversationStreamKey } from './types'

export interface PositionCache {
  /**
   * Replaces the ordered key list; measured heights survive by key, but only
   * for keys still present (plus `retain`). Pruning here is what keeps a
   * reused instance honest when the host swaps datasets: ids that repeat
   * across datasets ("user-1" in every thread) must not inherit another
   * dataset's measurements. `retain` shields the live row, which is measured
   * before its key ever appears in this list.
   */
  syncKeys: (keys: ConversationStreamKey[], retain?: ConversationStreamKey | null) => void
  /**
   * Records a measured height and returns the delta against what the layout
   * previously assumed — the caller compensates scrollTop with it when the
   * item sits above the viewport.
   */
  setHeight: (key: ConversationStreamKey, height: number) => number
  heightOf: (key: ConversationStreamKey) => number
  /** Top offset of the item at `index`; `offsetOf(length)` is the total height. */
  offsetOf: (index: number) => number
  totalHeight: () => number
  /** Sum of the first `count` item heights — the prepend anchoring delta. */
  prefixHeight: (count: number) => number
  /** Half-open `[start, end)` index range covering the viewport plus overscan. */
  visibleRange: (scrollTop: number, viewportHeight: number, overscan: number) => {
    start: number
    end: number
  }
}

/**
 * Height bookkeeping for a dynamic-height virtual window. Heights live in a
 * key-indexed map so a prepend — which shifts every index — never invalidates
 * a measurement; offsets are a lazily rebuilt prefix-sum over the current
 * key order.
 */
export function createPositionCache(estimatedItemHeight: number): PositionCache {
  const heights = new Map<ConversationStreamKey, number>()
  let keys: ConversationStreamKey[] = []
  let offsets: number[] = [0]
  let dirty = false

  function heightOf(key: ConversationStreamKey): number {
    return heights.get(key) ?? estimatedItemHeight
  }

  function rebuild(): void {
    if (!dirty)
      return
    offsets = Array.from({ length: keys.length + 1 }, () => 0)
    for (let index = 0; index < keys.length; index++)
      offsets[index + 1] = offsets[index]! + heightOf(keys[index]!)
    dirty = false
  }

  function syncKeys(next: ConversationStreamKey[], retain?: ConversationStreamKey | null): void {
    keys = next.slice()
    if (heights.size > 0) {
      const alive = new Set<ConversationStreamKey>(keys)
      if (retain != null)
        alive.add(retain)
      for (const key of heights.keys()) {
        if (!alive.has(key))
          heights.delete(key)
      }
    }
    dirty = true
  }

  function setHeight(key: ConversationStreamKey, height: number): number {
    const previous = heightOf(key)
    if (previous === height)
      return 0
    heights.set(key, height)
    dirty = true
    return height - previous
  }

  function offsetOf(index: number): number {
    rebuild()
    const clamped = Math.max(0, Math.min(index, keys.length))
    return offsets[clamped] ?? 0
  }

  function totalHeight(): number {
    return offsetOf(keys.length)
  }

  function prefixHeight(count: number): number {
    return offsetOf(count)
  }

  /** Largest index whose offset is <= target (lower bound over the prefix sums). */
  function indexAt(target: number): number {
    rebuild()
    let low = 0
    let high = keys.length
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if ((offsets[mid] ?? 0) <= target)
        low = mid
      else
        high = mid - 1
    }
    return Math.min(low, Math.max(0, keys.length - 1))
  }

  function visibleRange(scrollTop: number, viewportHeight: number, overscan: number) {
    if (keys.length === 0)
      return { start: 0, end: 0 }

    rebuild()
    const top = Math.max(0, Math.min(scrollTop, totalHeight()))
    const start = Math.max(0, indexAt(top) - overscan)

    let end = indexAt(Math.max(0, top + Math.max(0, viewportHeight)))
    // `indexAt` returns the item containing the bottom edge — include it.
    end = Math.min(keys.length, end + 1 + overscan)

    return { start, end }
  }

  return { syncKeys, setHeight, heightOf, offsetOf, totalHeight, prefixHeight, visibleRange }
}
