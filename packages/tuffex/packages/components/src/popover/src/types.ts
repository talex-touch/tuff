export type PopoverPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'

export interface PopoverProps {
  modelValue?: boolean
  disabled?: boolean
  placement?: PopoverPlacement
  offset?: number
  width?: number
  maxWidth?: number
  referenceFullWidth?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'blur' | 'glass' | 'mask'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
}
