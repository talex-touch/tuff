import type { MorphIconSource } from '../../icon-morph/src/types'
import type { SpringConfig, Transition } from '../../liquid/src/spring'

export const MOTION_BUTTON_VARIANTS = [
  'slide-arrow', 'sparkle', 'morph', 'color-morph', 'pulse', 'rotate', 'shake',
  'ring', 'glare', 'text-reveal', 'magnetic', 'expand-ring', 'focus-blur',
] as const

export const MOTION_BUTTON_SOURCE_IDS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14',
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26',
  '27', '28', '29', '30', '31', '32', '33', '34', '35',
] as const

export type MotionButtonVariant = typeof MOTION_BUTTON_VARIANTS[number]
export type MotionButtonSourceId = typeof MOTION_BUTTON_SOURCE_IDS[number]
export type MotionButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export interface MotionButtonItem {
  label: string
  href?: string
  target?: string
  rel?: string
  disabled?: boolean
}

export interface MotionButtonCatalogEntry {
  sourceId: MotionButtonSourceId
  /** Attribution metadata only; never rendered as the component's label. */
  sourceLabel: string
  variant: MotionButtonVariant
  icon: string
  activeIcon?: string
  iconColor?: string
  activeIconColor?: string
  activeFill?: boolean
  holdDuration?: number
  sourceRef: string
}

export interface MotionButtonProps {
  /** Original catalog preset. Explicit visual props override its values. */
  sourceId?: MotionButtonSourceId
  variant?: MotionButtonVariant
  label?: string
  /** Shown only when the caller sets selected=true, never on simulated success. */
  activeLabel?: string
  ariaLabel?: string
  icon?: MorphIconSource
  activeIcon?: MorphIconSource
  iconColor?: string
  activeIconColor?: string
  activeFill?: boolean
  size?: MotionButtonSize
  disabled?: boolean
  animated?: boolean
  /** Caller-owned state. Hover and replay do not change it. */
  selected?: boolean
  href?: string
  target?: string
  rel?: string
  type?: 'button' | 'submit' | 'reset'
  iconOnly?: boolean
  hoverBackground?: string
  /** Decorative icon retention after pointer/focus exit; source presets default to 0 or 500ms. */
  holdDuration?: number
  /** Overrides each variant's original spring; duration/ease is also accepted. */
  spring?: Transition
  magneticStrength?: number
  /** Undefined preserves source 33's unrestricted pull inside the button. */
  magneticRange?: number
  magneticSpring?: SpringConfig
  /** Focus-blur renders caller-owned links/buttons, not a button containing links. */
  items?: readonly MotionButtonItem[]
  blurAmount?: number
  opacityAmount?: number
  showBrackets?: boolean
}

export interface MotionButtonEmits {
  click: [event: MouseEvent]
  select: [item: MotionButtonItem, index: number, event: MouseEvent]
}

export interface MotionButtonInstance {
  replay: () => void
  focus: () => void
}
