import type { StatusTone } from '../../status-badge/src/types'

/**
 * Props for {@link TxModeChip}.
 *
 * @public
 */
export interface ModeChipProps {
  /**
   * Visible text, and the button's accessible name. A change blur-crossfades
   * through `TxTextTransformer`, a beat behind the icon.
   */
  label: string

  /**
   * Leading icon class, as `TxButton` and `TxStatusBadge` take it. A change
   * swaps the glyph with a scale inside a fixed-size box, so it never moves
   * the label.
   *
   * @default ''
   */
  icon?: string

  /**
   * `muted` is an unfilled chip in regular ink whose hover darkens the ink.
   * Every other tone is its hue's `-light-9` tint under an ink of the same hue,
   * mixed toward the primary text colour until it clears 4.5:1 in every theme;
   * its hover deepens the tint. `info` reads the primary hue, as it does in
   * `TxStatusBadge`.
   *
   * Fill and ink animate only while `label`, `icon` or `tone` is changing;
   * hover switches colour at once.
   *
   * @default 'muted'
   */
  tone?: StatusTone

  /** @default false */
  disabled?: boolean
}
