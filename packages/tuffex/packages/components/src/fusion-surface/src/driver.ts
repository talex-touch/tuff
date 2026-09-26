import type {
  FusionSurfaceBud,
  FusionSurfaceBudShape,
  FusionSurfaceEdge,
  FusionSurfaceRect,
  FusionSurfaceTransition,
} from './types'
import { springSteps } from '../../liquid/src/spring'
import { FUSION_SURFACE_BREAK_PINCH, fusionSurfacePath, fusionSurfacePinch } from './geometry'

// One rAF loop per TxFusionSurface. Every value a bud animates is a spring
// with its own velocity (springSteps, the shared presets), so retargeting in
// the middle of a motion bends it instead of restarting it. Each frame writes
// the path `d` once and each bud layer's transform/opacity/filter directly;
// Vue never re-renders for a frame. The loop sleeps once everything is at
// rest and wakes on the next change.

interface Channel {
  x: number
  v: number
  to: number
}

interface Tolerance {
  position: number
  velocity: number
}

/** Rest thresholds: px channels settle within 0.01px, 0..1 channels within
 *  1e-4 (a hundredth of a pixel on a 100px bud). */
const PX: Tolerance = { position: 0.01, velocity: 0.1 }
const UNIT: Tolerance = { position: 1e-4, velocity: 1e-3 }

/** The remnant and the tail retract on the stiff preset whatever the surface's
 *  transition is: a snapped neck recoils, it does not ease. */
const RECOIL: FusionSurfaceTransition = 'snappy'

/** Content stays invisible for the first 45% of opening and is fully in at
 *  85%, so it never shows through a bud too small to hold it. */
const CONTENT_FROM = 0.45
const CONTENT_SPAN = 0.4

interface SplitState {
  center: number
  width: number
  height: number
  detach: number
  drift: number
  remnant: Channel
  tail: Channel
  /** How open the drop is drawn at full size: `open` at the break, raised as
   *  the bud opens further, never above 1; 1 for a drop that never had a neck
   *  on screen. Below it, `open` scales the drop about its centre instead
   *  (see `dropScale`). */
  ref: number
}

interface BudState {
  decl: FusionSurfaceBud
  edge: FusionSurfaceEdge
  open: Channel
  center: Channel
  width: Channel
  height: Channel
  detach: Channel
  drift: Channel
  leaving: boolean
  split: SplitState | null
  /** What the layer element last received, so an unchanged frame writes
   *  nothing. Tied to the element: a fresh one gets everything again. */
  written: { el: HTMLElement | null, transform: string, opacity: string, filter: string, progress: string }
}

export interface FusionSurfaceDriverHooks {
  path: () => SVGPathElement | null
  layer: (id: string) => HTMLElement | null
  onBreak: (id: string) => void
  onSettle: () => void
  /** A bud removed from `buds` has finished closing and is gone. */
  onLeave: (id: string) => void
}

export interface FusionSurfaceDriverOptions {
  radius: number
  fillet: number
  breakAt: number
  transition: FusionSurfaceTransition
  contentBlur: number
  reducedMotion: boolean
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function fixed(value: number, digits: number): string {
  const r = Number(value.toFixed(digits))
  return String(Number.isFinite(r) ? r : 0)
}

export function fusionSurfaceOpenTarget(open: FusionSurfaceBud['open']): number {
  if (open === undefined || open === true)
    return 1
  if (open === false)
    return 0
  return clamp(num(open, 1), 0, 1)
}

function edgeOf(decl: FusionSurfaceBud): FusionSurfaceEdge {
  const edge = decl.edge
  return edge === 'right' || edge === 'bottom' || edge === 'left' ? edge : 'top'
}

/** The layer's CSS box: `width` runs along the edge, `height` out of it. */
export function fusionSurfaceLayerSize(decl: FusionSurfaceBud): [number, number] {
  const along = Math.max(0, num(decl.width, 0))
  const out = Math.max(0, num(decl.height, 0))
  const edge = edgeOf(decl)
  return edge === 'left' || edge === 'right' ? [out, along] : [along, out]
}

function channel(x: number): Channel {
  return { x, v: 0, to: x }
}

/**
 * How large a drop is drawn, about its own centre: `open / ref`, at most 1.
 *
 * An attached bud opens and closes by its height alone, which is right while
 * it grows out of the edge. A drop has left the edge, and closing it the same
 * way lowered its outer end onto its inner one: a full-width line hanging in
 * mid-air. So below `ref` a drop scales on both axes instead. At the break
 * `ref` is `open` itself, so nothing jumps there; a drop still opening keeps
 * growing by its height until it is fully open (above 1, as a bouncy spring
 * overshoots, it stretches like an attached bud and never scales past 1); from
 * then on closing shrinks it toward its centre.
 */
function dropScale(split: SplitState, open: number): number {
  return split.ref > 0 ? Math.min(1, Math.max(0, open) / split.ref) : 0
}

function atRest(c: Channel, tol: Tolerance): boolean {
  return Math.abs(c.to - c.x) <= tol.position && Math.abs(c.v) <= tol.velocity
}

/** Not exactly on its target yet; a frame will move or snap it. */
function pending(c: Channel): boolean {
  return c.x !== c.to || c.v !== 0
}

function snap(c: Channel): void {
  c.x = c.to
  c.v = 0
}

/** Advances one channel, snapping it onto its target once it is at rest. */
function advance(c: Channel, config: FusionSurfaceTransition, dt: number, tol: Tolerance): void {
  if (!atRest(c, tol))
    [c.x, c.v] = springSteps(c.x, c.v, c.to, config, dt)
  if (atRest(c, tol))
    snap(c)
}

export class FusionSurfaceDriver {
  private readonly buds = new Map<string, BudState>()
  private readonly hooks: FusionSurfaceDriverHooks
  private options: FusionSurfaceDriverOptions
  private size = { width: 0, height: 0 }
  private raf = 0
  private lastNow = 0
  private lastD: string | null = null
  private destroyed = false

