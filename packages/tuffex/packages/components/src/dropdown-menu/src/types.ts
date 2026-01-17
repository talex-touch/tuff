export type DropdownPlacement
  = | 'top-start'
    | 'top-end'
    | 'bottom-start'
    | 'bottom-end'
    | 'right-start'
    | 'right-end'
    | 'left-start'
    | 'left-end'

export interface DropdownMenuProps {
  modelValue?: boolean
  placement?: DropdownPlacement
  offset?: number
  closeOnSelect?: boolean

  minWidth?: number

  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'blur' | 'glass' | 'mask'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface DropdownItemProps {
  disabled?: boolean
  danger?: boolean
  arrow?: boolean
}
