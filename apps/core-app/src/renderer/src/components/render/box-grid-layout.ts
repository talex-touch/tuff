import type { TuffSection } from '@talex-touch/utils'

export const CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT = 5

export function resolveBoxGridColumnCount(
  section: TuffSection | undefined,
  itemCount: number,
  fallbackColumns: number
): number {
  const normalizedFallback = Math.max(1, Math.floor(fallbackColumns))

  // A list section is one item per row, and this count is not only a CSS value: `useKeyboard`
  // builds its section geometry from it, so a list reported as N columns makes ArrowDown jump N
  // items at once — past the end of a short section, which reads as "the arrows do nothing".
  if (section?.layout === 'list') {
    return 1
  }

  if (section?.meta?.intelligence !== true) {
    return normalizedFallback
  }

  return Math.max(1, Math.min(itemCount, CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT))
}

/**
 * The narrowest tile that still reads: six or seven letters of title and a badge like "新安装"
 * without spilling into the neighbour. Below this the grid wraps instead of shrinking the tiles.
 */
export const CORE_BOX_GRID_TILE_MIN_WIDTH = 84
/**
 * An icon-only tile: the icon keeps its 36px box (it is scaled down visually, not resized), with
 * 6px padding and a 1px border each side, plus a little air.
 */
export const CORE_BOX_GRID_COMPACT_TILE_MIN_WIDTH = 52

/**
 * How many tiles of at least `tileMinWidth` fit side by side in `contentWidth`, capped at
 * `maxColumns`. An unmeasured width (zero or less, as before the first layout or in jsdom) is no
 * information, so the cap stands and the grid behaves as if the row were wide enough.
 */
export function resolveBoxGridFitColumns(
  contentWidth: number,
  gap: number,
  tileMinWidth: number,
  maxColumns: number
): number {
  const cap = Math.max(1, Math.floor(maxColumns))
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return cap
  const safeGap = Math.max(0, gap)
  const pitch = Math.max(1, tileMinWidth + safeGap)
  return Math.max(1, Math.min(cap, Math.floor((contentWidth + safeGap) / pitch)))
}

/**
 * The column count a section actually renders with: its own rule, capped at what fits. BoxGrid
 * writes this into `--grid-cols` and `useKeyboard` builds its section geometry from the same
 * number, so a grid that wrapped onto a second row keeps ArrowDown moving one visual row.
 */
export function resolveVisibleBoxGridColumnCount(
  section: TuffSection | undefined,
  itemCount: number,
  visibleColumns: number
): number {
  const cap = Math.max(1, Math.floor(visibleColumns))
  return Math.max(1, Math.min(resolveBoxGridColumnCount(section, itemCount, cap), cap))
}
