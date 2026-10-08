// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { SpringConfig, Transition } from '../../liquid/src/spring'

export const MOTION_VARIANTS = [
  'fade-in', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'scale-in', 'zoom-in',
  'card-hover', 'tilt-card', 'magnetic-button', 'glow-button',
  'cursor-trail', 'spotlight', 'mouse-follow',
  'scroll-reveal', 'progress-indicator', 'sticky-reveal', 'icon-swap', 'in-view',
] as const
export type MotionVariant = typeof MOTION_VARIANTS[number]
export interface MotionItem {
  id: string | number
  title: string
  description?: string
  href?: string
  disabled?: boolean
}
export interface MotionProps {
  variant?: MotionVariant
  as?: string
  enabled?: boolean
  disabled?: boolean
  label?: string
  /** Durations and delays use milliseconds. */
  duration?: number
  delay?: number
  xOffset?: number
  yOffset?: number
  initialScale?: number
  initialBlur?: number
  maxTilt?: number
  range?: number
  strength?: number
  spring?: SpringConfig
  glowColor?: string
  glowSize?: number
  cursorSize?: number
  cursorCount?: number
  /** Global cursors teleport to body; false confines coordinates to this host. */
  global?: boolean
  scrollContainer?: HTMLElement | null
  progressHeight?: number
  stickyTop?: number
  items?: MotionItem[]
  once?: boolean
  rootMargin?: string
  stateKey?: string | number | boolean
  transition?: Transition
}
export interface MotionPointer {
  x: number
  y: number
  elementX: number
  elementY: number
  width: number
  height: number
  inside: boolean
}
export interface StaggerOptions {
  baseDelay?: number
  staggerDelay?: number
  from?: 'first' | 'last' | 'center' | number
}
export type MotionHapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
export interface MotionHapticResult {
  supported: boolean
  /** Browser accepted the request; this cannot prove physical vibration. */
  accepted: boolean
}
