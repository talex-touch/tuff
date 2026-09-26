import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { JellyAxis, JellyScale } from './animation/jelly'
import { computed, onBeforeUnmount, onMounted, shallowRef, toValue } from 'vue'
import { GLIDE, JELLY, jellyScale } from './animation/jelly'
import { hasWindow } from './env'

/** A box in the indicator container's own coordinates (padding-box origin). */
export interface JellyRect {
  x: number
  y: number
  width: number
  height: number
}

export interface JellyVelocity {
  x: number
  y: number
  w: number
  h: number
}

/** `emerge` is the pop as a trip (or a grab) starts; `sink` the thud as it lands. */
export type JellyPhase = 'idle' | 'emerge' | 'sink'

/**
 * How much of the material's deformation shows, relative to the travel axis:
 * 1 is Radio's, 0 is rigid. A full-width row highlight wants almost nothing
 * across its travel, or it swells out of its container.
 */
export interface JellyDeform {
  along?: number
  across?: number
}

/**
 * How the indicator moves. `jelly` is Radio's material: one spring, with
 * squash and stretch while it travels. `glide` is the tabs family's: its two
 * ends ride separate springs, so it lengthens a little and gathers again, and
 * it never scales.
 */
export type JellyMaterial = 'jelly' | 'glide'

/**
 * One spring advanced by `dt` seconds: `[position, velocity]` after the step.
 * The glide material is driven by the library's frame spring,
 * `springSteps` in `components/src/liquid/src/spring.ts` (1/240 s substeps);
 * utils cannot import from components, so glide hosts pass it in.
 */
export type JellySpringStep = (
  position: number,
  velocity: number,
  target: number,
  spring: { stiffness: number, damping: number },
  dt: number,
) => [number, number]

/** The glide material's springs; see `GLIDE` for the defaults. */
export interface JellyGlide {
  /** Leading end's spring. */
  stiffness?: number
  damping?: number
  /** How far the trailing end lags, 0 (rigid slide) to 0.85. */
  lag?: number
}

/** A span along the travel axis: `x`..`x + width` on `'x'`, `y`..`y + height` on `'y'`. */
export interface JellyBounds {
  start: number
  end: number
}

export interface JellyIndicatorFrame {
  visible: boolean
  /** The engine's own state, handed over without a copy: read it, never write it. */
  rect: Readonly<JellyRect>
  scaleX: number
  scaleY: number
  moving: boolean
  phase: JellyPhase
}

export interface UseJellyIndicatorOptions {
  /** Axis the indicator travels along. Default `'x'`. */
  axis?: MaybeRefOrGetter<JellyAxis | undefined>
  /** Default `'jelly'`. `stiffness`, `damping`, `elastic`, `deform` and `maxGrowth` apply to `jelly` only. */
  material?: MaybeRefOrGetter<JellyMaterial | undefined>
  /** The glide springs. Default `GLIDE`. */
  glide?: MaybeRefOrGetter<JellyGlide | undefined>
  /** Required by `glide`: pass `springSteps`. Without it a glide move lands in place. */
  integrate?: JellySpringStep
  /** `false`: rigid exponential follow — no overshoot, no deformation. Default `true`. */
  elastic?: MaybeRefOrGetter<boolean | undefined>
  /** Free spring. Defaults to `JELLY.stiffness` / `JELLY.damping`; see `jellySpring()` for durations. */
  stiffness?: MaybeRefOrGetter<number | undefined>
  damping?: MaybeRefOrGetter<number | undefined>
  /** Deformation strength, one number for both axes or per axis. Default 1. */
  deform?: MaybeRefOrGetter<number | JellyDeform | undefined>
  /**
   * The most the shape may grow on either axis, in px. The material scales by
   * ratio, so the swell that is +10px on a 28px pill is +72px on a 200px row;
   * a cap lets large indicators grow as much as small ones. Default: no cap.
   */
  maxGrowth?: MaybeRefOrGetter<number | undefined>
  /**
   * The container's extent along the travel axis, in the rects' coordinates.
   * An overshoot stops at it — on `jelly` it lands as a squash against the
   * wall, on `glide` the end simply stops there — instead of carrying the
   * shape out of a container that clips it (`overflow: hidden`). A target
   * beyond a wall moves the wall out to it. On `jelly`, inset the walls by half
   * of `maxGrowth` to keep the landing squash inside too. Default: no walls
   * (Radio's indicator pokes past its group on purpose).
   */
  bounds?: MaybeRefOrGetter<JellyBounds | null | undefined>
  /**
   * Called each time the shape comes to rest on its target: once as a trip
   * lands, and after a move that lands without one (first measurement,
   * `animate: false`, reduced motion). A host that defers work until the
   * indicator arrives (Radio's `updateOnSettled`) can rely on it for every move.
   */
  onSettle?: () => void
  /**
   * Called after every integration step and every other change to what is
   * drawn (a landing, a phase change, hiding, `stop()`), for hosts that write
   * the indicator's style themselves instead of re-rendering.
   */
  onFrame?: (frame: JellyIndicatorFrame) => void
}

