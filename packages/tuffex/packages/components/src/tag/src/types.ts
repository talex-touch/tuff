/**
 * Fill recipe of a tag.
 *
 * - `outline`: 12% fill, 32% hairline, full-strength coloured text. The
 *   original and still the default.
 * - `soft`: 20% fill, 34% hairline, text pulled 92% toward the tag colour and
 *   the rest toward ink — steadier to read at 11px on a coloured fill.
 * - `plain`: neutral chrome that ignores `color` entirely, for overflow
 *   counters (`+3`) and metadata that must not compete with real status.
 *
 * `background` / `border` still override whichever variant is chosen.
 *
 * @public
 */
export type TagVariant = 'outline' | 'soft' | 'plain'

/**
 * Props interface for the TxTag component.
 *
 * @public
 */
export interface TagProps {
  /**
   * The text label to display in the tag.
   * @default ''
   */
  label?: string | null

  /**
   * Icon class name to display before the label.
   * @default ''
   */
  icon?: string

  /**
   * The primary color of the tag.
   * Supports CSS color values and CSS variables.
   * @default 'var(--tx-color-primary)'
   */
  color?: string

  /**
   * Custom background color for the tag.
   * If not provided, a semi-transparent version of the color will be used.
   * @default ''
   */
  background?: string

  /**
   * Custom border color for the tag.
   * If not provided, a semi-transparent version of the color will be used.
   * @default ''
   */
  border?: string

  /**
   * The size of the tag.
   * - `sm`: Small size with compact padding
   * - `md`: Medium size with standard padding
   * @default 'sm'
   */
  size?: 'sm' | 'md'
  /**
   * Whether the tag uses a fully rounded pill shape.
   * @default false
   */
  pill?: boolean

  /**
   * @default 'outline'
   */
  variant?: TagVariant

  /**
   * Leading dot colour. Any CSS colour; omit to render no dot. Lets a tag carry
   * a category hue while its text stays legible.
   */
  dot?: string

  /**
   * Dot diameter in pixels.
   * @default 6
   */
  dotSize?: number

  /**
   * Trailing count badge. `0` renders; omit the prop to render nothing.
   */
  count?: number


  /**
   * Whether the tag can be closed/removed.
   * @default false
   */
  closable?: boolean

  /**
   * Accessible label for the close button, announced to screen readers.
   * Localize by passing e.g. '移除标签'.
   * @default 'Remove tag'
   */
  closeAriaLabel?: string

  /**
   * Whether to disable the tag interactions.
   * @default false
   */
  disabled?: boolean
}

/**
 * Emits interface for the TxTag component.
 *
 * @public
 */
export interface TagEmits {
  /**
   * Emitted when the close button is clicked.
   */
  (e: 'close'): void

  /**
   * Emitted when the tag is clicked.
   * @param event - The mouse event
   */
  (e: 'click', event: MouseEvent): void
}
