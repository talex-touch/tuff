import type {
  FusionSurfaceBudShape,
  FusionSurfaceEdge,
  FusionSurfaceGeometry,
  FusionSurfaceGeometryInput,
  FusionSurfaceRect,
  FusionSurfaceSpan,
} from './types'

// Pure geometry for TxFusionSurface: a rounded-rectangle body that grows buds
// from its edges, stretches them into a neck and snaps them off into drops.
// No Vue and no DOM, so core-app's send split can draw with it directly.
//
// The attached bud follows the uiarc.dev Dock (technique observed 2026-09-25,
// no code taken): one path recomputed from a few spring values, a concave
// quadratic fillet where the bud meets the body and a convex quadratic corner
// on its outer end, the bud clamped onto the straight part of the edge. The
// neck is this repo's own: each side of the bud is a half-width profile
// sampled over its height (design.md §2.3–2.4, validated against the
// prototype in the task's research/prototype/), so attached, stretched,
// pinched and broken are one formula under different parameters.
//
// Every edge has local coordinates: u runs along the edge in the path's
// clockwise direction, v points out of the body. Outlines are built there
// once and mapped onto whichever edge they sit on.

type Pt = readonly [number, number]
type Cmd = readonly ['L', Pt] | readonly ['Q', Pt, Pt] | readonly ['C', Pt, Pt, Pt]

/** A point on a side and its derivative with respect to the sampling
 *  parameter. The sides are drawn as cubic Hermite segments from these. */
interface Sample {
  p: Pt
  t: Pt
}

/** Samples per bud side. Fixed, so a moving bud keeps one command structure
 *  from frame to frame. */
const SAMPLES = 22
/** Where the waist sits, as a share of the detach distance above the fillet:
 *  about where the drop's inner end will be once it separates. */
const WAIST = 0.62
/** Length of the dip above the waist (the drop's shoulder): 0.45 of the bud
 *  height, at most 18px. Short, so the drop keeps a convex shoulder. */
const SHOULDER_SHARE = 0.45
const SHOULDER_MAX = 18
/** Shortest either half of the dip may be; it is a divisor. */
const MIN_SPREAD = 4
/** Pinch by which a dip has fully taken its neck form (see `neckProfile`):
 *  half closed, the point from which the neck reads as an hourglass. */
const NECK_FORM = 0.5
/** Under this height (px) a bud, remnant or drop is not drawn: below a device
 *  pixel it only flickers. uiarc skips the same range. */
const MIN_VISIBLE = 0.5
/** Steepest side slope a corner's control point follows. Only extreme leans
 *  reach it, and past it the control point would fly off along the edge. */
const MAX_SLOPE = 2
/** Inputs are clamped to ±this many px, which keeps every product finite. */
const LIMIT = 1e6
const EPS = 1e-9

const DEFAULT_RADIUS = 16
const DEFAULT_FILLET = 12
const DEFAULT_OVERLAP = 2

/** Pinch at which a neck counts as broken: the waist is 1.5% of the bud's
 *  half-width, about a pixel for a 160px bud. The component latches the split
 *  there; a caller driving `fusionSurfacePath()` itself should too. */
export const FUSION_SURFACE_BREAK_PINCH = 0.985

const EDGES: readonly FusionSurfaceEdge[] = ['top', 'right', 'bottom', 'left']

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(LIMIT, Math.max(-LIMIT, value))
    : fallback
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 - e0 <= EPS)
    return x < e0 ? 0 : 1
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

function smoothstepSlope(e0: number, e1: number, x: number): number {
  if (e1 - e0 <= EPS || x <= e0 || x >= e1)
    return 0
  const t = (x - e0) / (e1 - e0)
  return (6 * t * (1 - t)) / (e1 - e0)
}

/** Raised cosine: 1 at t = 0, 0 with zero slope at |t| = 1. The zero slope is
 *  what lets the dip die out into a straight side without a knee. */
function bump(t: number): number {
  return Math.abs(t) >= 1 ? 0 : (1 + Math.cos(Math.PI * t)) / 2
}

function bumpSlope(t: number): number {
  return Math.abs(t) >= 1 ? 0 : -(Math.PI / 2) * Math.sin(Math.PI * t)
}

