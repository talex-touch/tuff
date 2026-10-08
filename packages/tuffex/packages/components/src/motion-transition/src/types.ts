// Adapted from Amicro. MIT License; Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { Transition } from '../../liquid/src/spring'

export const MOTION_TRANSITION_VARIANTS = [
  'spatial-door-portal',
  'french-doors-3d',
  'obsidian-liquid-wave',
  'radial-iris-mask',
  'perspective-flip-stage',
  'staggered-glass-curtain',
  'double-stairs',
  'liquid-wave',
  'cross-fade',
] as const

export type MotionTransitionVariant = typeof MOTION_TRANSITION_VARIANTS[number]
export type MotionTransitionMode = 'inline' | 'card' | 'modal' | 'overlay'
export type MotionTransitionKey = string | number
export type MotionTransitionPhase = 'idle' | 'leave' | 'enter'
export type MotionTransitionStatus = 'finished' | 'interrupted' | 'reduced' | 'inactive' | 'closed'
export type MotionTransitionReason = 'change' | 'replay' | 'open'

export interface MotionTransitionProps {
  /** Content identity, not dialog visibility. Render the scoped slot from its key. */
  modelValue: MotionTransitionKey
  variant?: MotionTransitionVariant
  mode?: MotionTransitionMode
  /** Controlled visibility for modal and overlay modes. */
  open?: boolean
  transition?: Transition
  /** Total leave + enter time in ms; undefined uses the shared spring's duration. */
  duration?: number
  /** Playback rate; 2 takes half the time. */
  speed?: number
  replayKey?: MotionTransitionKey
  disabled?: boolean
  title?: string
  ariaLabel?: string
  closeLabel?: string
  closable?: boolean
  maskClosable?: boolean
  escapeClosable?: boolean
  width?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export interface MotionTransitionCompletion {
  from: MotionTransitionKey
  to: MotionTransitionKey
  variant: MotionTransitionVariant
  reason: MotionTransitionReason
  status: MotionTransitionStatus
}

export interface MotionTransitionSlotProps {
  key: MotionTransitionKey
  phase: MotionTransitionPhase
  running: boolean
  close: () => void
  replay: () => void
}

export interface MotionTransitionEmits {
  (event: 'update:open', value: boolean): void
  (event: 'start', detail: Omit<MotionTransitionCompletion, 'status'>): void
  (event: 'completed', detail: MotionTransitionCompletion): void
  (event: 'interrupted', detail: MotionTransitionCompletion): void
  (event: 'close', reason: 'button' | 'escape' | 'mask' | 'api'): void
}

export interface MotionTransitionInstance {
  replay: () => void
  finish: () => void
  close: () => void
}
