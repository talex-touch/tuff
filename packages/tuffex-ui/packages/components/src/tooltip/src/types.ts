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
  content?: string
  disabled?: boolean
  placement?: TooltipPlacement
  offset?: number
  openDelay?: number
  closeDelay?: number
  maxWidth?: number
}
