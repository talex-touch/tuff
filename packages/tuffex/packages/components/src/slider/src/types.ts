export interface SliderProps {
  modelValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  /**
   * Accessible label for the range input. The visual root is a wrapper `<div>`,
   * so a fallthrough `aria-label` lands on the wrapper instead of the control —
   * pass it here (or use `ariaLabelledby`) to name the slider itself.
   */
  ariaLabel?: string
  /** ID(s) of visible element(s) that name the range input. */
  ariaLabelledby?: string
  showValue?: boolean
  formatValue?: (value: number) => string
  showTooltip?: boolean
  tooltipTrigger?: 'drag' | 'hover' | 'always'
  tooltipFormatter?: (value: number) => string
  tooltipPlacement?: 'top' | 'bottom'
  tooltipTilt?: boolean

  tooltipTiltMaxDeg?: number
  tooltipOffsetMaxPx?: number
  tooltipAccelBoost?: number
  tooltipSpringStiffness?: number
  tooltipSpringDamping?: number

  tooltipMotion?: 'blur' | 'fade' | 'none'
  tooltipMotionDuration?: number
  tooltipMotionBlurPx?: number
  tooltipDistortSkewDeg?: number

  tooltipJelly?: boolean
  tooltipJellyFrequency?: number
  tooltipJellyDecay?: number
  tooltipJellyRotateDeg?: number
  tooltipJellySkewDeg?: number
  tooltipJellySquash?: number
  tooltipJellyTriggerAccel?: number
}

export interface SliderEmits {
  (e: 'update:modelValue', value: number): void
  (e: 'change', value: number): void
}
