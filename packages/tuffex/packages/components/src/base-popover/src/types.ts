export type BasePopoverPlacement =
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end'

export interface BasePopoverProps {
  modelValue?: boolean
  disabled?: boolean

  // positioning
  placement?: BasePopoverPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number

  // animation
  duration?: number
  ease?: string
  softEdge?: number

  // panel styling
  panelBackground?: 'blur' | 'glass' | 'mask'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number

  // behaviour
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
}