/**
 * The default neck: nothing for the first quarter of `breakAt`, then the
 * square of a smoothstep, fully closed at `breakAt` (it snaps at about 96%).
 *
 * Eased in because a short neck can only carry a shallow dip. With a plain
 * smoothstep from 15%, a 160px bud's side already leaned 45° at detach 7,
 * its dip only 2.9px deep: a notch on each side rather than a waist. Squared,
 * the curve starts with zero slope and zero curvature and stays within a few
 * px until the neck has stretched about half of `breakAt`, then closes
 * quickly into the hourglass, the way a stretched liquid bridge gives way
 * late. Together with the broad early dip in `neckProfile`, that first 45°
 * comes at detach 15 with the dip 8.4px deep.
 */
export function fusionSurfacePinch(detach: number, breakAt: number): number {
  const at = Math.max(1, finite(breakAt, 28))
  const eased = smoothstep(0.25 * at, at, Math.max(0, finite(detach, 0)))
  return eased * eased
}

/** An attached bud's footprint once it has been fitted onto its edge. */
interface Frame {
  /** Centre along the edge, clamped onto the straight part. */
  c: number
  /** Width actually drawn. */
  l: number
  /** Concave fillet radius. */
  p: number
  /** Convex corner radius. */
  m: number
  /** Outward height. */
  e: number
}

function resolveFrame(
  length: number,
  bodyRadius: number,
  center: number,
  width: number,
  height: number,
  radius: number,
  fillet: number,
): Frame | null {
  if (!(height >= MIN_VISIBLE))
    return null
  // The fillet can be at most half the bud's height, or it would run past
  // the bud's own side.
  const p = Math.min(fillet, height / 2)
  // Both fillets have to land on the straight part of the edge: a bud never
  // eats into the body's corner radius.
  const l = Math.min(width, length - 2 * bodyRadius - 2 * p)
  if (!(l >= MIN_VISIBLE))
    return null
  const half = l / 2
  const c = clamp(center, bodyRadius + p + half, length - bodyRadius - p - half)
  // Clamped before anything is sampled: an unclamped corner on a short bud
  // inverts the sampled range and spikes.
  const m = Math.min(radius, height - p, half)
  return { c, l, p, m, e: height }
}

/**
 * One side profile: the half-width of the bud at height v, and the line it is
 * centred on. With no pinch the half-width is constant and the sides are the
 * straight sides of the attached bud, so nothing switches models when a bud
 * starts to stretch.
 */
interface Profile {
  c: number
  half: number
  /** Height of the waist. */
  vw: number
  /** Length of the dip below and above the waist. */
  down: number
  up: number
  /** Depth of the dip at the waist, 0..half. */
  delta: number
  /** Sideways offset reached above the dip. */
  drift: number
}

function dipAt(pr: Profile, v: number): { t: number, spread: number } {
  const spread = v < pr.vw ? pr.down : pr.up
  return { t: (v - pr.vw) / spread, spread }
}

function halfWidth(pr: Profile, v: number): number {
  return pr.half - pr.delta * bump(dipAt(pr, v).t)
}

function halfWidthSlope(pr: Profile, v: number): number {
  const { t, spread } = dipAt(pr, v)
  return (-pr.delta * bumpSlope(t)) / spread
}

function axis(pr: Profile, v: number): number {
  return pr.c + pr.drift * smoothstep(pr.vw - pr.down, pr.vw + pr.up, v)
}

function axisSlope(pr: Profile, v: number): number {
  return pr.drift * smoothstepSlope(pr.vw - pr.down, pr.vw + pr.up, v)
}

function shoulder(height: number): number {
  return Math.max(MIN_SPREAD, Math.min(height * SHOULDER_SHARE, SHOULDER_MAX))
}

