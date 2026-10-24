import type { PreviewSize } from './zoom'

// The two menus of TxImagePreview, the actions' and the zoom readout's, are one ImagePreviewMenu:
// what goes in each, and where each goes.

/** How far a menu keeps from the edges of the preview (px). */
export const MENU_MARGIN = 8

export interface PreviewMenuItem {
  key: string
  label: string
  /** The icon's strokes, one path each. */
  icon: readonly string[]
  disabled?: boolean
  /** One choice among the items, which says whether it is the one made; absent on an action. */
  checked?: boolean
}

/**
 * Where a menu would sit, in its layer's pixels, and the point it grows out of. The menu turns it
 * back from the edges.
 */
export interface PreviewMenuPlace {
  left: number
  top: number
  x: number
  y: number
}

/** Places a menu of `size` in a layer of `room`; a new one places it afresh. */
export type PreviewMenuPlacer = (size: PreviewSize, room: DOMRect) => PreviewMenuPlace
