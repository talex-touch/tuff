export type AvatarPresetSize = 'small' | 'medium' | 'large' | 'xlarge'
export type AvatarSize = AvatarPresetSize | number | `${number}` | `${number}px`

export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

export type AvatarShape = 'circle' | 'square' | 'rounded'

export interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  icon?: string
  size?: AvatarSize
  status?: AvatarStatus
  shape?: AvatarShape
  clickable?: boolean
  backgroundColor?: string
  textColor?: string
}

export interface AvatarEmits {
  click: []
}

export interface AvatarGroupProps {
  max?: number
  size?: AvatarSize
  overlap?: number | string
}
