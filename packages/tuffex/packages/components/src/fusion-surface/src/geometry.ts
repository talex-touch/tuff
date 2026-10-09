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
// No Vue and no DOM, so a host can draw with it directly.
//
// The attached bud follows the uiarc.dev Dock (technique observed 2026-09-25,
// no code taken): one path recomputed from a few spring values, a concave
// quadratic fillet where the bud meets the body and a convex quadratic corner
// on its outer end, the bud clamped onto the straight part of the edge.
//
// The neck is a liquid bridge. Pulled away, the bud is a drop with its own
// underside, and the bridge joins that underside to the body: each side is a
// concave flare out of the body, a waist, and a concave flare into the drop,
// both flares quadratic and tangent to the surface they meet, so a side only
// ever turns one way. As the neck narrows the waist draws in, the flares
// spread into a low mound on the body and well inside the drop's corners, and
// the drop's underside comes free with its corners rounding. Unpinched, the
// flares are the fillet and nothing, and the bud is the attached one.
//
// Every edge has local coordinates: u runs along the edge in the path's
// clockwise direction, v points out of the body. Outlines are built there
// once and mapped onto whichever edge they sit on.

type Pt = readonly [number, number]
type Cmd = readonly ['L', Pt] | readonly ['Q', Pt, Pt]

/** How far the bridge's foot spreads along the body as the neck narrows, as
 *  a share of how far the waist has drawn in: a liquid bridge stands on a
 *  low mound, not on the bud's full width. */
const FOOT_SPREAD = 0.3
/** The same where the bridge meets the drop: well inside its corners, so the
 *  underside around it comes free and its corners can round. */
const DROP_SPREAD = 0.3
/** Where the waist settles, as a share of the gap: the middle, so the stub
 *  left on the body and the drop's tail are alike when the neck snaps. */
const WAIST_AT = 0.5
/** Pinch by which the flares fill the gap: from there on a side is one
 *  concave curve, with no straight run left at the waist to read as a slot. */
const FLARE_FILLS = 0.35
/** Under this height (px) a bud, remnant or drop is not drawn: below a device
 *  pixel it only flickers. uiarc skips the same range. */
const MIN_VISIBLE = 0.5
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

/**
 * The default neck: nothing for the first quarter of `breakAt`, then the
 * square of a smoothstep, fully closed at `breakAt` (it snaps at about 96%).
 *
 * Squared, the curve starts with zero slope and zero curvature and stays
 * small until the neck has stretched about half of `breakAt`, then closes
 * quickly, the way a stretched liquid bridge gives way late.
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

/** A bud's bridge at one moment, in its edge's local coordinates. */
interface Neck {
  c: number
  /** Half the bud's width. */
  half: number
  /** Half-width at the waist: `half` unpinched, 0 closed. */
  waist: number
  /** How far the flare out of the body reaches past the waist along the
   *  edge, and how high it climbs. Unpinched, the fillet. */
  footReach: number
  footHeight: number
  /** The same for the flare into the drop, measured down from its underside. */
  dropReach: number
  dropHeight: number
  /** Height of the drop's underside. */
  inner: number
  /** Corner radius where the drop's underside meets its sides. */
  innerRadius: number
  /** Height of the outer end. */
  top: number
  outerRadius: number
  /** Sideways offset of the drop; the bridge leans with it. */
  drift: number
}

function neckOf(frame: Frame, detach: number, pinch: number, drift: number): Neck {
  const half = frame.l / 2
  const waist = half * (1 - pinch)
  const drawn = half - waist
  const top = frame.e + detach
  // The underside never sits inside the fillet, nor above the outer corners:
  // a bud pulled less than its fillet is still one column.
  const inner = clamp(detach, frame.p, top - frame.m)
  // Together the two flares fill the gap from FLARE_FILLS on, and leave a
  // straight waist of (inner - p) * (1 - fill) before that.
  const fill = smoothstep(0, FLARE_FILLS, pinch)
  const footHeight = frame.p + (WAIST_AT * inner - frame.p) * fill
  const dropHeight = (1 - WAIST_AT) * inner * fill
  const footReach = frame.p + FOOT_SPREAD * drawn
  const dropReach = DROP_SPREAD * drawn
  // What the bridge leaves bare of the underside on each side holds the corner.
  const bare = half - waist - dropReach
  const innerRadius = Math.max(0, Math.min(frame.m, bare, top - frame.m - inner))
  return { c: frame.c, half, waist, footReach, footHeight, dropReach, dropHeight, inner, innerRadius, top, outerRadius: frame.m, drift }
}

