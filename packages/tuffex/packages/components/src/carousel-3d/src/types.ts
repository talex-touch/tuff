// MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { MotionCardItem } from '../../card-spread/src/types'
export const CAROUSEL_3D_VARIANTS = [
  'card-carousel', 'card-cover-flow', 'card-time-machine',
  'card-carousel-mono', 'card-cover-flow-mono', 'card-time-machine-mono',
] as const
export type Carousel3DVariant = typeof CAROUSEL_3D_VARIANTS[number]
export interface Carousel3DProps {
  items: MotionCardItem[]
  modelValue?: number
  variant?: Carousel3DVariant
  expanded?: boolean
  loop?: boolean
  animated?: boolean
  disabled?: boolean
  controls?: boolean
  dots?: boolean
  timeline?: boolean
  timelineHover?: boolean
  duration?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  ariaLabel?: string
  previousLabel?: string
  nextLabel?: string
  itemLabel?: string
  timelineLabel?: string
}
export interface Carousel3DEmits {
  (e: 'update:modelValue', index: number): void
  (e: 'change', item: MotionCardItem, index: number): void
}
export interface Carousel3DSlotProps {
  item: MotionCardItem
  index: number
  active: boolean
}
export type { MotionCardItem }
