export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error'

export interface BadgeProps {
  variant?: BadgeVariant
  /** Badge text when no default slot is given and `dot` is false. Numeric
   *  values render through NumberFlow, so count changes animate per digit. */
  value?: number | string
  color?: string
  dot?: boolean
  /**
   * Presence of the badge. Toggling to `true` plays a slide-in (from
   * `--tx-badge-offset-x/y`) plus a pop (scale + blur + fade); toggling to
   * `false` pops it out. The badge keeps its layout box while closed, and the
   * entrance never plays on first mount — a badge that is simply always open
   * looks exactly like before.
   * @default true
   */
  open?: boolean
}