function neckProfile(frame: Frame, detach: number, pinch: number, drift: number): Profile {
  // The waist never comes closer than MIN_SPREAD to the fillet. The prototype
  // floored the lower dip's length instead, which on a short neck (detach
  // under ~6.5px) let the dip reach below the fillet's end: a knee at the base
  // and a lean that started inside the fillet.
  let vw = frame.p + Math.max(WAIST * detach, MIN_SPREAD)
  // The shoulder has to be finished where the outer corners start, or they
  // begin on a side that is still flaring and overshoot the bud's width.
  // Only short or barely stretched buds hit this; at the break of a default
  // 40px bud there is 22px of room for its 18px shoulder.
  const room = frame.e + detach - frame.m - vw
  let up = Math.max(MIN_SPREAD, Math.min(shoulder(frame.e), room))
  // A shallow dip starts as a broad waist centred on the whole side and takes
  // the neck form above as it deepens, completely by NECK_FORM. The neck
  // form's lower half is only 0.62 of the stretch long, so any depth bent the
  // side in hard just above the fillet, a notch rather than a waist; centred,
  // that half is up to twice as long. From NECK_FORM on (every hourglass and
  // break frame) the profile is exactly the neck form.
  const span = frame.e + detach - frame.m - frame.p
  if (span >= 2 * MIN_SPREAD) {
    const k = smoothstep(0, NECK_FORM, pinch)
    vw = frame.p + span / 2 + (vw - frame.p - span / 2) * k
    up = span / 2 + (up - span / 2) * k
  }
  return {
    c: frame.c,
    half: frame.l / 2,
    vw,
    // Asymmetric on purpose. Below the waist the dip spans the whole run down
    // to the fillet, so it reaches zero (with zero slope) exactly where the
    // fillet ends and the fillet flows into the side without a knee. Above it
    // the dip is short, which is what gives the drop its convex shoulder.
    down: vw - frame.p,
    up,
    delta: pinch * frame.l / 2,
    drift,
  }
}

/**
 * Samples one side between two heights, bottom to top, with the profile's
 * exact slope. `squash` scales the heights after the profile is read, which
 * is how a remnant sinks.
 *
 * Exact slopes rather than Catmull-Rom's chords (the prototype's choice):
 * where the profile bends within a sample or two of an end, the chord is off
 * by up to ~50° at the base of a short neck, and the fillet that has to meet
 * it either kinks or, following the chord, balloons to twice its radius.
 */
function sampleSide(pr: Profile, from: number, to: number, sign: 1 | -1, squash = 1): Sample[] {
  const samples: Sample[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const v = from + ((to - from) * i) / SAMPLES
    samples.push({
      p: [axis(pr, v) + sign * halfWidth(pr, v), v * squash],
      t: [axisSlope(pr, v) + sign * halfWidthSlope(pr, v), squash],
    })
  }
  return samples
}

/** Cubic Hermite through the samples (parameter step `step`), as cubic
 *  segments starting from the current point. */
function hermite(samples: readonly Sample[], step: number): Cmd[] {
  const k = step / 3
  const out: Cmd[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!
    const b = samples[i + 1]!
    out.push(['C', [a.p[0] + a.t[0] * k, a.p[1] + a.t[1] * k], [b.p[0] - b.t[0] * k, b.p[1] - b.t[1] * k], b.p])
  }
  return out
}

/** The same curve walked the other way. */
function reversed(samples: readonly Sample[]): Sample[] {
  return samples.map(s => ({ p: s.p, t: [-s.t[0], -s.t[1]] as Pt })).reverse()
}

function slopeOf(sample: Sample): number {
  return Math.abs(sample.t[1]) > EPS ? clamp(sample.t[0] / sample.t[1], -MAX_SLOPE, MAX_SLOPE) : 0
}

interface Corner {
  ctrl: Pt
  /** The corner's end on the straight line. */
  foot: Pt
}

/**
 * The quadratic corner joining a side to the straight line v = level.
 *
 * The control point is where the side's tangent at `end` meets that line, so
 * the join has no kink even while the side leans; on an upright side it is
 * the plain square-corner control point uiarc uses. The corner's other end
 * sits `leg` px along the line from the control point.
 */
function corner(end: Sample, level: number, leg: number): Corner {
  const ctrl: Pt = [end.p[0] + slopeOf(end) * (level - end.p[1]), level]
  return { ctrl, foot: [ctrl[0] + leg, level] }
}

/** Two corners on one straight line whose legs would cross meet at the
 *  midpoint of their control points instead. */
function meet(left: Corner, right: Corner): void {
  if (left.foot[0] <= right.foot[0])
    return
  const mid: Pt = [(left.ctrl[0] + right.ctrl[0]) / 2, left.foot[1]]
  left.foot = mid
  right.foot = mid
}