  constructor(hooks: FusionSurfaceDriverHooks, options: FusionSurfaceDriverOptions) {
    this.hooks = hooks
    this.options = { ...options }
  }

  configure(options: Partial<FusionSurfaceDriverOptions>): void {
    this.options = { ...this.options, ...options }
    this.retarget()
    this.draw()
    this.wake()
  }

  setSize(width: number, height: number): void {
    const w = Math.max(0, num(width, 0))
    const h = Math.max(0, num(height, 0))
    if (w === this.size.width && h === this.size.height)
      return
    this.size = { width: w, height: h }
    this.retarget()
    this.draw()
    this.wake()
  }

  /** Declarations in, targets out. A new bud starts closed and opens; a bud
   *  that disappears from the list closes before it is dropped. */
  setBuds(decls: readonly FusionSurfaceBud[]): void {
    const seen = new Set<string>()
    for (const decl of decls) {
      if (!decl || seen.has(decl.id))
        continue
      seen.add(decl.id)
      const edge = edgeOf(decl)
      let state = this.buds.get(decl.id)
      // Moving to another edge is a new bud there, not a slide around the corner.
      if (!state || state.edge !== edge) {
        state = this.create(decl, edge)
        this.buds.set(decl.id, state)
      }
      state.decl = decl
      state.leaving = false
    }
    for (const state of this.buds.values()) {
      if (!seen.has(state.decl.id))
        state.leaving = true
    }
    this.retarget()
    this.draw()
    this.wake()
  }

  /** Buds that were removed from the list and are still closing. */
  leavingBuds(): FusionSurfaceBud[] {
    return [...this.buds.values()].filter(state => state.leaving).map(state => state.decl)
  }

  destroy(): void {
    this.destroyed = true
    if (this.raf && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.raf)
    this.raf = 0
    this.buds.clear()
  }

  private create(decl: FusionSurfaceBud, edge: FusionSurfaceEdge): BudState {
    const centred = !Number.isFinite(decl.center)
    return {
      decl,
      edge,
      // Everything but `open` starts where it is going: a new bud grows in
      // place rather than flying in from the corner.
      open: channel(0),
      center: channel(centred ? this.edgeLength(edge) / 2 : num(decl.center, 0)),
      width: channel(Math.max(0, num(decl.width, 0))),
      height: channel(Math.max(0, num(decl.height, 0))),
      detach: channel(Math.max(0, num(decl.detach, 0))),
      drift: channel(num(decl.drift, 0)),
      leaving: false,
      split: null,
      written: { el: null, transform: '', opacity: '', filter: '', progress: '' },
    }
  }

  private edgeLength(edge: FusionSurfaceEdge): number {
    return edge === 'left' || edge === 'right' ? this.size.height : this.size.width
  }

  private retarget(): void {
    for (const state of this.buds.values()) {
      const decl = state.decl
      state.open.to = state.leaving ? 0 : fusionSurfaceOpenTarget(decl.open)
      state.width.to = Math.max(0, num(decl.width, 0))
      state.height.to = Math.max(0, num(decl.height, 0))
      state.detach.to = Math.max(0, num(decl.detach, 0))
      state.drift.to = num(decl.drift, 0)
      if (!Number.isFinite(decl.center)) {
        // No `center`: follow the middle of the edge without springing, so a
        // resize keeps the bud centred instead of sliding it there.
        state.center.to = this.edgeLength(state.edge) / 2
        snap(state.center)
      }
      else {
        // Declaring a centre after following the middle springs from where
        // the bud is, which the following already kept up to date.
        state.center.to = num(decl.center, 0)
      }
    }
  }

