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
   * Secondary copy shown after the label in the top text row, e.g.
   * "1.4 MB of 2.3 MB". Rendered only under `textPlacement: 'top'` and ignored
   * for the other placements. It is visible text, never part of the
   * progressbar's accessible name.
   * @default ''
   */
  detail?: string

  /**
   * Accessible name for the progressbar. Without it the name falls back to
   * `message` — which is *visible* in-bar text, so naming a bar used to mean
   * printing a label across it. Set this when the bar is already labelled by
   * surrounding copy.
   * @default ''
   */
  ariaLabel?: string

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
   * `'top'` places a label row (plus optional `detail`) above the track.
   * @default 'inside'
   */
  textPlacement?: 'inside' | 'outside' | 'top'

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
   * Rim drawn around the track. `'plain'` (default) draws none; `'solid'` and
   * `'dashed'` add a 1px border in that style.
   * @default 'plain'
   */
  maskVariant?: 'solid' | 'dashed' | 'plain'

  /**
   * Optional mask layer under the fill. `'none'` (default) renders no mask
   * node at all and the track is a flat tint of the text colour; `'blur'`,
   * `'glass'` and `'mask'` opt back into the layered recipes.
   * @default 'none'
   */
  maskBackground?: 'none' | 'blur' | 'glass' | 'mask'

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
