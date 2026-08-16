// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/**
 * Underline strategy for {@link TxCellLink}.
 *
 * - `hover`: the underline appears on hover/focus only (record-name columns).
 * - `always`: a permanently visible, tinted underline (dedicated link columns).
 *
 * @public
 */
export type CellLinkUnderline = 'always' | 'hover'

/**
 * Props for {@link TxCellLink} — a table-cell link.
 *
 * @public
 */
export interface CellLinkProps {
  /** Target URL. Rendered into `href` so copy-link and hover preview work. */
  href: string

  /** Visible text. Falls back to `href` and can be replaced by the default slot. */
  label?: string

  /**
   * Appends the outbound arrow glyph.
   * @default false
   */
  external?: boolean

  /**
   * Renders in the secondary ink instead of the link accent.
   * @default false
   */
  muted?: boolean

  /**
   * @default 'hover'
   */
  underline?: CellLinkUnderline

  /** Accessible name override when the visible text is not descriptive. */
  ariaLabel?: string
}

/**
 * Emits for {@link TxCellLink}.
 *
 * @public
 */
export interface CellLinkEmits {
  /**
   * Activation request. The component calls `preventDefault()` and never
   * navigates on its own — the host decides whether to open a tab, an in-app
   * route, or an external shell. Same contract as `TxSources`, and a hard
   * requirement inside the Electron renderer.
   */
  (e: 'open', payload: { href: string, event: MouseEvent }): void
}
