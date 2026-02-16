export type BaseAnchorPlacement =
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end'

export interface BaseAnchorProps {
  modelValue?: boolean
  disabled?: boolean

  // positioning
  placement?: BaseAnchorPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  matchReferenceWidth?: boolean

  // animation
  duration?: number
  ease?: string
  softEdge?: number

  // panel styling
  useCard?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  showArrow?: boolean
  arrowSize?: number
  keepAliveContent?: boolean

  // behaviour
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  toggleOnReferenceClick?: boolean
}
