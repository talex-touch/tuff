import type { TxIconSource } from '../../icon'

export type RatingIcon = string | TxIconSource

export interface RatingProps {
  modelValue?: number
  maxStars?: number
  precision?: number | 0.5
  disabled?: boolean
  readonly?: boolean
  showText?: boolean
  icon?: RatingIcon
  filledIcon?: RatingIcon
  emptyIcon?: RatingIcon
  halfIcon?: RatingIcon
  filledColor?: string
  emptyColor?: string
  hoverColor?: string
  textColor?: string
  size?: number | string
  gap?: number | string
  animated?: boolean
}

export interface RatingEmits {
  'update:modelValue': [value: number]
  'change': [value: number]
}
