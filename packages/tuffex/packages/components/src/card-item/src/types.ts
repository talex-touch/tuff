export type CardItemAvatarShape = 'circle' | 'rounded'

export interface CardItemProps {
  role?: string
  title?: string
  subtitle?: string
  description?: string

  iconClass?: string
  avatarText?: string
  avatarUrl?: string
  avatarSize?: number
  avatarShape?: CardItemAvatarShape

  clickable?: boolean
  active?: boolean
  disabled?: boolean
}
