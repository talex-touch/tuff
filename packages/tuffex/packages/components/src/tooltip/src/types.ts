export type TooltipPlacement
  = | 'top'
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

export interface TooltipProps {
  modelValue?: boolean
  content?: string
  disabled?: boolean
  classPrefix?: string
  trigger?: 'hover' | 'click' | 'focus'
  placement?: TooltipPlacement
  offset?: number
  width?: number
  minWidth?: number
  openDelay?: number
  closeDelay?: number
  maxWidth?: number
  maxHeight?: number
  matchReferenceWidth?: boolean
  referenceFullWidth?: boolean

  showArrow?: boolean
  arrowSize?: number
  interactive?: boolean
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean

  motion?: 'fade' | 'split'
  fusion?: boolean

  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'blur' | 'glass' | 'mask'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  transition?: string
  autoResize?: boolean
  autoResizeWidth?: boolean
  autoResizeHeight?: boolean
}