interface Outline {
  cmds: Cmd[]
  /** Where the outline leaves and rejoins the edge, along u. */
  from: number
  to: number
}

/** A bud still joined to the body, stretched or not: fillet, left side, outer
 *  corners, right side, fillet. Starts with a line to the left fillet's foot. */
function budOutline(pr: Profile, fillet: number, cornerRadius: number, top: number): Outline {
  const sideTop = Math.max(fillet, top - cornerRadius)
  const step = (sideTop - fillet) / SAMPLES
  const left = sampleSide(pr, fillet, sideTop, -1)
  const right = sampleSide(pr, fillet, sideTop, 1)
  const n = SAMPLES
  const baseLeft = corner(left[0]!, 0, -fillet)
  const baseRight = corner(right[0]!, 0, fillet)
  const topLeft = corner(left[n]!, top, cornerRadius)
  const topRight = corner(right[n]!, top, -cornerRadius)
  meet(topLeft, topRight)
  return {
    cmds: [
      ['L', baseLeft.foot],
      ['Q', baseLeft.ctrl, left[0]!.p],
      ...hermite(left, step),
      ['Q', topLeft.ctrl, topLeft.foot],
      ['L', topRight.foot],
      ['Q', topRight.ctrl, right[n]!.p],
      ...hermite(reversed(right), step),
      ['Q', baseRight.ctrl, baseRight.foot],
    ],
    from: baseLeft.foot[0],
    to: baseRight.foot[0],
  }
}

/** What a snapped neck leaves on the body: the lower half of the neck with
 *  the waist closed to a point, squashed toward the edge as it retracts. */
function remnantOutline(pr: Profile, fillet: number, squash: number): Outline {
  const step = (pr.vw - fillet) / SAMPLES
  const left = sampleSide(pr, fillet, pr.vw, -1, squash)
  const right = sampleSide(pr, fillet, pr.vw, 1, squash)
  const baseLeft = corner(left[0]!, 0, -fillet)
  const baseRight = corner(right[0]!, 0, fillet)
  // The half-width is 0 at the apex, so the right side starts where the left
  // one ends, both upright: the point is a cusp.
  return {
    cmds: [
      ['L', baseLeft.foot],
      ['Q', baseLeft.ctrl, left[0]!.p],
      ...hermite(left, step),
      ...hermite(reversed(right), step),
      ['Q', baseRight.ctrl, baseRight.foot],
    ],
    from: baseLeft.foot[0],
    to: baseRight.foot[0],
  }
}

/** A drop's final inner end: a straight edge and a round corner of `radius`,
 *  then the upright side to `top`. Sampled evenly by length, from the middle
 *  of the inner edge outward; derivatives are per unit of the 0..1 parameter. */
function roundedSide(half: number, radius: number, top: number, sign: 1 | -1): Sample[] {
  const flat = Math.max(0, half - radius)
  const arc = (Math.PI / 2) * radius
  const length = flat + arc + Math.max(0, top - radius)
  const samples: Sample[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const s = (length * i) / SAMPLES
    if (s <= flat) {
      samples.push({ p: [sign * s, 0], t: [sign * length, 0] })
    }
    else if (s <= flat + arc && radius > EPS) {
      const angle = (s - flat) / radius
      samples.push({
        p: [sign * (flat + radius * Math.sin(angle)), radius * (1 - Math.cos(angle))],
        t: [sign * length * Math.cos(angle), length * Math.sin(angle)],
      })
    }
    else {
      samples.push({ p: [sign * half, radius + (s - flat - arc)], t: [0, length] })
    }
  }
  return samples
}

/** The drop's inner end as the neck left it: the tail of the upper half of
 *  the neck, point at the middle. Sampled evenly by height up to `top`. */
function tailSide(pr: Profile, top: number, sign: 1 | -1): Sample[] {
  return sampleSide(pr, 0, top, sign).map(s => ({ p: s.p, t: [s.t[0] * top, s.t[1] * top] as Pt }))
}

interface Loose {
  edge: FusionSurfaceEdge
  cmds: Cmd[]
  start: Pt
}