/** The drift as a shear: nothing at the body, the full drift from the
 *  drop's underside out. Affine, so every curve is mapped exactly and
 *  tangents that met stay met. */
function leaner(n: Neck): (p: Pt) => Pt {
  return ([u, v]) => [u + n.drift * clamp(v / Math.max(n.inner, EPS), 0, 1), v]
}

interface Outline {
  cmds: Cmd[]
  /** Where the outline leaves and rejoins the edge, along u. */
  from: number
  to: number
}

/**
 * A bud still joined to the body, stretched or not. Left side, bottom up:
 * flare out of the body, waist, flare into the drop, the drop's underside to
 * its corner, the corner, the side, the outer corner; then the outer edge and
 * the right side mirrored, top down. One command structure at every pinch.
 * Starts with a line to the left foot.
 */
function bridgeOutline(n: Neck): Outline {
  const lean = leaner(n)
  const at = (sign: 1 | -1, along: number, v: number): Pt => lean([n.c + sign * along, v])
  const left = (s: 1 | -1) => ({
    foot: at(s, n.waist + n.footReach, 0),
    footCtrl: at(s, n.waist, 0),
    waistLow: at(s, n.waist, n.footHeight),
    waistHigh: at(s, n.waist, n.inner - n.dropHeight),
    dropCtrl: at(s, n.waist, n.inner),
    dropFoot: at(s, n.waist + n.dropReach, n.inner),
    cornerFrom: at(s, n.half - n.innerRadius, n.inner),
    cornerCtrl: at(s, n.half, n.inner),
    cornerTo: at(s, n.half, n.inner + n.innerRadius),
    sideTop: at(s, n.half, n.top - n.outerRadius),
    topCtrl: at(s, n.half, n.top),
    topFoot: at(s, n.half - n.outerRadius, n.top),
  })
  const l = left(-1)
  const r = left(1)
  return {
    cmds: [
      ['L', l.foot],
      ['Q', l.footCtrl, l.waistLow],
      ['L', l.waistHigh],
      ['Q', l.dropCtrl, l.dropFoot],
      ['L', l.cornerFrom],
      ['Q', l.cornerCtrl, l.cornerTo],
      ['L', l.sideTop],
      ['Q', l.topCtrl, l.topFoot],
      ['L', r.topFoot],
      ['Q', r.topCtrl, r.sideTop],
      ['L', r.cornerTo],
      ['Q', r.cornerCtrl, r.cornerFrom],
      ['L', r.dropFoot],
      ['Q', r.dropCtrl, r.waistHigh],
      ['L', r.waistLow],
      ['Q', r.footCtrl, r.foot],
    ],
    from: l.foot[0],
    to: r.foot[0],
  }
}

/** What a snapped neck leaves on the body: the flares out of it, open at the
 *  top by the waist they had (about a pixel), squashed toward the edge as it
 *  sinks. */
function remnantOutline(n: Neck, squash: number): Outline {
  const lean = leaner(n)
  const height = n.footHeight * squash
  const at = (sign: 1 | -1, along: number, v: number): Pt => lean([n.c + sign * along, v])
  const footL = at(-1, n.waist + n.footReach, 0)
  const footR = at(1, n.waist + n.footReach, 0)
  return {
    cmds: [
      ['L', footL],
      ['Q', at(-1, n.waist, 0), at(-1, n.waist, height)],
      ['L', at(1, n.waist, height)],
      ['Q', at(1, n.waist, 0), footR],
    ],
    from: footL[0],
    to: footR[0],
  }
}

interface Loose {
  edge: FusionSurfaceEdge
  cmds: Cmd[]
  start: Pt
}

/**
 * A drop, clockwise like the body so the two union under nonzero: a rounded
 * rectangle of the bud's size, with the flares the neck left on its underside
 * hanging as a tail. `tail` 1 is the tail as the neck snapped, 0 a flat
 * underside; its corners go from the radius they had at the break to the
 * settled one along with it. Starts at the tip of the tail.
 */
