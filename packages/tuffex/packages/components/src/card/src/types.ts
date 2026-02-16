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
  fallbackMaskOpacity?: number
  refractionStrength?: number
  refractionProfile?: 'soft' | 'filmic' | 'cinematic'
  refractionTone?: TxCardRefractionTone
  refractionAngle?: number
  refractionLightFollowMouse?: boolean
  refractionLightFollowIntensity?: number
  refractionLightSpring?: boolean
  refractionLightSpringStiffness?: number
  refractionLightSpringDamping?: number
  clickable?: boolean
  loading?: boolean
  loadingSpinnerSize?: number
  disabled?: boolean
  inertial?: boolean
  inertialMaxOffset?: number
  inertialRebound?: number
}