  private wake(): void {
    if (this.raf || this.destroyed || typeof requestAnimationFrame !== 'function' || !this.needsFrame())
      return
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Whether a frame would change anything. Waking only then is what keeps
   *  `settle` meaning "a motion finished" rather than "something re-rendered". */
  private needsFrame(): boolean {
    for (const state of this.buds.values()) {
      if ([state.open, state.center, state.width, state.height, state.detach, state.drift].some(pending))
        return true
      const split = state.split
      if (split) {
        if (pending(split.remnant) || pending(split.tail) || this.reopens(state, split))
          return true
      }
      else if (this.breaks(state)) {
        return true
      }
      if (this.gone(state))
        return true
    }
    return false
  }

  /** The neck has narrowed past the break point this frame. */
  private breaks(state: BudState): boolean {
    const height = Math.max(0, state.open.x) * state.height.x
    return height >= 0.5 && fusionSurfacePinch(state.detach.x, this.options.breakAt) >= FUSION_SURFACE_BREAK_PINCH
  }

  private breakCache: { breakAt: number, distance: number } | null = null

  /** The detach at which the default pinch reaches the break point (about
   *  96% of `breakAt`), by bisection; cached per `breakAt`. */
  private breakDistance(): number {
    const breakAt = this.options.breakAt
    if (this.breakCache?.breakAt === breakAt)
      return this.breakCache.distance
    let lo = 0
    let hi = Math.max(1, num(breakAt, 28))
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (fusionSurfacePinch(mid, breakAt) >= FUSION_SURFACE_BREAK_PINCH)
        hi = mid
      else
        lo = mid
    }
    this.breakCache = { breakAt, distance: hi }
    return hi
  }

  /** A closed bud whose remnant has sunk is a fresh bud again: opening it
   *  grows a new one instead of re-inflating the old drop. */
  private reopens(state: BudState, split: SplitState): boolean {
    return state.open.to === 0 && state.open.x === 0 && split.remnant.x === 0
  }

  /** A removed bud that has finished closing. */
  private gone(state: BudState): boolean {
    return state.leaving && state.open.x === 0 && (!state.split || state.split.remnant.x === 0)
  }

