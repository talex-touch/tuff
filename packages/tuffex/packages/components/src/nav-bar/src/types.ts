export interface NavBarProps {
  title?: string
  fixed?: boolean
  safeAreaTop?: boolean
  showBack?: boolean
  disabled?: boolean
  zIndex?: number
  /**
   * Accessible label for the built-in back button (used when `showBack` is on
   * and no `left` slot is provided). Localize by passing e.g. '返回'.
   * @default 'Back'
   */
  backLabel?: string
  /**
   * Accessible label for the left action button when no `left` slot is provided.
   * When a `left` slot is present the slot content names the button instead.
   * @default 'Navigation left action'
   */
  leftLabel?: string
  /**
   * Accessible label for the right action button when no `right` slot is provided.
   * When a `right` slot is present the slot content names the button instead.
   * @default 'Navigation right action'
   */
  rightLabel?: string
}

export interface NavBarEmits {
  (e: 'back'): void
  (e: 'click-left'): void
  (e: 'click-right'): void
}
