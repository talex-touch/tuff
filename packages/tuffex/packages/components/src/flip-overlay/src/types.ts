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
  transitionName?: string
  maskClass?: string
  cardClass?: string
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
}
