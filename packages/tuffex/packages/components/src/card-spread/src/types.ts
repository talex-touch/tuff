// MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN
export const CARD_SPREAD_VARIANTS = [
  'card-arc-5', 'card-arc-7', 'card-long-arc-5', 'card-linear-spread',
  'card-corner-fan', 'card-stamp-arc', 'card-cascade-stagger',
  'card-scatter-spread', 'card-wheel-fan', 'focus-blur',
] as const

export type CardSpreadVariant = typeof CARD_SPREAD_VARIANTS[number]
export interface MotionCardItem {
  id?: string | number
  title?: string
  description?: string
  src?: string
  alt?: string
  date?: string
  href?: string
  color?: string
}
export interface CardSpreadProps {
  items: MotionCardItem[]
  modelValue?: number
  variant?: CardSpreadVariant
  expanded?: boolean
  angle?: number
  gap?: number
  yOffset?: number
  hoverIntensity?: number
  duration?: number
  colorful?: boolean
  blurAmount?: number
  opacityAmount?: number
  showBrackets?: boolean
  animated?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  ariaLabel?: string
  expandLabel?: string
  collapseLabel?: string
}
export interface CardSpreadEmits {
  (e: 'update:modelValue', value: number): void
  (e: 'update:expanded', value: boolean): void
  (e: 'select', item: MotionCardItem, index: number): void
}
export interface CardSpreadSlotProps {
  item: MotionCardItem
  index: number
  selected: boolean
  expanded: boolean
}
