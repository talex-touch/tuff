import type { VNode } from 'vue'
import type { PopoverPlacement } from '../../popover'

export type AvatarPresetSize = 'small' | 'medium' | 'large' | 'xlarge'
export type AvatarSize = AvatarPresetSize | number | `${number}` | `${number}px`

export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

export type AvatarShape = 'circle' | 'square' | 'rounded'

export type AvatarGroupHoverEffect = 'none' | 'lift'

export interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  icon?: string
  size?: AvatarSize
  status?: AvatarStatus
  shape?: AvatarShape
  clickable?: boolean
  backgroundColor?: string
  textColor?: string
}

export interface AvatarEmits {
  click: []
}

export interface AvatarGroupProps {
  max?: number
  size?: AvatarSize
  overlap?: number | string

  /** Per-avatar hover feedback: `lift` raises the hovered avatar above its neighbours. */
  hoverEffect?: AvatarGroupHoverEffect
  /** Fan the whole row apart while the group is hovered. */
  spreadOnHover?: boolean
  /** Overlap to ease towards while spread; only read when `spreadOnHover` is set. */
  spreadOverlap?: number | string

  /** Reveal the avatars behind `+N` in a popover. Off by default: it adds a floating layer. */
  overflowPopover?: boolean
  overflowPopoverTrigger?: 'hover' | 'click'
  overflowPopoverPlacement?: PopoverPlacement
}

export interface AvatarGroupOverflowSlotProps {
  /** The avatars `max` cut off, ready to render. */
  nodes: VNode[]
  count: number
}
