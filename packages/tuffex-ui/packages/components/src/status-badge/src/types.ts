/**
 * Status tone types for visual styling.
 *
 * @public
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

/**
 * Predefined status keys that map to status tones.
 *
 * @public
 */
export type StatusKey = 'granted' | 'denied' | 'notDetermined' | 'unsupported' | string

/**
 * Props interface for the TxStatusBadge component.
 *
 * @public
 */
export interface StatusBadgeProps {
  /**
   * The text content to display in the badge.
   */
  text: string

  /**
   * Custom icon class to display.
   * If not provided, a default icon based on the status tone will be used.
   * @default ''
   */
  icon?: string

  /**
   * The visual status tone of the badge.
   * Takes precedence over statusKey if both are provided.
   */
  status?: StatusTone

  /**
   * A predefined status key that maps to a status tone.
   * - `granted` → success
   * - `denied` → danger
   * - `notDetermined` → warning
   * - `unsupported` → muted
   * - other → info
   * @default ''
   */
  statusKey?: StatusKey

  /**
   * The size of the badge.
   * - `sm`: Small size with compact padding
   * - `md`: Medium size with standard padding
   * @default 'md'
   */
  size?: 'sm' | 'md'
}

/**
 * Emits interface for the TxStatusBadge component.
 *
 * @public
 */
export interface StatusBadgeEmits {
  /**
   * Emitted when the badge is clicked.
   * @param event - The mouse event
   */
  (e: 'click', event: MouseEvent): void
}

/**
 * Tone metadata containing color and icon information.
 *
 * @internal
 */
export interface ToneMeta {
  /**
   * CSS color value for the tone.
   */
  color: string

  /**
   * Default icon class for the tone.
   */
  icon: string
}
