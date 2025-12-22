export type AvatarSize = 'small' | 'medium' | 'large' | 'xlarge'

export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

export interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  icon?: string
  size?: AvatarSize
  status?: AvatarStatus
  clickable?: boolean
  backgroundColor?: string
  textColor?: string
}

export interface AvatarEmits {
  click: []
}
