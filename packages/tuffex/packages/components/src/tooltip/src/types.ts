import type { BaseAnchorProps } from '../../base-anchor/src/types'

export type TooltipAnchorProps = Omit<BaseAnchorProps, 'modelValue' | 'disabled'>

export interface TooltipProps {
  modelValue?: boolean
  content?: string
  disabled?: boolean
  trigger?: 'hover' | 'click' | 'focus'
  openDelay?: number
  closeDelay?: number
  maxHeight?: number
  referenceFullWidth?: boolean
  interactive?: boolean
  keepAliveContent?: boolean
  closeOnClickOutside?: boolean
  toggleOnReferenceClick?: boolean
  anchor?: Partial<TooltipAnchorProps>
}
