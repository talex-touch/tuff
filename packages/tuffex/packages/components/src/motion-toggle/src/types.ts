// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { Transition } from '../../liquid/src/spring'
import type { MotionHapticType } from '../../motion/src/types'
export const MOTION_TOGGLE_VARIANTS = ['t-bounce', 't-solid', 't-rect', 't-circle', 't-bookmark', 't-like', 't-dislike', 't-repost', 't-pill', 't-morph', 't-check', 't-theme', 'classic-toggle'] as const
export type MotionToggleVariant = typeof MOTION_TOGGLE_VARIANTS[number]
export type MotionToggleValue = boolean | string | number
export interface MotionToggleOption { value: string | number; label: string; disabled?: boolean; panelId?: string }
export interface MotionToggleProps {
  modelValue?: MotionToggleValue
  variant?: MotionToggleVariant
  size?: 'xs' | 'sm' | 'md' | 'lg'
  disabled?: boolean
  label: string
  onLabel?: string
  offLabel?: string
  count?: number
  options?: MotionToggleOption[]
  enabled?: boolean
  haptic?: MotionHapticType | false
  transition?: Transition
}
export interface MotionToggleActivation { value: MotionToggleValue; previous: MotionToggleValue; variant: MotionToggleVariant; count?: number }
