import type { TxCardProps } from '../../card/src/types'

export type BaseAnchorPlacement
  = | 'top' | 'top-start' | 'top-end'
    | 'bottom' | 'bottom-start' | 'bottom-end'
    | 'left' | 'left-start' | 'left-end'
    | 'right' | 'right-start' | 'right-end'

export type BaseAnchorSurfaceMotionAdaptation = 'auto' | 'manual' | 'off'

export type BaseAnchorAnimationType = 'transfer' | 'boom' | 'opacity' | 'none' | 'drip' | 'bead'

export interface BaseAnchorAnimationOptions {
  type?: BaseAnchorAnimationType
  duration?: number
  closeDuration?: number
  ease?: string
  closeEase?: string
  distance?: number
  scale?: number
  blur?: number
  opacity?: number

  /**
   * `drip` / `bead` only: Gaussian blur radius of the goo filter (feGaussianBlur stdDeviation).
   * Together with `gooThreshold` this decides how wide a gap the neck survives.
   */
  gooBlur?: number
  /** `drip` / `bead` only: alpha slope of the threshold colour matrix. */
  gooThreshold?: number
  /** `drip` / `bead` only: alpha offset of the threshold colour matrix. */
  gooThresholdOffset?: number
  /**
   * `drip` / `bead` only: colour of the outline ring flooded from the merged silhouette.
   * Defaults to the resolved `--tx-border-color` token so dark mode follows.
   */
  outlineColor?: string
  /** `drip` / `bead` only: corner radius of the trigger ghost. Measured from the reference when omitted. */
  triggerRadius?: number
  /** `drip` / `bead` only: panel height at p=0 — the seed the drop is torn from. */
  seedHeight?: number
  /** `drip` / `bead` only: selector for items faded in against the panel's own growth. */
  itemSelector?: string

  /**
   * `bead` only: how far each side of the sheet may be drawn in at peak speed (px).
   * The pinch reports the drop's velocity, so it decays to 0 as the motion settles.
   */
  beadPinch?: number
  /** `bead` only: speed at which the pinch saturates, in `p` per unit of normalised time. */
  beadVelocityRef?: number
}

export type BaseAnchorPanelCardProps = Partial<Pick<
  TxCardProps,
  | 'glassBlur'
  | 'glassBlurAmount'
  | 'glassOverlay'
  | 'glassOverlayOpacity'
  | 'maskOpacity'
  | 'fallbackMaskOpacity'
  | 'surfaceMoving'
  | 'refractionStrength'
  | 'refractionProfile'
  | 'refractionTone'
  | 'refractionAngle'
  | 'refractionLightFollowMouse'
  | 'refractionLightFollowIntensity'
  | 'refractionLightSpring'
  | 'refractionLightSpringStiffness'
  | 'refractionLightSpringDamping'
>>

export type BaseAnchorClassValue = string | Record<string, boolean> | BaseAnchorClassValue[]

export interface BaseAnchorVirtualReference {
  getBoundingClientRect: () => DOMRect | ClientRect
  contextElement?: Element
}

export interface BaseAnchorProps {
  modelValue?: boolean
  disabled?: boolean
  eager?: boolean

  // positioning
  placement?: BaseAnchorPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  matchReferenceWidth?: boolean
  referenceClass?: BaseAnchorClassValue
  virtualReference?: BaseAnchorVirtualReference

  // animation
  animation?: BaseAnchorAnimationOptions
  duration?: number
  ease?: string

  // panel styling
  useCard?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  panelCard?: BaseAnchorPanelCardProps
  surfaceMotionAdaptation?: BaseAnchorSurfaceMotionAdaptation
  showArrow?: boolean
  arrowSize?: number
  keepAliveContent?: boolean

  // behaviour
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  toggleOnReferenceClick?: boolean
}
