export interface RatingProps {
  modelValue?: number
  maxStars?: number
  precision?: number | 0.5
  disabled?: boolean
  readonly?: boolean
  showText?: boolean
  filledIcon?: string
  emptyIcon?: string
  halfIcon?: string
}

export interface RatingEmits {
  'update:modelValue': [value: number]
  change: [value: number]
}
