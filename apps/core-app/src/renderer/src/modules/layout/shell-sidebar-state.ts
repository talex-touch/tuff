/**
 * Pure width/collapse rules for the resizable shell sidebar.
 *
 * Kept separate from the composable so the thresholds can be tested without a Vue scope or a
 * storage bootstrap.
 */

/**
 * Narrowest the sidebar may render while expanded.
 *
 * Low enough that both shedding stages below are reachable: at 220 the chrome bar still fit
 * whole, so dragging narrower did nothing until it snapped to the rail. Raised from 180 after
 * on-device review: the nav labels were already clipping before the rail snap took over.
 */
export const SIDEBAR_EXPANDED_MIN = 195
/** Widest the sidebar may render while expanded. */
export const SIDEBAR_EXPANDED_MAX = 360
/** Width a fresh install starts at. */
export const SIDEBAR_EXPANDED_DEFAULT = 260
/**
 * Width of the collapsed rail where the shell owns the whole column.
 *
 * Sized for the label under each icon, not for the icon alone: the longest settings category is
 * five characters, and the rail reads cramped at the width that merely fits them.
 */
export const SIDEBAR_RAIL_WIDTH = 84
/**
 * Rail width on macOS, one step wider still.
 *
 * The native traffic lights are drawn at a fixed window position and run to roughly x=80, so
 * anything narrower lets the third button spill onto the main area — and the rail also has to
 * seat a label under each icon beside that reservation.
 */
export const SIDEBAR_RAIL_WIDTH_MAC = 104

/**
 * Drag thresholds. `EXPAND` sits above `COLLAPSE` on purpose: the gap between them is a dead
 * band where neither transition fires. Without it, collapsing at a width the expand rule would
 * immediately undo makes the sidebar flicker between the two states under a stationary pointer.
 */
export const SIDEBAR_COLLAPSE_THRESHOLD = 150
export const SIDEBAR_EXPAND_THRESHOLD = 172

/**
 * Widths at which the chrome bar sheds content, narrowest-last.
 *
 * The bar cannot shrink past the macOS traffic-light reservation, so instead of letting the
 * wordmark ellipsis down to a stray "T" it drops whole pieces: the wordmark first, then history
 * navigation. Both are affordances the collapse button and the keyboard already cover.
 */
export const SIDEBAR_BRAND_LABEL_MIN = 248
export const SIDEBAR_HISTORY_MIN = 206

export interface SidebarLayoutState {
  collapsed: boolean
  /** Width to persist for the expanded state. Unchanged while collapsed. */
  expandedWidth: number
}

/**
 * Clamps a width into the expanded range, falling back to the default for values that are not
 * finite numbers. Applied on read as well as on write: a hand-edited config file or a rollback
 * from a build with different bounds can both surface an out-of-range width.
 */
export function clampExpandedWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return SIDEBAR_EXPANDED_DEFAULT
  }

  return Math.min(SIDEBAR_EXPANDED_MAX, Math.max(SIDEBAR_EXPANDED_MIN, Math.round(value)))
}

/**
 * Maps a raw pointer-derived width onto the next sidebar state.
 *
 * @param rawWidth - Distance from the window's left edge to the pointer, unclamped.
 * @param current - State the sidebar is in right now.
 */
export function resolveDragState(
  rawWidth: number,
  current: SidebarLayoutState
): SidebarLayoutState {
  if (current.collapsed) {
    if (rawWidth < SIDEBAR_EXPAND_THRESHOLD) {
      return current
    }

    return { collapsed: false, expandedWidth: clampExpandedWidth(rawWidth) }
  }

  if (rawWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
    // The expanded width is deliberately carried over untouched, so re-expanding lands back on
    // the width the user last chose rather than on the default.
    return { collapsed: true, expandedWidth: current.expandedWidth }
  }

  return { collapsed: false, expandedWidth: clampExpandedWidth(rawWidth) }
}

/**
 * Width the sidebar actually renders at.
 *
 * @param railWidth - Collapsed width, which differs per platform because macOS draws its window
 * buttons inside the column.
 */
export function resolveRenderedWidth(
  state: SidebarLayoutState,
  railWidth: number = SIDEBAR_RAIL_WIDTH
): number {
  return state.collapsed ? railWidth : clampExpandedWidth(state.expandedWidth)
}