export interface JellyMoveOptions {
  /** `false` for a layout change (resize, first measure): land without travelling. Default `true`. */
  animate?: boolean
}

export interface UseJellyIndicatorReturn {
  visible: Readonly<Ref<boolean>>
  /** Where the shape is now. */
  rect: Readonly<Ref<JellyRect>>
  /** Where it is heading. */
  target: Readonly<Ref<JellyRect>>
  velocity: Readonly<Ref<JellyVelocity>>
  impact: Readonly<Ref<number>>
  impactAxis: Readonly<Ref<JellyAxis>>
  phase: Readonly<Ref<JellyPhase>>
  dragging: Readonly<Ref<boolean>>
  /** Travelling on its own, landing, or held. */
  moving: ComputedRef<boolean>
  reducedMotion: Readonly<Ref<boolean>>
  /** The deformation under the configured `elastic`. */
  scale: ComputedRef<JellyScale>
  /** The deformation under an explicit `elastic` — Radio's glass layer always deforms. */
  scaleFor: (elastic: boolean) => JellyScale
  /** Travel to `next`, or hide with `null`. */
  moveTo: (next: JellyRect | null, options?: JellyMoveOptions) => void
  /** The pointer takes hold: the grab pop, then the shape follows `drag()` directly. */
  grab: () => void
  /** A pointer sample while held. `atEdge`: pinned at an end of the track, so speed there is a slam. */
  drag: (next: JellyRect, pointerVelocity: { x: number, y: number }, options?: { atEdge?: boolean }) => void
  /**
   * The pointer lets go; part of its velocity carries into the spring. Under
   * reduced motion it stays where it was dropped until the next `moveTo()`.
   */
  release: (kick?: { x: number, y: number }) => void
  /** Stop everything where it is. */
  stop: () => void
}

const ZERO_RECT: JellyRect = { x: 0, y: 0, width: 0, height: 0 }
const ZERO_VELOCITY: JellyVelocity = { x: 0, y: 0, w: 0, h: 0 }
const IDENTITY: JellyScale = { scaleX: 1, scaleY: 1 }

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function factor(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 1
}

function isClose(a: JellyRect, b: JellyRect): boolean {
  const d = JELLY.settleDistance
  return Math.abs(a.x - b.x) < d
    && Math.abs(a.y - b.y) < d
    && Math.abs(a.width - b.width) < d
    && Math.abs(a.height - b.height) < d
}