/**
 * A drop, clockwise like the body so the two union under nonzero.
 *
 * Its sides are a blend, by `tail`, of the pointed tail the neck left and the
 * rounded inner end it settles into, taken sample for sample from the middle
 * of the inner end outward. The point therefore stays a point while it draws
 * in, flattening into the straight inner edge as the corners round out; the
 * two halves meet in the middle in a cusp at tail = 1 and in a straight line
 * at 0. Blending the dip's depth instead chamfered the end into a trapezoid
 * the moment the neck broke, while the remnant on the body was still pointed.
 */
function dropOutline(
  centre: number,
  bottom: number,
  height: number,
  settled: { half: number, radius: number, top: number },
  broken: { profile: Profile, top: number } | null,
  tail: number,
  outerRadius: number,
  edge: FusionSurfaceEdge,
): Loose {
  const side = (sign: 1 | -1): Sample[] => {
    const rounded = roundedSide(settled.half, settled.radius, settled.top, sign)
    const pointed = broken ? tailSide(broken.profile, broken.top, sign) : rounded
    return rounded.map((r, i) => {
      const q = pointed[i]!
      const mix = (a: number, b: number): number => a + (b - a) * tail
      return {
        p: [centre + mix(r.p[0], q.p[0]), bottom + mix(r.p[1], q.p[1])],
        t: [mix(r.t[0], q.t[0]), mix(r.t[1], q.t[1])],
      }
    })
  }
  const step = 1 / SAMPLES
  const left = side(-1)
  const right = side(1)
  const n = SAMPLES
  const top = bottom + height
  const topLeft = corner(left[n]!, top, outerRadius)
  const topRight = corner(right[n]!, top, -outerRadius)
  meet(topLeft, topRight)
  return {
    edge,
    start: left[0]!.p,
    cmds: [
      ...hermite(left, step),
      ['Q', topLeft.ctrl, topLeft.foot],
      ['L', topRight.foot],
      ['Q', topRight.ctrl, right[n]!.p],
      ...hermite(reversed(right), step),
    ],
  }
}

/** A drop scaled by `s` about `origin`. Every command is a polynomial curve,
 *  so scaling its points scales the curve exactly. */
function scaleAbout(drop: Loose, origin: Pt, s: number): Loose {
  const at = (p: Pt): Pt => [origin[0] + (p[0] - origin[0]) * s, origin[1] + (p[1] - origin[1]) * s]
  return {
    edge: drop.edge,
    start: at(drop.start),
    cmds: drop.cmds.map((cmd): Cmd => {
      if (cmd[0] === 'L')
        return ['L', at(cmd[1])]
      if (cmd[0] === 'Q')
        return ['Q', at(cmd[1]), at(cmd[2])]
      return ['C', at(cmd[1]), at(cmd[2]), at(cmd[3])]
    }),
  }
}

interface Attached extends Outline {
  id: string
  edge: FusionSurfaceEdge
}

function mapper(edge: FusionSurfaceEdge, width: number, height: number): (p: Pt) => Pt {
  switch (edge) {
    case 'right':
      return ([u, v]) => [width + v, u]
    case 'bottom':
      return ([u, v]) => [width - u, height + v]
    case 'left':
      return ([u, v]) => [-v, height - u]
    default:
      return ([u, v]) => [u, -v]
  }
}

function rectOf(id: string, edge: FusionSurfaceEdge, width: number, height: number, u0: number, u1: number, v0: number, v1: number): FusionSurfaceRect {
  const along = u1 - u0
  const out = v1 - v0
  switch (edge) {
    case 'right':
      return { id, edge, x: width + v0, y: u0, width: out, height: along }
    case 'bottom':
      return { id, edge, x: width - u1, y: height + v0, width: along, height: out }
    case 'left':
      return { id, edge, x: -v1, y: height - u1, width: out, height: along }
    default:
      return { id, edge, x: u0, y: -v1, width: along, height: out }
  }
}

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(Number.isFinite(r) ? r : 0)
}

function emit(cmds: readonly Cmd[], map: (p: Pt) => Pt): string {
  const pt = (p: Pt): string => {
    const [x, y] = map(p)
    return `${fmt(x)} ${fmt(y)}`
  }
  let out = ''
  for (const cmd of cmds) {
    if (cmd[0] === 'L')
      out += ` L ${pt(cmd[1])}`
    else if (cmd[0] === 'Q')
      out += ` Q ${pt(cmd[1])} ${pt(cmd[2])}`
    else
      out += ` C ${pt(cmd[1])} ${pt(cmd[2])} ${pt(cmd[3])}`
  }
  return out
}