function dropOutline(
  centre: number,
  bottom: number,
  frame: Frame,
  broken: Neck | null,
  tail: number,
  edge: FusionSurfaceEdge,
): Loose {
  const half = frame.l / 2
  const top = bottom + frame.e
  const outer = Math.min(frame.m, frame.e)
  const settled = Math.min(outer, Math.max(0, frame.e - outer))
  const radius = Math.max(0, Math.min(settled + ((broken?.innerRadius ?? settled) - settled) * tail, half, frame.e - outer))
  const waist = broken ? Math.min(broken.waist, half) : 0
  const reach = broken ? Math.min(waist + broken.dropReach, half - radius) : 0
  const depth = broken ? broken.dropHeight * tail : 0
  // Leaning back toward the body by the drift it had at the break.
  const lean = broken ? -broken.drift * depth / Math.max(broken.inner, EPS) : 0
  const at = (sign: 1 | -1, along: number, v: number): Pt => [centre + sign * along, v]
  const tip = (sign: 1 | -1): Pt => [centre + sign * waist + lean, bottom - depth]
  const side = (s: 1 | -1) => ({
    tailCtrl: at(s, waist, bottom),
    tailFoot: at(s, Math.max(waist, reach), bottom),
    cornerFrom: at(s, half - radius, bottom),
    cornerCtrl: at(s, half, bottom),
    cornerTo: at(s, half, bottom + radius),
    sideTop: at(s, half, top - outer),
    topCtrl: at(s, half, top),
    topFoot: at(s, half - outer, top),
  })
  const l = side(-1)
  const r = side(1)
  return {
    edge,
    start: tip(-1),
    cmds: [
      ['Q', l.tailCtrl, l.tailFoot],
      ['L', l.cornerFrom],
      ['Q', l.cornerCtrl, l.cornerTo],
      ['L', l.sideTop],
      ['Q', l.topCtrl, l.topFoot],
      ['L', r.topFoot],
      ['Q', r.topCtrl, r.sideTop],
      ['L', r.cornerTo],
      ['Q', r.cornerCtrl, r.cornerFrom],
      ['L', r.tailFoot],
      ['Q', r.tailCtrl, tip(1)],
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
    cmds: drop.cmds.map((cmd): Cmd => (cmd[0] === 'L' ? ['L', at(cmd[1])] : ['Q', at(cmd[1]), at(cmd[2])])),
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
    else
      out += ` Q ${pt(cmd[1])} ${pt(cmd[2])}`
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
      const neck = neckOf(frame, detach, clamp(finite(bud.pinch, 0), 0, 1), drift)
      addAttached(bridgeOutline(neck))
      const centre = frame.c + drift
      rects.push(rectOf(id, edge, width, height, centre - frame.l / 2, centre + frame.l / 2, neck.top - frame.e, neck.top))
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
    const broken = was ? neckOf(was, splitDetach, 1, splitDrift) : null

    const remnant = clamp(finite(split.remnant, 0), 0, 1)
    if (broken && broken.footHeight * remnant >= MIN_VISIBLE)
      addAttached(remnantOutline(broken, remnant))

    if (!frame)
      return
    // With no usable break frame there is no tail to draw in: the drop is
    // already its own rounded rectangle.
    const tail = broken ? clamp(finite(split.tail, 0), 0, 1) : 0
    // A drop closes toward, and opens from, its own centre on both axes.
    // Lowering its height the way an attached bud closes kept its width and
    // left a line hanging in mid-air.
    const scale = Math.max(0, finite(split.scale, 1))
    if (!(frame.e * scale >= MIN_VISIBLE && frame.l * scale >= MIN_VISIBLE))
      return
    const top = frame.e + detach
    const bottom = top - frame.e
    const centre = frame.c + drift
    const half = frame.l / 2
    const middle: Pt = [centre, bottom + frame.e / 2]
    const drop = dropOutline(centre, bottom, frame, broken, tail, edge)
    loose.push(scale === 1 ? drop : scaleAbout(drop, middle, scale))
    rects.push(rectOf(
      id,
      edge,
      width,
      height,
      centre - half * scale,
      centre + half * scale,
      middle[1] - (frame.e / 2) * scale,
      middle[1] + (frame.e / 2) * scale,
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
