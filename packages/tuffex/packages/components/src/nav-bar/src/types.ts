export interface NavBarProps {
  title?: string
  fixed?: boolean
  safeAreaTop?: boolean
  showBack?: boolean
  disabled?: boolean
  zIndex?: number
}

export interface NavBarEmits {
  (e: 'back'): void
  (e: 'click-left'): void
  (e: 'click-right'): void
}
