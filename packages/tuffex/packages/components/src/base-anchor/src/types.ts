import type { TxCardProps } from '../../card/src/types'

export type BaseAnchorPlacement
  = | 'top' | 'top-start' | 'top-end'
    | 'bottom' | 'bottom-start' | 'bottom-end'
    | 'left' | 'left-start' | 'left-end'
    | 'right' | 'right-start' | 'right-end'

export type BaseAnchorSurfaceMotionAdaptation = 'auto' | 'manual' | 'off'

export type BaseAnchorAnimationType = 'transfer' | 'boom' | 'opacity' | 'none'

export interface BaseAnchorAnimationOptions {
  type?: BaseAnchorAnimationType
  duration?: number
  closeDuration?: number
  ease?: string
  closeEase?: string
  distance?: number
  scale?: number
  blur?: number
  opacity?: number
}

export type BaseAnchorPanelCardProps = Partial<Pick<
  TxCardProps,
  | 'glassBlur'
  | 'glassBlurAmount'
  | 'glassOverlay'
  | 'glassOverlayOpacity'
  | 'maskOpacity'
  | 'fallbackMaskOpacity'
  | 'surfaceMoving'
  | 'refractionStrength'
  | 'refractionProfile'
  | 'refractionTone'
  | 'refractionAngle'
  | 'refractionLightFollowMouse'
  | 'refractionLightFollowIntensity'
  | 'refractionLightSpring'
  | 'refractionLightSpringStiffness'
  | 'refractionLightSpringDamping'
>>

export type BaseAnchorClassValue = string | Record<string, boolean> | BaseAnchorClassValue[]

export interface BaseAnchorVirtualReference {
  getBoundingClientRect: () => DOMRect | ClientRect
  contextElement?: Element
}

export interface BaseAnchorProps {
  modelValue?: boolean
  disabled?: boolean
  eager?: boolean

  // positioning
  placement?: BaseAnchorPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  matchReferenceWidth?: boolean
  referenceClass?: BaseAnchorClassValue
  virtualReference?: BaseAnchorVirtualReference

  // animation
  animation?: BaseAnchorAnimationOptions
  duration?: number
  ease?: string

  // panel styling
  useCard?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  panelCard?: BaseAnchorPanelCardProps
  surfaceMotionAdaptation?: BaseAnchorSurfaceMotionAdaptation
  showArrow?: boolean
  arrowSize?: number
  keepAliveContent?: boolean

  // behaviour
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  toggleOnReferenceClick?: boolean
}
