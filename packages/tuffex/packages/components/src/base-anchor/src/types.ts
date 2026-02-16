import type { StyleValue } from 'vue'

export type BaseAnchorPlacement =
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

export interface BaseAnchorVirtualRef {
  getBoundingClientRect: () => DOMRect
}

export interface BaseAnchorProps {
  modelValue?: boolean
  disabled?: boolean

  // 定位
  placement?: BaseAnchorPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  matchReferenceWidth?: boolean
  referenceFullWidth?: boolean

  // 动画
  motion?: 'fade' | 'split'
  autoResize?: boolean
  autoResizeWidth?: boolean
  autoResizeHeight?: boolean

  // 行为
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean

  // 结构
  transition?: string
  referenceAs?: string
  floatingAs?: string
  referenceProps?: Record<string, any>
  floatingProps?: Record<string, any>
  referenceClass?: string | string[] | Record<string, boolean>
  floatingClass?: string | string[] | Record<string, boolean>
  floatingStyle?: StyleValue
  showArrow?: boolean
  arrowSize?: number
  virtualRef?: BaseAnchorVirtualRef
  onBeforeEnter?: (el: Element) => void
}
