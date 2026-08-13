export type SkeletonVariant = 'text' | 'rect' | 'circle'

export interface SkeletonProps {
  loading?: boolean
  variant?: SkeletonVariant
  width?: string | number
  height?: string | number
  radius?: string | number
  lines?: number
  gap?: string | number
}

/**
 * Placeholder for a list of settings-style rows: an optional leading icon, a
 * title with an optional description under it, and an optional trailing control.
 *
 * The widths are props rather than fixed values because a skeleton whose bars do
 * not track the real layout still shifts the page when the content lands, which
 * is the one thing a skeleton exists to prevent.
 */
export interface RowSkeletonProps {
  /** How many rows to draw. */
  rows?: number
  /** Reserve space for a leading icon. */
  leading?: boolean
  /** Draw a second, narrower bar under the title. */
  description?: boolean
  /** Reserve space for a trailing control (switch, button, chip). */
  trailing?: boolean
  /**
   * Draw a hairline between rows. It is a real box rather than an overlay so it
   * takes up the same pixel the loaded list's own separator will.
   */
  separated?: boolean
  /** Base width of the title bar; varied per row so the block does not read as a table. */
  titleWidth?: string | number
  /** Width of the description bar. */
  descWidth?: string | number
}
