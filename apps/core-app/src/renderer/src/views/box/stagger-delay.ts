/**
 * Eased per-item delay for the list stagger animation (seconds).
 *
 * The ramp is capped: `newItemIds` clears 320ms after a batch lands and the entry animation is
 * 140ms, so any row delayed past 180ms had its animation cut off by `animation: none` while still
 * sitting at `translateY(10px)`, then snapped into place. Uncapped, row 79 waited ~4.3s.
 */
export const STAGGER_ITEM_ANIMATION_S = 0.14
export const STAGGER_MAX_TOTAL_DELAY_S = 0.18

export function getStaggerDelay(index: number, total: number): number {
  const baseDelay = 0.025 // 25ms base
  const maxDelay = 0.055 // 55ms max per item
  // Ease-in curve: delay increases as index grows
  const progress = total > 1 ? index / (total - 1) : 0
  const eased = progress * progress // quadratic ease-in
  const delay = baseDelay + eased * (maxDelay - baseDelay)
  return Math.min(index * delay, STAGGER_MAX_TOTAL_DELAY_S)
}
