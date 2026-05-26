import type { BaseAnchorAnimationOptions, BaseAnchorPanelCardProps, BaseAnchorPlacement } from '../../base-anchor/src/types'

export type ContextMenuTrigger = 'contextmenu' | 'click' | 'both' | 'manual'
export type ContextMenuAnchorMode = 'pointer' | 'reference'

export type ContextMenuPanelVariant = 'solid' | 'dashed' | 'plain'
export type ContextMenuPanelBackground = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
export type ContextMenuPanelShadow = 'none' | 'soft' | 'medium'

export interface ContextMenuPoint {
  x: number
  y: number
}

export type ContextMenuOpenTarget = ContextMenuPoint | MouseEvent | PointerEvent

export interface ContextMenuProps {
  modelValue?: boolean
  x?: number
  y?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  disabled?: boolean
  eager?: boolean
  trigger?: ContextMenuTrigger
  anchorMode?: ContextMenuAnchorMode
  preventDefault?: boolean
  placement?: BaseAnchorPlacement
  offset?: number
  closeOnEsc?: boolean
  closeOnClickOutside?: boolean
  closeOnTriggerPointerDown?: boolean
  closeOnAnyPointerDown?: boolean
  closeOnSelect?: boolean
  showArrow?: boolean
  arrowSize?: number
  animation?: BaseAnchorAnimationOptions
  duration?: number
  keepAliveContent?: boolean
  panelVariant?: ContextMenuPanelVariant
  panelBackground?: ContextMenuPanelBackground
  panelShadow?: ContextMenuPanelShadow
  panelRadius?: number
  panelPadding?: number
  panelCard?: BaseAnchorPanelCardProps
}

export interface ContextMenuContext {
  close: () => void
  closeOnSelect: boolean
}

export interface ContextMenuPanelProps {
  width?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  maxHeight?: number | string
  closeOnSelect?: boolean
  close?: () => void
  dense?: boolean
  outsideGuard?: boolean
  role?: string
  ariaLabel?: string
}

export interface ContextMenuItemProps {
  disabled?: boolean
  danger?: boolean
  color?: string
  shortcut?: string
  submenu?: boolean
  closeOnSelect?: boolean
}

export interface ContextMenuDividerProps {
  dashed?: boolean
  inset?: boolean
}

export const TX_CONTEXT_MENU_INJECTION_KEY = 'txContextMenu'
