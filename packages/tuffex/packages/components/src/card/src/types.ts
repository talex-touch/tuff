export type TxCardVariant = 'solid' | 'dashed' | 'plain'

export type TxCardBackground = 'blur' | 'glass' | 'mask'

export type TxCardShadow = 'none' | 'soft' | 'medium'

export type TxCardSize = 'small' | 'medium' | 'large'

export interface TxCardProps {
  variant?: TxCardVariant
  background?: TxCardBackground
  shadow?: TxCardShadow
  size?: TxCardSize
  radius?: number
  padding?: number
  clickable?: boolean
  loading?: boolean
  loadingSpinnerSize?: number
  disabled?: boolean
  inertial?: boolean
  inertialMaxOffset?: number
  inertialRebound?: number
}
