/**
 * Props interface for the TxProgressBar component.
 *
 * @public
 */
export interface ProgressBarProps {
  /**
   * Whether to show the loading animation.
   * @default false
   */
  loading?: boolean

  /**
   * Whether to show the error state.
   * @default false
   */
  error?: boolean

  /**
   * Whether to show the success state.
   * @default false
   */
  success?: boolean

  /**
   * Message text to display inside the progress bar.
   * @default ''
   */
  message?: string

  /**
   * The progress percentage value (0-100).
   * Only used when not in loading mode.
   */
  percentage?: number

  /**
   * The height of the progress bar.
   * @default '5px'
   */
  height?: string

  /**
   * Whether to show the percentage text.
   * @default false
   */
  showText?: boolean

  /**
   * Custom color for the progress bar.
   * Overrides the default color based on state.
   */
  color?: string
}

/**
 * Emits interface for the TxProgressBar component.
 *
 * @public
 */
export interface ProgressBarEmits {
  /**
   * Emitted when the progress animation completes.
   */
  (e: 'complete'): void
}
