import type { BaseAnchorClassValue, BaseAnchorPanelCardProps } from '../../base-anchor/src/types'

export type PopoverPlacement
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

export interface PopoverProps {
  modelValue?: boolean
  disabled?: boolean
  eager?: boolean
  placement?: PopoverPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  referenceFullWidth?: boolean
  referenceClass?: BaseAnchorClassValue

  showArrow?: boolean
  arrowSize?: number

  trigger?: 'click' | 'hover'
  openDelay?: number
  closeDelay?: number
  duration?: number
  keepAliveContent?: boolean
  toggleOnReferenceClick?: boolean

  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  panelCard?: BaseAnchorPanelCardProps
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
}
