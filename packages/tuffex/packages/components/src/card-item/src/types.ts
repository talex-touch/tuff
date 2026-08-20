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
  /**
   * Overrides the automatic tab stop (`0` when clickable). Listbox hosts that
   * drive selection from the trigger via `aria-activedescendant` pass `-1` so
   * options never become Tab stops of their own.
   */
  tabindex?: number
}
