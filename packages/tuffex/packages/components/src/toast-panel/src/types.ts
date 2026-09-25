/**
 * Types for TxToastPanel — an item surfacing beneath the surface it came from.
 *
 * @public
 */

/**
 * Where the panel sits relative to the thing it belongs to.
 *
 * Only the tether's direction changes: the panel itself is positioned by the
 * host, because only the host knows what it is hanging off.
 *
 * @public
 */
export type ToastPanelSide = 'below' | 'above'

/**
 * Props for the TxToastPanel component.
 *
 * @public
 */
export interface ToastPanelProps {
  /**
   * Whether the panel is showing.
   *
   * A prop rather than `v-if` on the host's side: destroying the root would
   * cut the leave transition and the panel would vanish instead of settling
   * back.
   *
   * @default true
   */
  open?: boolean

  /**
   * Draw the dashed tether linking the panel to its origin.
   *
   * The tether is what makes this read as "this came from *that*" rather than
   * as a free-floating toast — it is the whole difference from `TxToastHost`.
   *
   * @default true
   */
  tether?: boolean

  /**
   * Tether length in px.
   * @default 28
   */
  tetherLength?: number

  /**
   * @default 'below'
   */
  side?: ToastPanelSide

  /**
   * How many cards peek out behind the front one, suggesting more queued
   * behind it. `0` renders a single card.
   *
   * Capped at 2: a third sliver is under a pixel of visible edge at the
   * default offsets and only muddies the shadow.
   *
   * @default 1
   */
  stack?: number

  /**
   * Accessible name for the panel region. The panel appears without a user
   * action, so it is announced.
   * @default 'Latest item'
   */
  ariaLabel?: string

  /**
   * Announce arrivals politely, or not at all when the host already announces
   * the change elsewhere.
   * @default 'polite'
   */
  live?: 'polite' | 'off'
}
