import type { CSSProperties } from 'vue'

export interface FlipOverlayProps {
  modelValue?: boolean
  source?: HTMLElement | DOMRect | null
  sourceRadius?: string | null
  duration?: number
  rotateX?: number
  rotateY?: number
  tiltRange?: number
  perspective?: number
  speedBoost?: number
  speedBoostAt?: number
  easeOut?: string
  easeIn?: string
  maskClosable?: boolean
  preventAccidentalClose?: boolean
  transitionName?: string
  maskClass?: string
  cardClass?: string
  cardStyle?: CSSProperties
  globalMask?: boolean
  border?: 'solid' | 'dashed' | 'dash' | 'none'
  surface?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  surfaceColor?: string
  surfaceOpacity?: number
  header?: boolean
  headerTitle?: string
  headerDesc?: string
  closable?: boolean
  closeAriaLabel?: string
  scrollable?: boolean
  randomTilt?: boolean
  expanded?: boolean
  animating?: boolean
}

export interface FlipOverlayEmits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:expanded', value: boolean): void
  (e: 'update:animating', value: boolean): void
  (e: 'open'): void
  (e: 'opened'): void
  (e: 'close'): void
  (e: 'closed'): void
}

export interface FlipOverlaySlotProps {
  close: () => void
  expanded: boolean
  animating: boolean
  closable: boolean
  headerTitle?: string
  headerDesc?: string
}
