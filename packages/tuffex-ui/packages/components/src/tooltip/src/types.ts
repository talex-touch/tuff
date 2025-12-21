export type TooltipPlacement =
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

export interface TooltipProps {
  modelValue?: boolean
  content?: string
  disabled?: boolean
  trigger?: 'hover' | 'click' | 'focus'
  placement?: TooltipPlacement
  offset?: number
  openDelay?: number
  closeDelay?: number
  maxWidth?: number

  showArrow?: boolean
  interactive?: boolean
  closeOnClickOutside?: boolean
}
