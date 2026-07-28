import { getZIndex, refreshZIndex } from '@talex-touch/tuffex/utils'

/**
 * Tuffex's shared z-index manager seeds at 2000, but nexus paints its fixed
 * header at 10000 and the mobile drawer at 10050 (both hardcoded in CSS). An
 * overlay that has to cover the header must lift the manager's floor *before*
 * the component allocates, otherwise it lands underneath and the header bleeds
 * through the backdrop.
 */
export const NEXUS_OVERLAY_LAYER_SEED = 10100

/**
 * Raise the shared layer floor so the next allocation paints above the header.
 *
 * Call this immediately before opening an overlay. The overlay component still
 * performs the actual allocation via `nextZIndex()`; read the resulting number
 * back with {@link currentOverlayLayer} once the component has emitted `open`.
 */
export function reserveOverlayLayer(reason: string): void {
  refreshZIndex(NEXUS_OVERLAY_LAYER_SEED, reason)
}

/** The layer number handed out by the most recent allocation. */
export function currentOverlayLayer(): number {
  return getZIndex()
}
