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

  /**
   * Cross-axis alignment of the row's columns.
   *
   * `start` is right for a card whose text wraps to several lines. `center` is
   * right for a single-line list row, where a taller leading column — a caret,
   * a checkbox, an avatar — otherwise pins the label to the top of the row and
   * leaves it looking unaligned.
   *
   * @default 'start'
   */
  align?: 'start' | 'center'
}
