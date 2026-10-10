import type { FlowLightVariant } from '../../flow-light/src/types'

export type TxCardVariant = 'solid' | 'dashed' | 'plain'

export type TxCardBackground = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'

export type TxCardShadow = 'none' | 'soft' | 'medium'

export type TxCardSize = 'small' | 'medium' | 'large'
export type TxCardRefractionTone = 'mist' | 'balanced' | 'vivid'

export interface TxCardProps {
  variant?: TxCardVariant
  background?: TxCardBackground
  shadow?: TxCardShadow
  size?: TxCardSize
  radius?: number
  padding?: number
  glassBlur?: boolean
  glassBlurAmount?: number
  glassOverlay?: boolean
  glassOverlayOpacity?: number
  maskOpacity?: number
  fallbackMaskOpacity?: number
  surfaceMoving?: boolean
  refractionStrength?: number
  refractionProfile?: 'soft' | 'filmic' | 'cinematic'
  refractionTone?: TxCardRefractionTone
  refractionAngle?: number
  refractionLightFollowMouse?: boolean
  refractionLightFollowIntensity?: number
  refractionLightSpring?: boolean
  refractionLightSpringStiffness?: number
  refractionLightSpringDamping?: number
  /** The flow light (TxFlowLight) over the card's surface, whatever its `background`; off when absent. */
  flowLight?: FlowLightVariant | false
  /** Multiplies the flow light's theme opacity; default 1. */
  flowLightIntensity?: number
  clickable?: boolean
  loading?: boolean
  loadingSpinnerSize?: number
  disabled?: boolean
  inertial?: boolean
  inertialMaxOffset?: number
  inertialRebound?: number
}
