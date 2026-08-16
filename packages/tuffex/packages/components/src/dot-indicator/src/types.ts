// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/**
 * Props for {@link TxDotIndicator} — a bare coloured dot with an optional text
 * label, used in table cells for status, strength, and summary readouts.
 *
 * This is deliberately not {@link TxStatusBadge}: that component is a bordered
 * pill locked to five semantic tones plus an icon, while this one is a naked
 * dot that accepts any colour and pairs with plain text.
 *
 * @public
 */
export interface DotIndicatorProps {
  /**
   * Dot colour. Any CSS colour or custom property.
   * @default 'currentColor'
   */
  color?: string

  /**
   * Text rendered beside the dot. Colour is never the only carrier of meaning,
   * so provide either this or `ariaLabel`.
   */
  label?: string

  /**
   * Dot diameter in pixels.
   * @default 8
   */
  size?: number

  /**
   * Accessible name used when there is no visible label. Without a label and
   * without this, the indicator is treated as decorative and hidden from
   * assistive technology.
   */
  ariaLabel?: string
}
