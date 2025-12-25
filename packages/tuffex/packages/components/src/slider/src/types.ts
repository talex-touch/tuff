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
}

export interface SliderEmits {
  (e: 'update:modelValue', value: number): void
  (e: 'change', value: number): void
}
