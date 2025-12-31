export type FusionTrigger = 'hover' | 'click' | 'manual'
export type FusionDirection = 'x' | 'y'

export interface FusionProps {
  modelValue?: boolean
  disabled?: boolean
  trigger?: FusionTrigger
  direction?: FusionDirection
  gap?: number
  duration?: number
  easing?: string
  blur?: number
  alpha?: number
  alphaOffset?: number
}
