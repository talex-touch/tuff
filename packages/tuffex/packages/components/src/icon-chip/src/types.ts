// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type IconChipTone = 'neutral' | 'ink' | 'accent' | 'green' | 'orange' | 'red'

export type IconChipVariant = 'solid' | 'soft'

export type IconChipShape = 'square' | 'circle'

export interface IconChipProps {
  /**
   * Edge length in px. Upstream uses 14 (file-type badge), 18 (sparkle chip)
   * and 32 (workspace avatar).
   * @default 14
   */
  size?: number
  /**
   * Corner radius. Numbers are px. Defaults to `size / 4` rounded, which is
   * exactly the upstream ladder (14→4, 18→5, 32→8). Ignored when
   * `shape` is `circle`.
   */
  radius?: number | string
  /** @default 'neutral' */
  tone?: IconChipTone
  /**
   * `solid` fills with the tone; `soft` uses its tint with the tone as ink and
   * a 30% hairline ring.
   * @default 'solid'
   */
  variant?: IconChipVariant
  /** @default 'square' */
  shape?: IconChipShape
  /** Short label such as `PDF`. The default slot wins when both are given. */
  label?: string
  /** Overrides the derived font size (`max(7, size * 0.4)` rounded). */
  fontSize?: number
  /**
   * Naming this exposes the chip as `role="img"`. Left unset, the chip is
   * `aria-hidden` — it almost always duplicates adjacent text (a `PDF` badge
   * beside `report.pdf`).
   */
  ariaLabel?: string
}
