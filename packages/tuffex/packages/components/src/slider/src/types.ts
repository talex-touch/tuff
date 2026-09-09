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
  /**
   * The capsule thumb — the Radio button-group indicator borrowed whole: the same
   * 28px capsule, the same fill / rim / highlight recipe, and the same jelly (a pop
   * on grab, stretch with speed, a squash on a reversal, at the track ends and on a
   * fast release). The native thumb becomes a bare hit area. Pass `false` for the
   * flat native disc.
   */
  thumbSurface?: boolean
  /**
   * The capsule's body — the Radio button group's three `indicatorVariant`s. `solid` is
   * the plain 88% overlay fill. `blur` (default) thins the fill to 22% and frosts the
   * track and fill under it, at rest and while dragging. `glass` keeps the solid capsule
   * at rest and swaps in the indicator's refractive `TxGlassSurface` while the thumb is held.
   */
  thumbVariant?: 'solid' | 'blur' | 'glass'
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