function sameRect(a: JellyRect, b: JellyRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * The sliding indicator's motion: a shape that travels between sibling
 * elements on springs, in one of two materials. `jelly` (the default, lifted
 * out of the Radio button group) deforms as it goes — squash and stretch from
 * the shared jelly material. `glide` (Tabs, TabBar, FlatRadio, SidebarNav)
 * puts a spring on each end, the leading end ahead and the trailing one
 * catching up, so the shape stretches along its travel and never scales.
 *
 * The engine only moves: the host measures (each has its own coordinate rules)
 * and paints (each has its own layers), and hands the engine a target
 * rectangle.
 *
 * One `requestAnimationFrame` loop, running only while something moves. The
 * first measurement and an `animate: false` move at rest land in place
 * (mid-trip one only retargets); under `prefers-reduced-motion: reduce` every
 * move lands, and the shape never deforms.
 */
export function useJellyIndicator(options: UseJellyIndicatorOptions = {}): UseJellyIndicatorReturn {
  const visible = shallowRef(false)
  const rect = shallowRef<JellyRect>(ZERO_RECT)
  const target = shallowRef<JellyRect>(ZERO_RECT)
  const velocity = shallowRef<JellyVelocity>(ZERO_VELOCITY)
  const impact = shallowRef(0)
  const impactAxis = shallowRef<JellyAxis>('x')
  const phase = shallowRef<JellyPhase>('idle')
  const dragging = shallowRef(false)
  const animating = shallowRef(false)
  const reducedMotion = shallowRef(false)

  const moving = computed(() => dragging.value || animating.value)

  let raf: number | null = null
  let lastTs: number | null = null
  let phaseTimer: ReturnType<typeof setTimeout> | null = null
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let stopReducedMotion: (() => void) | undefined
  // Glide: velocities of the two ends along the travel and of the cross-axis
  // position / size, and which end leads this trip.
  let glideV = { a: 0, b: 0, p: 0, s: 0 }
  let leadEnd = true

  function axisOf(): JellyAxis {
    return toValue(options.axis) === 'y' ? 'y' : 'x'
  }

  function isElastic(): boolean {
    return toValue(options.elastic) ?? true
  }

  function isGlide(): boolean {
    return toValue(options.material) === 'glide'
  }

  function deformOf(): { along: number, across: number } {
    const d = toValue(options.deform)
    if (typeof d === 'number') {
      const k = factor(d)
      return { along: k, across: k }
    }
    return { along: factor(d?.along), across: factor(d?.across) }
  }

  // Uniform scale under the deformation: held, emerging, cruising or at rest.
  function baseScale(): number {
    if (!visible.value)
      return 1
    if (dragging.value)
      return JELLY.heldScale
    if (phase.value === 'emerge')
      return JELLY.travelEmergeScale
    if (moving.value)
      return JELLY.travelScale
    return 1
  }

  function phaseScale(): number {
    if (!moving.value)
      return 1
    if (phase.value === 'emerge')
      return JELLY.emergeScale
    if (phase.value === 'sink')
      return JELLY.sinkScale
    return 1
  }

  function scaleFor(elastic: boolean): JellyScale {
    if (reducedMotion.value || isGlide())
      return IDENTITY

    const v = velocity.value
    const axis = axisOf()
    const raw = jellyScale({
      speed: Math.hypot(v.x, v.y),
      travelAxis: axis,
      impact: impact.value,
      impactAxis: impactAxis.value,
      elastic,
      moving: moving.value,
      dragBoost: dragging.value ? JELLY.heldStretchBoost : 1,
      baseScale: baseScale(),
      phaseScale: phaseScale(),
    })

    const { along, across } = deformOf()
    const kx = axis === 'x' ? along : across
    const ky = axis === 'x' ? across : along
    let scaleX = kx === 1 ? raw.scaleX : 1 + (raw.scaleX - 1) * kx
    let scaleY = ky === 1 ? raw.scaleY : 1 + (raw.scaleY - 1) * ky

    const cap = toValue(options.maxGrowth)
    if (typeof cap === 'number' && Number.isFinite(cap) && cap >= 0) {
      const { width, height } = rect.value
      if (width > 0)
        scaleX = Math.min(scaleX, 1 + cap / width)
      if (height > 0)
        scaleY = Math.min(scaleY, 1 + cap / height)
    }

    return { scaleX: Math.max(0, scaleX), scaleY: Math.max(0, scaleY) }
  }

  const scale = computed(() => scaleFor(isElastic()))

  function emitFrame(): void {
    if (!options.onFrame || disposed)
      return
    const { scaleX, scaleY } = scaleFor(isElastic())
    options.onFrame({
      visible: visible.value,
      rect: rect.value,
      scaleX,
      scaleY,
      moving: moving.value,
      phase: phase.value,
    })
  }

  function clearPhaseTimer(): void {
    if (phaseTimer != null) {
      clearTimeout(phaseTimer)
      phaseTimer = null
    }
  }

  function clearSettleTimer(): void {
    if (settleTimer != null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  function setPhase(next: JellyPhase, ttlMs = 0): void {
    phase.value = next
    clearPhaseTimer()
    if (ttlMs > 0) {
      phaseTimer = setTimeout(() => {
        phaseTimer = null
        phase.value = 'idle'
        emitFrame()
      }, ttlMs)
    }
  }

  function cancelLoop(): void {
    if (raf != null)
      cancelAnimationFrame(raf)
    raf = null
    lastTs = null
  }

  function looping(): boolean {
    return raf != null || dragging.value
  }

  function startLoop(): void {
    if (raf != null || disposed)
      return
    // A landing still sinking belongs to the previous trip; its timer must not
    // end this one halfway.
    clearSettleTimer()
    animating.value = true
    if (!dragging.value && !isGlide())
      setPhase('emerge', JELLY.travelEmergeMs)
    lastTs = null
    raf = requestAnimationFrame(step)
  }

  // `onSettle` goes last, once the state is consistent: a host that moves the
  // indicator again from inside it starts a fresh trip instead of having it
  // cancelled by the rest of this landing.
  function settle(sinkMs: number): void {
    cancelLoop()
    clearPhaseTimer()
    phase.value = 'sink'
    clearSettleTimer()
    settleTimer = setTimeout(() => {
      settleTimer = null
      phase.value = 'idle'
      animating.value = false
      emitFrame()
    }, sinkMs)
    emitFrame()
    options.onSettle?.()
  }

  function halt(): void {
    cancelLoop()
    clearPhaseTimer()
    clearSettleTimer()
    velocity.value = ZERO_VELOCITY
    glideV = { a: 0, b: 0, p: 0, s: 0 }
    impact.value = 0
    phase.value = 'idle'
    animating.value = false
  }

  // Arriving without a trip is still arriving: without `onSettle` here, work a
  // host deferred to the landing would wait forever under reduced motion.
  function land(next: JellyRect): void {
    halt()
    rect.value = { ...next }
    target.value = { ...next }
    emitFrame()
    options.onSettle?.()
  }

  /**
   * The glide material, one frame. Each end of the shape along the travel
   * rides its own spring — the leading end on the glide spring, the trailing
   * end on the same spring played slower — so the shape lengthens a little on
   * the way and gathers as it lands. Across the travel, position and size ride
   * the leading spring. Integrated with the host's `integrate` (`springSteps`,
   * 1/240 s substeps — the library's frame spring); the shape never scales.
   */
  function glideStep(dt: number): void {
    const t = target.value
    const c = rect.value
    const integrate = options.integrate
    if (!integrate) {
      land(t)
      return
    }
    const alongX = axisOf() === 'x'
    const conf = toValue(options.glide)
    const lead = {
      stiffness: finiteOr(conf?.stiffness, GLIDE.stiffness),
      damping: finiteOr(conf?.damping, GLIDE.damping),
    }
    const lag = Math.min(0.85, Math.max(0, finiteOr(conf?.lag, GLIDE.lag)))
    const f = 1 - lag / 2
    const trail = { stiffness: lead.stiffness * f * f, damping: lead.damping * f }

    const tA = alongX ? t.x : t.y
    const tB = tA + (alongX ? t.width : t.height)
    const tP = alongX ? t.y : t.x
    const tS = alongX ? t.height : t.width
    const cA = alongX ? c.x : c.y
    const cB = cA + (alongX ? c.width : c.height)

    let [a, va] = integrate(cA, glideV.a, tA, leadEnd ? trail : lead, dt)
    let [b, vb] = integrate(cB, glideV.b, tB, leadEnd ? lead : trail, dt)
    const [p, vp] = integrate(alongX ? c.y : c.x, glideV.p, tP, lead, dt)
    const [size, vs] = integrate(alongX ? c.height : c.width, glideV.s, tS, lead, dt)

    // Walls, as for the jelly: an end that would leave the container stops
    // there. A target beyond a wall moves the wall out to it.
    const wall = toValue(options.bounds)
    if (wall) {
      const start = Math.min(wall.start, tA)
      const end = Math.max(wall.end, tB)
      if (a < start) {
        a = start
        va = 0
      }
      if (b > end) {
        b = end
        vb = 0
      }
    }
    if (b < a) {
      const mid = (a + b) / 2
      a = mid
      b = mid
    }

    glideV = { a: va, b: vb, p: vp, s: vs }
    rect.value = alongX
      ? { x: a, width: b - a, y: p, height: size }
      : { x: p, width: size, y: a, height: b - a }
    velocity.value = alongX
      ? { x: (va + vb) / 2, y: vp, w: vb - va, h: vs }
      : { x: vp, y: (va + vb) / 2, w: vs, h: vb - va }

    const d = JELLY.settleDistance
    const sp = JELLY.settleSpeed
    const settled
      = Math.abs(tA - a) < d && Math.abs(tB - b) < d && Math.abs(tP - p) < d && Math.abs(tS - size) < d
        && Math.abs(va) < sp && Math.abs(vb) < sp && Math.abs(vp) < sp && Math.abs(vs) < sp

    if (settled) {
      rect.value = { ...t }
      velocity.value = ZERO_VELOCITY
      glideV = { a: 0, b: 0, p: 0, s: 0 }
      settle(0)
      return
    }

    emitFrame()
    raf = requestAnimationFrame(step)
  }

  function step(ts: number): void {
    raf = null
    if (disposed)
      return
    if (lastTs == null)
      lastTs = ts
    if (isGlide() && !dragging.value) {
      // `springSteps` substeps any frame, so only a stalled tab is capped.
      const glideDt = Math.min((ts - lastTs) / 1000, 0.1)
      lastTs = ts
      glideStep(glideDt)
      return
    }
    const dt = Math.min((ts - lastTs) / 1000, JELLY.maxFrameS)
    lastTs = ts

    const t = target.value
    const c = rect.value
    const v = { ...velocity.value }

    const dx = t.x - c.x
    const dy = t.y - c.y
    const dw = t.width - c.width
    const dh = t.height - c.height

    if (dragging.value) {
      // Position is the pointer's (`drag()` writes it); only the velocity sample
      // bleeds away, so a shape parked mid-drag relaxes instead of staying stretched.
      v.x *= Math.exp(-dt * JELLY.velocityDecay)
      v.y *= Math.exp(-dt * JELLY.velocityDecay)
      v.w += (dw * JELLY.heldStiffness * JELLY.sizeStiffnessScale - v.w * JELLY.heldDamping) * dt
      v.h += (dh * JELLY.heldStiffness * JELLY.sizeStiffnessScale - v.h * JELLY.heldDamping) * dt
      velocity.value = v
      impact.value *= Math.exp(-dt * JELLY.impactDecayHeld)
      emitFrame()
      raf = requestAnimationFrame(step)
      return
    }

    if (!isElastic()) {
      const alpha = 1 - Math.exp(-JELLY.rigidFollow * dt)
      const nx = c.x + dx * alpha
      const ny = c.y + dy * alpha
      const nw = c.width + dw * alpha
      const nh = c.height + dh * alpha
      const span = Math.max(dt, 0.001)

      rect.value = { x: nx, y: ny, width: nw, height: nh }
      velocity.value = {
        x: (nx - c.x) / span,
        y: (ny - c.y) / span,
        w: (nw - c.width) / span,
        h: (nh - c.height) / span,
      }
      impact.value = 0

      const settled
        = Math.abs(t.x - nx) < JELLY.rigidSettleDistance
          && Math.abs(t.y - ny) < JELLY.rigidSettleDistance
          && Math.abs(t.width - nw) < JELLY.rigidSettleDistance
          && Math.abs(t.height - nh) < JELLY.rigidSettleDistance

      if (settled) {
        rect.value = { ...t }
        velocity.value = ZERO_VELOCITY
        settle(JELLY.rigidSinkMs)
        return
      }

      emitFrame()
      raf = requestAnimationFrame(step)
      return
    }

    const prevDx = dx + v.x * dt
    const prevDy = dy + v.y * dt

    const springStiffness = finiteOr(toValue(options.stiffness), JELLY.stiffness)
      * (phase.value === 'emerge' ? JELLY.emergeStiffnessScale : 1)
    const springDamping = finiteOr(toValue(options.damping), JELLY.damping)

    v.x += (dx * springStiffness - v.x * springDamping) * dt
    v.y += (dy * springStiffness - v.y * springDamping) * dt
    v.w += (dw * springStiffness * JELLY.sizeStiffnessScale - v.w * springDamping) * dt
    v.h += (dh * springStiffness * JELLY.sizeStiffnessScale - v.h * springDamping) * dt

    let nx = c.x + v.x * dt
    let ny = c.y + v.y * dt
    const nw = c.width + v.w * dt
    const nh = c.height + v.h * dt

    // The container's ends: an overshoot that would leave it stops dead there,
    // and the stop lands the way a crossing does — a jelly hitting a wall
    // squashes against it instead of sliding out to be clipped.
    const wall = toValue(options.bounds)
    if (wall) {
      const alongX = axisOf() === 'x'
      const pos = alongX ? nx : ny
      const size = alongX ? nw : nh
      // A target beyond a wall moves that wall out to it: the shape always
      // reaches its target, and still stops there rather than overshooting.
      const start = Math.min(wall.start, alongX ? t.x : t.y)
      const end = Math.max(wall.end, alongX ? t.x + t.width : t.y + t.height)
      const past = pos < start ? start : pos + size > end ? end - size : null
      if (past != null) {
        const speed = Math.abs(alongX ? v.x : v.y)
        if (alongX) {
          nx = past
          v.x = 0
        }
        else {
          ny = past
          v.y = 0
        }
        if (speed > JELLY.reversalSpeed) {
          impactAxis.value = alongX ? 'x' : 'y'
          impact.value = Math.min(1, Math.max(impact.value, speed / JELLY.reversalImpactScale))
        }
      }
    }

    const nextDx = t.x - nx
    const nextDy = t.y - ny

    // Crossing the target is a landing: the faster it crosses, the harder it squashes.
    if ((prevDx > 0 && nextDx < 0) || (prevDx < 0 && nextDx > 0) || (prevDy > 0 && nextDy < 0) || (prevDy < 0 && nextDy > 0)) {
      const speed = Math.hypot(v.x, v.y)
      if (speed > JELLY.reversalSpeed) {
        impactAxis.value = Math.abs(v.x) >= Math.abs(v.y) ? 'x' : 'y'
        impact.value = Math.min(1, Math.max(impact.value, speed / JELLY.reversalImpactScale))
      }
    }

    impact.value *= Math.exp(-dt * JELLY.impactDecayFree)

    rect.value = { x: nx, y: ny, width: nw, height: nh }
    velocity.value = v

    const settled
      = Math.abs(nextDx) < JELLY.settleDistance
        && Math.abs(nextDy) < JELLY.settleDistance
        && Math.abs(dw) < JELLY.settleDistance
        && Math.abs(dh) < JELLY.settleDistance
        && Math.abs(v.x) < JELLY.settleSpeed
        && Math.abs(v.y) < JELLY.settleSpeed
        && Math.abs(v.w) < JELLY.settleSpeed
        && Math.abs(v.h) < JELLY.settleSpeed

    if (settled) {
      rect.value = { ...t }
      velocity.value = ZERO_VELOCITY
      impact.value = 0
      settle(JELLY.sinkMs)
      return
    }

    emitFrame()
    raf = requestAnimationFrame(step)
  }

  function moveTo(next: JellyRect | null, moveOptions: JellyMoveOptions = {}): void {
    if (disposed)
      return

    if (!next) {
      if (!visible.value)
        return
      halt()
      visible.value = false
      emitFrame()
      return
    }

    // While held the pointer owns the position: the next `drag()` sample
    // overwrites this target, so a host measures again after `release()`.
    if (dragging.value) {
      target.value = { ...next }
      return
    }

    const animate = moveOptions.animate ?? true
    const wasVisible = visible.value
    visible.value = true

    if (!wasVisible || reducedMotion.value || (!animate && !looping())) {
      land(next)
      return
    }

    target.value = { ...next }

    if (!looping() && isClose(rect.value, next)) {
      // Already there: no trip, so no pop. Take the exact value without
      // disturbing a landing that is still sinking.
      if (!sameRect(rect.value, next)) {
        rect.value = { ...next }
        emitFrame()
      }
      return
    }

    // The end facing the target leads this trip (glide). Mid-flight this only
    // retargets; the running springs carry on.
    const alongX = axisOf() === 'x'
    const centre = (r: JellyRect) => (alongX ? r.x + r.width / 2 : r.y + r.height / 2)
    leadEnd = centre(next) >= centre(rect.value)
    startLoop()
  }

  function grab(): void {
    if (disposed || !visible.value || dragging.value)
      return
    dragging.value = true
    setPhase('emerge', JELLY.emergeMs)
    startLoop()
    emitFrame()
  }

  function drag(next: JellyRect, pointerVelocity: { x: number, y: number }, dragOptions: { atEdge?: boolean } = {}): void {
    if (disposed || !dragging.value)
      return
    target.value = { ...next }
    rect.value = { ...next }
    velocity.value = { ...velocity.value, x: pointerVelocity.x, y: pointerVelocity.y }

    const axis = axisOf()
    const alongSpeed = axis === 'x' ? pointerVelocity.x : pointerVelocity.y
    if (dragOptions.atEdge && Math.abs(alongSpeed) > JELLY.edgeSpeed) {
      impactAxis.value = axis
      impact.value = Math.max(impact.value, JELLY.edgeImpact)
    }
    emitFrame()
  }

  function release(kick: { x: number, y: number } = { x: 0, y: 0 }): void {
    if (!dragging.value)
      return
    dragging.value = false
    glideV = { a: 0, b: 0, p: 0, s: 0 }
    if (reducedMotion.value) {
      // No coasting: it stays where it was let go until the host moves it.
      land(target.value)
      return
    }
    const v = velocity.value
    velocity.value = {
      ...v,
      x: v.x + kick.x * JELLY.releaseKick,
      y: v.y + kick.y * JELLY.releaseKick,
    }
    startLoop()
  }

  function stop(): void {
    dragging.value = false
    halt()
    emitFrame()
  }

  onMounted(() => {
    if (!hasWindow() || typeof window.matchMedia !== 'function')
      return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = query.matches
    const onChange = (event: MediaQueryListEvent): void => {
      reducedMotion.value = event.matches
      if (event.matches && raf != null && !dragging.value)
        land(target.value)
      else
        emitFrame()
    }
    query.addEventListener?.('change', onChange)
    stopReducedMotion = () => query.removeEventListener?.('change', onChange)
  })

  onBeforeUnmount(() => {
    disposed = true
    stop()
    stopReducedMotion?.()
    stopReducedMotion = undefined
  })

  return {
    visible: visible as Readonly<Ref<boolean>>,
    rect: rect as Readonly<Ref<JellyRect>>,
    target: target as Readonly<Ref<JellyRect>>,
    velocity: velocity as Readonly<Ref<JellyVelocity>>,
    impact: impact as Readonly<Ref<number>>,
    impactAxis: impactAxis as Readonly<Ref<JellyAxis>>,
    phase: phase as Readonly<Ref<JellyPhase>>,
    dragging: dragging as Readonly<Ref<boolean>>,
    moving,
    reducedMotion: reducedMotion as Readonly<Ref<boolean>>,
    scale,
    scaleFor,
    moveTo,
    grab,
    drag,
    release,
    stop,
  }
}
