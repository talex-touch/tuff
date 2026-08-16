import type { TxCardProps } from '../../card/src/types'

export type BaseAnchorPlacement
  = | 'top' | 'top-start' | 'top-end'
    | 'bottom' | 'bottom-start' | 'bottom-end'
    | 'left' | 'left-start' | 'left-end'
    | 'right' | 'right-start' | 'right-end'

export type BaseAnchorSurfaceMotionAdaptation = 'auto' | 'manual' | 'off'

export type BaseAnchorAnimationType = 'transfer' | 'boom' | 'opacity' | 'none' | 'drip' | 'bead' | 'expand'

/**
 * Exit-phase geometry. Each field falls back to the shared field of the same
 * name when the caller set one, and to the close type's own table otherwise.
 *
 * This exists because `scale` means opposite things per type — `boom` starts
 * above 1 and shrinks in, `expand` starts below 1 and grows out — so a composite
 * that shared a single value would be wrong at one end by construction.
 */
export interface BaseAnchorExitGeometry {
  scale?: number
  distance?: number
  blur?: number
  opacity?: number
}

export interface BaseAnchorAnimationOptions {
  type?: BaseAnchorAnimationType
  /**
   * Type used while closing. Defaults to `type`, so omitting it keeps the run
   * symmetric and is exactly the historical behaviour.
   *
   * `drip` / `bead` share prepare/apply frame state across both directions, so a
   * half-liquid pair is rejected: the mismatched phase falls back to `type` and
   * warns in dev rather than stranding the stage mid-run.
   */
  closeType?: BaseAnchorAnimationType
  exit?: BaseAnchorExitGeometry
  duration?: number
  closeDuration?: number
  ease?: string
  closeEase?: string
  distance?: number
  /**
   * `boom`: start scale of the zoom (default 1.08, shrinks in).
   * `expand`: start scale of the settle (default 0.97, grows out) — the panel
   * finishes growing around the corner facing the reference.
   */
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
  /**
   * Drop the `flip` middleware, so the panel keeps the side `placement` asks
   * for instead of jumping to the opposite one near a viewport edge. `shift`
   * still slides it back into view, so it stays on screen either way.
   *
   * Intended for a `virtualReference` the caller re-measures itself — a text
   * selection or a caret, where a bar that changes sides mid-edit reads as a
   * different control. Leave it off for ordinary triggers: flipping is the
   * better default when the reference is a fixed element.
   */
  disableFlip?: boolean

  // animation
  animation?: BaseAnchorAnimationOptions

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