  private readonly tick = (now: number): void => {
    this.raf = 0
    if (this.destroyed)
      return
    // Wall-clock dt, capped only against tab-switch gaps: springSteps
    // substeps any gap, so a slow frame never turns into slow motion.
    const dt = this.lastNow ? clamp((now - this.lastNow) / 1000, 1 / 240, 0.25) : 1 / 60
    this.lastNow = now
    this.step(dt)
    // A break or leave listener may have unmounted the surface.
    if (this.destroyed)
      return
    this.draw()
    if (this.needsFrame()) {
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    this.lastNow = 0
    this.hooks.onSettle()
  }

  /** One frame of every spring, then the break, reopen and removal rules. */
  private step(dt: number): void {
    const reduced = this.options.reducedMotion
    const config = this.options.transition
    const broke: string[] = []
    const left: string[] = []

    for (const [id, state] of this.buds) {
      const visible = Math.max(0, state.open.x) * state.height.x >= 0.5
      const channels: [Channel, Tolerance][] = [
        [state.open, UNIT],
        [state.center, PX],
        [state.width, PX],
        [state.height, PX],
        [state.detach, PX],
        [state.drift, PX],
      ]
      for (const [c, tol] of channels) {
        if (reduced)
          snap(c)
        else
          advance(c, config, dt, tol)
      }

      if (!state.split && this.breaks(state)) {
        // A bud that only now became visible, already past the break (added
        // detached, or reopened far out), never had a neck on screen: it is
        // a drop from its first frame, with nothing to recoil, and grows from
        // its centre like any drop that is opening.
        const recoil = visible ? 1 : 0
        state.split = {
          center: state.center.x,
          width: state.width.x,
          height: Math.max(0, state.open.x) * state.height.x,
          // A fast pull can cross the break point by several px in one frame.
          // The neck snapped at the break point; the drop has moved on since.
          detach: Math.min(state.detach.x, this.breakDistance()),
          drift: state.drift.x,
          remnant: { x: recoil, v: 0, to: 0 },
          tail: { x: recoil, v: 0, to: 0 },
          ref: visible ? clamp(state.open.x, 0, 1) : 1,
        }
        // Latched: the neck stays broken even if detach comes back down.
        broke.push(id)
      }

      const split = state.split
      if (split) {
        split.ref = Math.min(1, Math.max(split.ref, state.open.x))
        for (const c of [split.remnant, split.tail]) {
          if (reduced)
            snap(c)
          else
            advance(c, RECOIL, dt, UNIT)
        }
        if (this.reopens(state, split))
          state.split = null
      }

      if (this.gone(state))
        left.push(id)
    }

    for (const id of left)
      this.buds.delete(id)
    for (const id of broke)
      this.hooks.onBreak(id)
    for (const id of left)
      this.hooks.onLeave(id)
  }

  private shapeOf(state: BudState): FusionSurfaceBudShape {
    const split = state.split
    const open = Math.max(0, state.open.x)
    return {
      id: state.decl.id,
      edge: state.edge,
      center: state.center.x,
      width: state.width.x,
      // A drop below `ref` keeps its full size here and shrinks by `scale`.
      height: (split ? Math.max(split.ref, open) : open) * state.height.x,
      radius: Number.isFinite(state.decl.radius) ? state.decl.radius : this.options.radius,
      fillet: this.options.fillet,
      detach: state.detach.x,
      pinch: split ? 0 : fusionSurfacePinch(state.detach.x, this.options.breakAt),
      drift: state.drift.x,
      split: split
        ? {
            center: split.center,
            width: split.width,
            height: split.height,
            detach: split.detach,
            drift: split.drift,
            remnant: split.remnant.x,
            tail: split.tail.x,
            scale: dropScale(split, open),
          }
        : null,
    }
  }

  draw(): void {
    if (this.destroyed)
      return
    const shapes = [...this.buds.values()].map(state => this.shapeOf(state))
    const geometry = fusionSurfacePath({
      width: this.size.width,
      height: this.size.height,
      radius: this.options.radius,
      buds: shapes,
    })
    const path = this.hooks.path()
    if (path && geometry.d !== this.lastD) {
      path.setAttribute('d', geometry.d)
      this.lastD = geometry.d
    }
    const rects = new Map(geometry.rects.map(rect => [rect.id, rect]))
    for (const state of this.buds.values())
      this.writeLayer(state, rects.get(state.decl.id))
  }

  private writeLayer(state: BudState, rect: FusionSurfaceRect | undefined): void {
    const el = this.hooks.layer(state.decl.id)
    if (!el)
      return
    const progress = clamp(state.open.x, 0, 1)
    const shown = rect ? clamp((progress - CONTENT_FROM) / CONTENT_SPAN, 0, 1) : 0
    const blur = Math.max(0, num(this.options.contentBlur, 0)) * (1 - shown)
    const scale = state.split ? dropScale(state.split, state.open.x) : 1
    const next = {
      transform: rect ? placeLayer(rect, fusionSurfaceLayerSize(state.decl), scale) : state.written.transform,
      opacity: fixed(shown, 3),
      filter: blur > 0.01 ? `blur(${fixed(blur, 2)}px)` : 'none',
      progress: fixed(progress, 4),
    }
    const written = state.written.el === el ? state.written : { el, transform: '', opacity: '', filter: '', progress: '' }
    if (next.transform !== written.transform)
      el.style.transform = next.transform
    if (next.opacity !== written.opacity)
      el.style.opacity = next.opacity
    if (next.filter !== written.filter)
      el.style.filter = next.filter
    if (next.progress !== written.progress)
      el.style.setProperty('--tx-fusion-surface-progress', next.progress)
    state.written = { el, ...next }
  }
}

/**
 * Puts the layer's outer edge on the bud's current outer edge, centred along
 * it, so content slides out with the bud and rides away on the drop.
 *
 * `rect` is a drop already drawn at `scale`. Its content goes with it: the
 * layer is placed against the full-size drop, then scaled by the same amount
 * about the drop's centre, so a closing drop takes its content along instead
 * of shrinking out from under it. The layer's `transform-origin` is its
 * top-left corner (see the stylesheet), which is what the translate below
 * assumes.
 */
function placeLayer(rect: FusionSurfaceRect, [width, height]: [number, number], scale: number): string {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const s = scale > 0 && scale < 1 ? scale : 1
  const full = { x: cx - rect.width / s / 2, y: cy - rect.height / s / 2, width: rect.width / s, height: rect.height / s }
  let x = cx - width / 2
  let y = cy - height / 2
  if (rect.edge === 'top')
    y = full.y
  else if (rect.edge === 'bottom')
    y = full.y + full.height - height
  else if (rect.edge === 'right')
    x = full.x + full.width - width
  else
    x = full.x
  if (s === 1)
    return `translate(${fixed(x, 2)}px, ${fixed(y, 2)}px)`
  return `translate(${fixed(cx + (x - cx) * s, 2)}px, ${fixed(cy + (y - cy) * s, 2)}px) scale(${fixed(s, 4)})`
}
