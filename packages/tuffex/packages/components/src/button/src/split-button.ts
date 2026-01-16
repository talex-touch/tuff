export interface SplitButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info'
  size?: 'sm' | 'md' | 'lg' | 'large' | 'small' | 'mini'
  disabled?: boolean
  loading?: boolean

  icon?: string
  menuIcon?: string

  menuDisabled?: boolean
  menuWidth?: number
  menuPlacement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'right-start' | 'right-end' | 'left-start' | 'left-end'
  menuOffset?: number
}

export interface SplitButtonEmits {
  click: [event: MouseEvent]
  menuOpenChange: [open: boolean]
}

