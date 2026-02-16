import type { TxCardProps } from '../../card/src/types'

export type BaseAnchorPlacement
  = | 'top' | 'top-start' | 'top-end'
    | 'bottom' | 'bottom-start' | 'bottom-end'
    | 'left' | 'left-start' | 'left-end'
    | 'right' | 'right-start' | 'right-end'

export type BaseAnchorPanelCardProps = Partial<Pick<
  TxCardProps,
  | 'glassBlur'
  | 'glassBlurAmount'
  | 'glassOverlay'
  | 'glassOverlayOpacity'
  | 'maskOpacity'
  | 'fallbackMaskOpacity'
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

export interface BaseAnchorProps {
  modelValue?: boolean
  disabled?: boolean

  // positioning
  placement?: BaseAnchorPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  matchReferenceWidth?: boolean

  // animation
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
  showArrow?: boolean
  arrowSize?: number
  keepAliveContent?: boolean

  // behaviour
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  toggleOnReferenceClick?: boolean
}
