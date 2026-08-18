import type { BaseAnchorAnimationOptions, BaseAnchorClassValue, BaseAnchorPanelCardProps } from '../../base-anchor/src/types'

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
  /**
   * How the trigger opens the menu. Forwarded to TxPopover, which owns the
   * hover handling for both the reference and the panel — so a hover dropdown
   * gets the shared delay service's timing and preemption rather than needing
   * the host to hand-roll a close timer.
   */
  trigger?: 'click' | 'hover'
  offset?: number
  closeOnSelect?: boolean
  animation?: BaseAnchorAnimationOptions

  minWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  referenceClass?: BaseAnchorClassValue
  panelCard?: BaseAnchorPanelCardProps

  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface DropdownItemProps {
  disabled?: boolean
  danger?: boolean
  arrow?: boolean
  /**
   * Per-item override of the menu-level `closeOnSelect`, mirroring
   * `TxContextMenuItem`. `TxDropdownSubmenu` sets it to `false` on its trigger
   * row so clicking the row opens the nested panel instead of closing the menu.
   */
  closeOnSelect?: boolean
}

export interface DropdownSubmenuProps {
  disabled?: boolean
  placement?: DropdownPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  animation?: BaseAnchorAnimationOptions
  panelCard?: BaseAnchorPanelCardProps

  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}
