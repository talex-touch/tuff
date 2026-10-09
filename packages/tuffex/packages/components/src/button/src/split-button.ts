import type { ButtonSize } from './size'

export interface SplitButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info'
  /** 按钮尺寸；三档对应 28px / 32px / 40px */
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean

  icon?: string
  /** 菜单触发器的图标类名；不传时用内置的竖向三点图标，不依赖宿主的图标集 */
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