function normalizeEdge(edge: unknown): FusionSurfaceEdge {
  return edge === 'right' || edge === 'bottom' || edge === 'left' ? edge : 'top'
}

/**
 * The surface as one SVG path `d`: the body (unless `includeBody` is false),
 * every attached bud or neck merged into the body's outline, and every drop
 * as its own closed subpath. Also returns where each attached shape meets the
 * body (`spans`) and each bud's current outer box (`rects`).
 *
 * Buds on one edge must not overlap. Out-of-range or non-finite numbers
 * degrade to not drawing the bud; the output never contains NaN or Infinity.
 */
export function fusionSurfacePath(input: FusionSurfaceGeometryInput): FusionSurfaceGeometry {
  const width = Math.max(0, finite(input.width, 0))
  const height = Math.max(0, finite(input.height, 0))
  const spans: FusionSurfaceSpan[] = []
  const rects: FusionSurfaceRect[] = []
  if (!(width > 0 && height > 0))
    return { d: '', spans, rects }

  const radius = clamp(finite(input.radius, DEFAULT_RADIUS), 0, Math.min(width, height) / 2)
  const overlap = Math.max(0, finite(input.baseOverlap, DEFAULT_OVERLAP))
  const attached: Record<FusionSurfaceEdge, Attached[]> = { top: [], right: [], bottom: [], left: [] }
  const loose: Loose[] = []

  const buds: readonly (FusionSurfaceBudShape | null | undefined)[] = Array.isArray(input.buds) ? input.buds : []
  buds.forEach((bud, index) => {
    if (!bud || typeof bud !== 'object')
      return
    const id = String(bud.id ?? index)
    const edge = normalizeEdge(bud.edge)
    const length = edge === 'top' || edge === 'bottom' ? width : height
    // Bottom and left run against the reading direction in local u, so the
    // public "from the left / from the top" numbers are mirrored going in.
    const mirrored = edge === 'bottom' || edge === 'left'
    const toLocal = (along: number): number => (mirrored ? length - along : along)
    const driftSign = mirrored ? -1 : 1
    const cornerRadius = Math.max(0, finite(bud.radius, radius))
    const fillet = Math.max(0, finite(bud.fillet, DEFAULT_FILLET))
    const detach = Math.max(0, finite(bud.detach, 0))
    const drift = driftSign * finite(bud.drift, 0)
    const frame = resolveFrame(
      length,
      radius,
      toLocal(finite(bud.center, length / 2)),
      Math.max(0, finite(bud.width, 0)),
      Math.max(0, finite(bud.height, 0)),
      cornerRadius,
      fillet,
    )

    const addAttached = (shape: Outline): void => {
      attached[edge].push({ id, edge, ...shape })
      const [from, to] = mirrored ? [length - shape.to, length - shape.from] : [shape.from, shape.to]
      spans.push({ id, edge, from, to })
    }

    const split = bud.split && typeof bud.split === 'object' ? bud.split : null
    if (!split) {
      if (!frame)
        return
      const pr = neckProfile(frame, detach, clamp(finite(bud.pinch, 0), 0, 1), drift)
      const top = frame.e + detach
      addAttached(budOutline(pr, frame.p, frame.m, top))
      const centre = axis(pr, top)
      rects.push(rectOf(id, edge, width, height, centre - frame.l / 2, centre + frame.l / 2, top - frame.e, top))
      return
    }

    // After the break. The bud as it was at that frame fixes the remnant and
    // the tail; the current values move the drop.
    const splitDetach = Math.max(0, finite(split.detach, 0))
    const splitDrift = driftSign * finite(split.drift, 0)
    const was = resolveFrame(
      length,
      radius,
      toLocal(finite(split.center, length / 2)),
      Math.max(0, finite(split.width, 0)),
      Math.max(0, finite(split.height, 0)),
      cornerRadius,
      fillet,
    )
    const broken = was ? neckProfile(was, splitDetach, 1, splitDrift) : null

    const remnant = clamp(finite(split.remnant, 0), 0, 1)
    if (was && broken && broken.vw * remnant >= MIN_VISIBLE)
      addAttached(remnantOutline(broken, was.p, remnant))

    if (!frame)
      return
    // With no usable break frame there is no tail to draw in: the drop is
    // already its own rounded rectangle.
    const tail = was && broken ? clamp(finite(split.tail, 0), 0, 1) : 0
    // A drop closes toward, and opens from, its own centre on both axes.
    // Lowering its height the way an attached bud closes kept its width and
    // left a line hanging in mid-air.
    const scale = Math.max(0, finite(split.scale, 1))
    const top = frame.e + detach
    // At the break the drop reaches from the waist to the outer end; as the
    // tail draws in it settles to the bud's own height.
    const atBreak = was && broken ? was.e + splitDetach - broken.vw : frame.e
    const dropHeight = frame.e + (atBreak - frame.e) * tail
    if (!(dropHeight * scale >= MIN_VISIBLE && frame.l * scale >= MIN_VISIBLE))
      return
    const bottom = top - dropHeight
    const centre = frame.c + drift
    const outerRadius = Math.min(frame.m, dropHeight)
    const half = frame.l / 2
    // The neck's upper half, re-expressed about the drop: waist at the drop's
    // inner end, centred on the drop, fully pinched. Leaning back toward the
    // body by the drift it had at the break.
    const pointed = was && broken
      ? {
          profile: { c: -broken.drift, half, vw: 0, down: broken.down, up: broken.up, delta: half, drift: broken.drift },
          top: Math.max(0, atBreak - outerRadius),
        }
      : null
    const settled = {
      half,
      radius: Math.min(outerRadius, Math.max(0, frame.e - outerRadius)),
      top: Math.max(0, frame.e - outerRadius),
    }
    const middle: Pt = [centre, bottom + dropHeight / 2]
    const drop = dropOutline(centre, bottom, dropHeight, settled, pointed, tail, outerRadius, edge)
    loose.push(scale === 1 ? drop : scaleAbout(drop, middle, scale))
    rects.push(rectOf(
      id,
      edge,
      width,
      height,
      centre - half * scale,
      centre + half * scale,
      middle[1] - (dropHeight / 2) * scale,
      middle[1] + (dropHeight / 2) * scale,
    ))
  })

  const parts: string[] = []
  if (input.includeBody !== false) {
    // Straight-part end and corner-arc end of each edge, clockwise from the
    // top-left corner.
    const ends: Record<FusionSurfaceEdge, [number, number, number, number]> = {
      top: [width - radius, 0, width, radius],
      right: [width, height - radius, width - radius, height],
      bottom: [radius, height, 0, height - radius],
      left: [0, radius, radius, 0],
    }
    let d = `M ${fmt(radius)} 0`
    for (const edge of EDGES) {
      const map = mapper(edge, width, height)
      for (const shape of attached[edge].sort((a, b) => a.from - b.from))
        d += emit(shape.cmds, map)
      const [lx, ly, ax, ay] = ends[edge]
      d += ` L ${fmt(lx)} ${fmt(ly)}`
      if (radius > 0)
        d += ` A ${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(ax)} ${fmt(ay)}`
    }
    parts.push(`${d} Z`)
  }
  else {
    for (const edge of EDGES) {
      const map = mapper(edge, width, height)
      for (const shape of attached[edge]) {
        // Close each shape through the body, `overlap` px deep, so it covers
        // the host's own border where it joins.
        const [, ...rest] = shape.cmds
        const [sx, sy] = map([shape.from, 0])
        const [ex, ey] = map([shape.to, -overlap])
        const [bx, by] = map([shape.from, -overlap])
        parts.push(`M ${fmt(sx)} ${fmt(sy)}${emit(rest, map)} L ${fmt(ex)} ${fmt(ey)} L ${fmt(bx)} ${fmt(by)} Z`)
      }
    }
  }
  for (const drop of loose) {
    const map = mapper(drop.edge, width, height)
    const [sx, sy] = map(drop.start)
    parts.push(`M ${fmt(sx)} ${fmt(sy)}${emit(drop.cmds, map)} Z`)
  }

  return { d: parts.join(' '), spans, rects }
}
