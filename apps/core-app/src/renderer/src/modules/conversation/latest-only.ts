/**
 * Sequences overlapping async work so only the newest claim may apply its result.
 *
 * The route watcher awaits `history.load(target)` and then assigns unconditionally. Two overlapping
 * navigations are not sequenced by anything else, so a slower earlier load landed after a faster
 * later one — the URL named one thread while the view showed another (#826).
 *
 * Extracted rather than left as two inline lines because the watcher lives in a large SFC with no
 * mounting harness, and an invariant nobody can exercise is one that quietly stops holding.
 */
export interface LatestOnly {
  /**
   * Claims the newest slot and returns a predicate for whether this claim is still the newest.
   * Call it *before* the first await, so a claim made later invalidates this one.
   */
  claim: () => () => boolean
}

export function createLatestOnly(): LatestOnly {
  let current = 0

  return {
    claim() {
      const token = ++current
      return () => token === current
    }
  }
}
