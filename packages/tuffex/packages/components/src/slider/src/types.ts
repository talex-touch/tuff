export interface SliderProps {
  modelValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
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
