import type {
  MetaPanelAnchor,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'

/**
 * The ⌘K action panel's geometry, shared by the renderer that lays it out and the main process
 * that sizes the CoreBox window around it.
 *
 * The renderer measures nothing: it counts the panel's rows and multiplies by these numbers, and
 * main grows the window with the same numbers. A panel that asks for N pixels therefore gets a
 * window it fits in, and the CSS that draws the panel reads the same values as custom properties,
 * so the estimate and the layout cannot drift apart.
 */

/** Panel width. */
export const META_PANEL_WIDTH = 340
/** Tallest the panel grows before its list scrolls. */
export const META_PANEL_MAX_HEIGHT = 420
/** Gap between the panel and the window's right edge, and its bottom edge in the corner anchor. */
export const META_PANEL_EDGE_GAP = 12
/** CoreBox's search header (`COREBOX_HEADER_HEIGHT`); the panel never covers it. */
export const META_PANEL_HEADER_RESERVE = 56
/** Gap between the search header and the panel's top edge. */
export const META_PANEL_TOP_GAP = 8
/** CoreBox footer height (`h-44px` in `CoreBoxFooter.vue`). */
export const META_PANEL_FOOTER_HEIGHT = 44
/** Gap between the footer and the panel in the footer anchor. */
export const META_PANEL_FOOTER_GAP = 8
/** Window height main never grows past. */
export const META_OVERLAY_MAX_WINDOW_HEIGHT = 600

/** The panel's own rows. Each includes its 1px border, the list excepted. */
export const META_PANEL_ITEM_HEADER_HEIGHT = 40
export const META_PANEL_FILTER_HEIGHT = 40
export const META_PANEL_LIST_PADDING = 6
export const META_PANEL_ROW_HEIGHT = 32
export const META_PANEL_SECTION_TITLE_HEIGHT = 24
export const META_PANEL_SECTION_GAP = 4

/**
 * Height of the Flow page's confirmation view: header 40, padding 12, title 20 (13px on a 20px
 * line), gap 4, up to four description lines of 12px at 1.5 (72), gap 12 (the column's 4 and the
 * actions' 8), two rows of TxButton `sm` (26 each, 8 apart) and padding 12, so 232. The second
 * button row is English's: its three labels wrap at this width, and its card measured 232px in the
 * real window, the Chinese one, on one row, 162px. A longer description scrolls inside the card.
 */
export const META_FLOW_CONFIRM_PANEL_HEIGHT =
  META_PANEL_ITEM_HEADER_HEIGHT + 12 + 20 + 4 + 4 * 18 + 12 + (26 + 8 + 26) + 12

/** Top edge of the area the panel may occupy. */
export const META_PANEL_TOP_INSET = META_PANEL_HEADER_RESERVE + META_PANEL_TOP_GAP

/** Distance between the panel's bottom edge and the window's bottom edge. */
export function resolveMetaPanelBottomInset(anchor: MetaPanelAnchor | undefined): number {
  return anchor === 'footer'
    ? META_PANEL_FOOTER_HEIGHT + META_PANEL_FOOTER_GAP
    : META_PANEL_EDGE_GAP
}

/**
 * The custom properties the panel's CSS lays out with, for the root element that hosts it: the
 * numbers in this file, so the drawn panel is the one the window was sized for.
 */
export function resolveMetaPanelCssVars(
  anchor: MetaPanelAnchor | undefined
): Record<string, string> {
  return {
    '--meta-panel-width': `${META_PANEL_WIDTH}px`,
    '--meta-panel-max-height': `${META_PANEL_MAX_HEIGHT}px`,
    '--meta-panel-right': `${META_PANEL_EDGE_GAP}px`,
    '--meta-panel-top': `${META_PANEL_TOP_INSET}px`,
    '--meta-panel-bottom': `${resolveMetaPanelBottomInset(anchor)}px`,
    '--meta-header-height': `${META_PANEL_ITEM_HEADER_HEIGHT}px`,
    '--meta-filter-height': `${META_PANEL_FILTER_HEIGHT}px`,
    '--meta-list-padding': `${META_PANEL_LIST_PADDING}px`,
    '--meta-row-height': `${META_PANEL_ROW_HEIGHT}px`,
    '--meta-section-title-height': `${META_PANEL_SECTION_TITLE_HEIGHT}px`,
    '--meta-section-gap': `${META_PANEL_SECTION_GAP}px`
  }
}

export interface MetaPanelShape {
  /** Rows in the list, including the primary row. */
  rows: number
  /** Sections in the list, titled or not. */
  sections: number
  /** Sections that draw a title row. */
  titledSections: number
}

/** Natural height of a panel with this shape, capped at `META_PANEL_MAX_HEIGHT`. */
export function estimateMetaPanelHeight(shape: MetaPanelShape): number {
  const rows = Math.max(0, Math.floor(shape.rows))
  const sections = Math.max(0, Math.floor(shape.sections))
  const titled = Math.min(sections, Math.max(0, Math.floor(shape.titledSections)))
  const list =
    META_PANEL_LIST_PADDING * 2 +
    Math.max(rows, 1) * META_PANEL_ROW_HEIGHT +
    titled * META_PANEL_SECTION_TITLE_HEIGHT +
    Math.max(0, sections - 1) * META_PANEL_SECTION_GAP
  return Math.min(
    META_PANEL_MAX_HEIGHT,
    META_PANEL_ITEM_HEADER_HEIGHT + list + META_PANEL_FILTER_HEIGHT
  )
}

/**
 * Adds the plugin section main appends after the renderer has estimated its own rows: the
 * renderer that builds the request does not know which global plugin actions are registered.
 */
export function extendMetaPanelHeightForPluginRows(height: number, pluginRows: number): number {
  const rows = Math.max(0, Math.floor(pluginRows))
  if (rows === 0) return height
  return Math.min(
    META_PANEL_MAX_HEIGHT,
    height + META_PANEL_SECTION_GAP + META_PANEL_SECTION_TITLE_HEIGHT + rows * META_PANEL_ROW_HEIGHT
  )
}

/**
 * Window height the requested panel needs: the search header, the panel and its anchor inset,
 * capped at `META_OVERLAY_MAX_WINDOW_HEIGHT`. `null` when the request carries no usable height,
 * in which case the window is left alone.
 */
export function resolveMetaOverlayWindowHeight(
  request: Pick<MetaShowRequest, 'anchor' | 'desiredPanelHeight'>
): number | null {
  const panelHeight = request.desiredPanelHeight
  if (typeof panelHeight !== 'number' || !Number.isFinite(panelHeight) || panelHeight <= 0) {
    return null
  }

  const required =
    META_PANEL_TOP_INSET +
    Math.min(panelHeight, META_PANEL_MAX_HEIGHT) +
    resolveMetaPanelBottomInset(request.anchor)
  return Math.min(META_OVERLAY_MAX_WINDOW_HEIGHT, Math.ceil(required))
}
