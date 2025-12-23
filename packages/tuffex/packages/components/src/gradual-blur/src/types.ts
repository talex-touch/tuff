import type { CSSProperties } from 'vue'

export type GradualBlurPosition = 'top' | 'bottom' | 'left' | 'right'
export type GradualBlurCurve = 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type GradualBlurAnimated = boolean | 'scroll'
export type GradualBlurTarget = 'parent' | 'page'

export interface GradualBlurProps {
  position?: GradualBlurPosition
  strength?: number
  height?: string
  width?: string
  divCount?: number
  exponential?: boolean
  zIndex?: number
  animated?: GradualBlurAnimated
  duration?: string
  easing?: string
  opacity?: number
  curve?: GradualBlurCurve
  responsive?: boolean
  mobileHeight?: string
  tabletHeight?: string
  desktopHeight?: string
  mobileWidth?: string
  tabletWidth?: string
  desktopWidth?: string
  preset?:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'subtle'
    | 'intense'
    | 'smooth'
    | 'sharp'
    | 'header'
    | 'footer'
    | 'sidebar'
    | 'page-header'
    | 'page-footer'
  gpuOptimized?: boolean
  hoverIntensity?: number
  target?: GradualBlurTarget
  onAnimationComplete?: () => void
  className?: string
  style?: CSSProperties
}
