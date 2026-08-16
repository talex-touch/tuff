import type { AnchorDelayLayer } from '../../../../utils/anchor-delay'
import type { BaseAnchorProps } from '../../base-anchor/src/types'

export type TooltipAnchorProps = Omit<BaseAnchorProps, 'modelValue' | 'disabled'>

/**
 * The tooltip doubles as the family's shared middle layer: an anchored panel
 * with trigger handling and anchor-delay scheduling. Popover (and through it
 * dropdown / context menu) builds on it via `layer` / `role` / `unstyled`.
 */
export interface TooltipProps {
  modelValue?: boolean
  content?: string
  disabled?: boolean
  /** `manual` binds no reference interactions: the host drives `modelValue`. */
  trigger?: 'hover' | 'click' | 'focus' | 'manual'
  openDelay?: number
  closeDelay?: number
  maxHeight?: number
  referenceFullWidth?: boolean
  interactive?: boolean
  keepAliveContent?: boolean
  closeOnClickOutside?: boolean
  toggleOnReferenceClick?: boolean
  /** Semantic overlay role for the anchor-delay service. Defaults to `hint`. */
  layer?: AnchorDelayLayer
  /** ARIA role of the panel. Anything but `tooltip` also drops aria-describedby. */
  role?: string
  /** Render the default slot bare: no tooltip chrome, sizing, or typography. */
  unstyled?: boolean
  anchor?: Partial<TooltipAnchorProps>
}
