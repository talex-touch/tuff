import type { SpringConfig, TransitionPreset } from '../../liquid/src/spring'

/** The side of the body a bud grows from. */
export type FusionSurfaceEdge = 'top' | 'right' | 'bottom' | 'left'

/** A preset from the shared spring table (`liquid/src/spring.ts`) or a raw
 *  spring. Duration-based transitions are not accepted: the buds are driven
 *  frame by frame and must keep their velocity when a target moves. */
export type FusionSurfaceTransition = TransitionPreset | SpringConfig

/** One bud as TxFusionSurface declares it. */
export interface FusionSurfaceBud {
  id: string
  /** Default `'top'`. */
  edge?: FusionSurfaceEdge
  /** `true`/`false` or a 0..1 amount. Default `true`. */
  open?: boolean | number
  /** Position along the edge: from the left on top/bottom, from the top on
   *  left/right. Default: the middle of the edge. */
  center?: number
  /** Size along the edge, in px. */
  width: number
  /** Outward size when fully open, in px. */
  height: number
  /** Corner radius of the bud's outer corners. Default: the surface `radius`. */
  radius?: number
  /** Distance the bud is pulled away from the body, in px. Pulled to about
   *  96% of `breakAt`, the neck snaps and the bud becomes a separate drop.
   *  Default 0. */
  detach?: number
  /** Sideways offset of the pulled-away part (or of the drop), in px:
   *  right on top/bottom, down on left/right. Default 0. */
  drift?: number
}

export interface FusionSurfaceProps {
  buds?: FusionSurfaceBud[]
  /** Corner radius of the body. Default 16. */
  radius?: number
  /** Largest radius of the concave fillet where a bud joins the body.
   *  Default 12; never more than half the bud's current height. */
  fillet?: number
  /** `detach` at which the neck closes completely; it snaps a little before,
   *  at about 96% of it. Default 28. */
  breakAt?: number
  /** Surface fill. Default `var(--tx-bg-color-overlay)`. */
  fill?: string
  /** Outline colour. Default none. */
  stroke?: string
  /** Outline width in px when `stroke` is set. Default 1. */
  strokeWidth?: number
  /** `box-shadow` syntax. Blurred outer layers become a `drop-shadow()`
   *  chain that follows the outline; `inset` and spread layers are skipped.
   *  A `var()` layer passes through and must hold one `x y blur colour`
   *  layer, like `--tx-elevation-*`. Default `var(--tx-elevation-3)`. */
  shadow?: string
  /** Spring for opening, moving, resizing and pulling buds. Default `'smooth'`. */
  transition?: FusionSurfaceTransition
  /** Blur (px) a bud's content starts from while it opens. 0 turns the blur
   *  off; the content still fades. Default 6. */
  contentBlur?: number
}

export interface FusionSurfaceEmits {
  (e: 'break', id: string): void
  (e: 'settle'): void
}

/** The neck has snapped. Everything here is the bud as it was at that frame,
 *  so moving the bud afterwards moves the drop and leaves the remnant where
 *  the neck broke. */
export interface FusionSurfaceSplit {
  center: number
  width: number
  height: number
  detach: number
  drift: number
  /** 1 at the break, down to 0: the stub left on the body sinks back into
   *  the edge. */
  remnant: number
  /** 1 at the break, down to 0: the drop's pointed tail draws in and its
   *  inner side becomes an ordinary rounded edge. */
  tail: number
  /** How large the drop is drawn, about its own centre on both axes: 1 is
   *  full size, 0 is gone. The component lowers it as a split bud closes, so
   *  the drop shrinks away instead of flattening. Default 1. */
  scale?: number
}

/** One bud as `fusionSurfacePath()` draws it: the current geometry, not a
 *  target. Lengths are px in the body's coordinates. */
export interface FusionSurfaceBudShape {
  id: string
  /** Default `'top'`. */
  edge?: FusionSurfaceEdge
  /** Along the edge: from the left on top/bottom, from the top on left/right.
   *  Default: the middle of the edge. */
  center?: number
  /** Size along the edge. */
  width: number
  /** Current outward height. Grow it from 0 to open the bud; under 0.5 the
   *  bud is not drawn. After a split this is the drop's height before
   *  `split.scale`. */
  height: number
  /** Outer corner radius. Default: the body radius. */
  radius?: number
  /** Largest concave fillet radius. Default 12. */
  fillet?: number
  /** How far the bud is pulled out. Default 0. */
  detach?: number
  /** 0..1, how far the neck has narrowed: 1 closes it to a point. The
   *  component uses `fusionSurfacePinch(detach, breakAt)`. Default 0. */
  pinch?: number
  /** Sideways offset of the pulled-away part. Default 0. */
  drift?: number
  /** Set once the neck has snapped; `pinch` is ignored from then on. */
  split?: FusionSurfaceSplit | null
}

export interface FusionSurfaceGeometryInput {
  /** Body size. Nothing is drawn unless both are positive. */
  width: number
  height: number
  /** Body corner radius. Default 16. */
  radius?: number
  buds?: FusionSurfaceBudShape[]
  /** Draw the body too. `false` outputs only the buds, necks and drops, for
   *  a host that draws its own body. Default `true`. */
  includeBody?: boolean
  /** With `includeBody: false`, how far each attached shape reaches into the
   *  body (px) so it covers the host's own border. Default 2. */
  baseOverlap?: number
}

/** Where an attached bud (or the remnant of one) meets the body edge, in the
 *  same along-the-edge units as `center`. */
export interface FusionSurfaceSpan {
  id: string
  edge: FusionSurfaceEdge
  from: number
  to: number
}

/** A bud's current outer box in body coordinates (the drop's, after a
 *  split): its outer edge sits where the bud currently reaches. */
export interface FusionSurfaceRect {
  id: string
  edge: FusionSurfaceEdge
  x: number
  y: number
  width: number
  height: number
}

export interface FusionSurfaceGeometry {
  /** One or more closed subpaths, clockwise, coordinates to 2 decimals. */
  d: string
  spans: FusionSurfaceSpan[]
  rects: FusionSurfaceRect[]
}
