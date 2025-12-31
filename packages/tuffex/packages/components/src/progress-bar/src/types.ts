/**
 * Props interface for the TxProgressBar component.
 *
 * @public
 */
import type { TooltipProps } from '../../tooltip/src/types'

export interface ProgressSegment {
  value: number
  color?: string
  label?: string
}

export type ProgressIndeterminateVariant = 'classic' | 'sweep' | 'bounce' | 'elastic' | 'split'

export type ProgressFlowEffect = 'none' | 'shimmer' | 'wave' | 'particles'

export type ProgressIndicatorEffect = 'none' | 'sparkle'

export type ProgressHoverEffect = 'none' | 'glow'

export interface ProgressBarProps {
  /**
   * Whether to show the loading animation.
   * @default false
   */
  loading?: boolean

  /**
   * Whether to show the indeterminate animation.
   * @default false
   */
  indeterminate?: boolean

  /**
   * Indeterminate animation variant.
   * @default 'sweep'
   */
  indeterminateVariant?: ProgressIndeterminateVariant

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
   * Status preset for the progress bar.
   *
   * When `error`/`success` is set, it takes precedence.
   */
  status?: 'success' | 'error' | 'warning' | ''

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
   * Multi segment progress.
   *
   * When provided, the component will render segments inside the filled area.
   */
  segments?: ProgressSegment[]

  /**
   * Total value used to compute the filled percentage when `segments` is provided.
   * @default 100
   */
  segmentsTotal?: number

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
   * Where to render the text when `showText` or `message` is provided.
   * @default 'inside'
   */
  textPlacement?: 'inside' | 'outside'

  /**
   * Custom text formatter.
   */
  format?: (percentage: number) => string

  /**
   * Flow overlay effect on determinate progress.
   * @default 'none'
   */
  flowEffect?: ProgressFlowEffect

  /**
   * Extra indicator visual effect.
   * @default 'none'
   */
  indicatorEffect?: ProgressIndicatorEffect

  /**
   * Hover effect.
   * @default 'none'
   */
  hoverEffect?: ProgressHoverEffect

  /**
   * Custom color for the progress bar.
   * Overrides the default color based on state.
   */
  color?: string

  /**
   * Variant of the background track (mask) under the bar.
   * @default 'solid'
   */
  maskVariant?: 'solid' | 'dashed' | 'plain'

  /**
   * Background effect for the mask layer.
   * @default 'blur'
   */
  maskBackground?: 'blur' | 'glass' | 'mask'

  /**
   * Whether to show tooltip on hover.
   * @default false
   */
  tooltip?: boolean

  /**
   * Tooltip content.
   */
  tooltipContent?: string

  /**
   * Additional tooltip props.
   */
  tooltipProps?: Partial<TooltipProps>
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
