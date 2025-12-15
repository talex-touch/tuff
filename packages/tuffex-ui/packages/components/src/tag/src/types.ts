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
   * @default 'var(--el-color-primary)'
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
   * Whether the tag can be closed/removed.
   * @default false
   */
  closable?: boolean

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
