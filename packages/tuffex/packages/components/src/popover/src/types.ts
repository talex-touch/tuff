import type { BaseAnchorAnimationOptions, BaseAnchorClassValue, BaseAnchorPanelCardProps, BaseAnchorVirtualReference } from '../../base-anchor/src/types'

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
  /** Gap to the reference. Unset: 6 without an arrow, `max(8, arrowSize / 2 + 2)` with one. */
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  referenceFullWidth?: boolean
  referenceClass?: BaseAnchorClassValue

  /** Like the rest of the anchor family, no arrow unless opted in. @default false */
  showArrow?: boolean
  arrowSize?: number

  /** `manual` binds no reference interactions: the host drives `modelValue`. */
  trigger?: 'click' | 'hover' | 'manual'
  openDelay?: number
  closeDelay?: number
  animation?: BaseAnchorAnimationOptions
  /** Anchor to an arbitrary rect (pointer position, selection) instead of the reference slot. */
  virtualReference?: BaseAnchorVirtualReference
  /** Explicit override; when unset, panels with no fixed width match the reference. */
  matchReferenceWidth?: boolean
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
