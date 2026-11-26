/**
 * The library's frame spring. A compiled CSS curve always starts from rest, so
 * retargeting one mid-flight restarts the motion at zero velocity, a visible
 * stall. Anything drawn frame by frame from JS that has to keep its momentum
 * through a retarget steps on this instead: the indicator engine's glide
 * material (`useJellyIndicator({ integrate: stepSpring })`), and liquid's
 * `springSteps`, which resolves a preset name and then steps here.
 */

/**
 * The substep cap: the step liquid's `simulate()` compiles the CSS curves
 * with, so a JS-driven and a CSS-driven element on the same preset stay in
 * step. At 1/60 s the snappy preset drifts 10.7% off its own compiled curve
 * (smooth 5.7%, bouncy 10.1%); at 1/240 s the gap is 0.2% at 60 fps.
 */
const SUBSTEP_S = 1 / 240

/**
 * Advance one value along a spring by a WALL-CLOCK `dt` (seconds), carrying
 * its velocity. Returns `[position, velocity]`.
 *
 * Semi-implicit Euler. Any `dt` is safe: a long frame takes more substeps, it
 * never takes a bigger one, so a 2 s gap lands on the target instead of
 * blowing up. `mass` defaults to 1.
 */
export function stepSpring(
  position: number,
  velocity: number,
  target: number,
  spring: { stiffness: number, damping: number, mass?: number },
  dt: number,
): [number, number] {
  if (!(dt > 0))
    return [position, velocity]
  const m = spring.mass ?? 1
  const mass = m > 0 && Number.isFinite(m) ? m : 1
  // The epsilon keeps an exact multiple of the substep (a 60 Hz frame is 4 of
  // them) from rounding up into one extra, shorter step.
  let n = Math.max(1, Math.ceil(dt / SUBSTEP_S - 1e-6))
  const h = dt / n
  let p = position
  let v = velocity
  while (n-- > 0) {
    v += ((spring.stiffness * (target - p) - spring.damping * v) / mass) * h
    p += v * h
  }
  // A frame loop only sleeps once its springs are at rest, and NaN never is:
  // a spring that cannot be integrated lands on its target instead.
  return Number.isFinite(p) && Number.isFinite(v) ? [p, v] : [target, 0]
}

interface SpringParams { stiffness: number, damping: number, mass?: number }

/** Within this of critical damping the two closed forms meet; use the critical one. */
const CRITICAL_BAND = 1e-6

/**
 * Where a spring is `t` seconds after leaving `position` with `velocity`,
 * pulled towards `target`. Returns `[position, velocity]`.
 *
 * The closed form of the same damped spring `stepSpring` integrates, so any
 * `t` is exact and costs the same: no step size, no drift, and it can be asked
 * about any moment in any order. `stepSpring`, at its 1/240 s substep, runs
 * ahead of it by up to 3% of the travel on liquid's presets (snappy 3.2%,
 * smooth 1.9%, bouncy 3.1%, all inside the first 100 ms, at any frame rate).
 * It stays the frame spring all the same: liquid compiles its CSS curves with
 * that step, and a JS-driven and a CSS-driven element must agree.
 * Use this one where a motion has to be sought rather than played: a timeline
 * scrubbed or rendered frame by frame, or a test that asks where it is at 120 ms.
 */
export function solveSpring(
  position: number,
  velocity: number,
  target: number,
  spring: SpringParams,
  t: number,
): [number, number] {
  if (!(t > 0))
    return [position, velocity]
  const m = spring.mass ?? 1
  const mass = m > 0 && Number.isFinite(m) ? m : 1
  const k = spring.stiffness
  const c = spring.damping
  if (!(k > 0) || !(c >= 0))
    return [target, 0]
  const x0 = position - target
  const v0 = velocity
  const omega = Math.sqrt(k / mass)
  const zeta = c / (2 * Math.sqrt(k * mass))
  let x: number
  let v: number
  if (Math.abs(zeta - 1) < CRITICAL_BAND) {
    const decay = Math.exp(-omega * t)
    const b = v0 + omega * x0
    x = decay * (x0 + b * t)
    v = decay * (v0 - omega * b * t)
  }
  else if (zeta < 1) {
    const a = zeta * omega
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    const decay = Math.exp(-a * t)
    const cos = Math.cos(wd * t)
    const sin = Math.sin(wd * t)
    x = decay * (x0 * cos + ((v0 + a * x0) / wd) * sin)
    v = decay * (v0 * cos - ((a * v0 + omega * omega * x0) / wd) * sin)
  }
  else {
    const root = omega * Math.sqrt(zeta * zeta - 1)
    const r1 = -zeta * omega + root
    const r2 = -zeta * omega - root
    const c1 = (v0 - r2 * x0) / (r1 - r2)
    const c2 = x0 - c1
    const e1 = Math.exp(r1 * t)
    const e2 = Math.exp(r2 * t)
    x = c1 * e1 + c2 * e2
    v = r1 * c1 * e1 + r2 * c2 * e2
  }
  const p = target + x
  return Number.isFinite(p) && Number.isFinite(v) ? [p, v] : [target, 0]
}

/** A spring whose target moves over time, readable at any moment. */
export interface SpringTrack {
  /**
   * Move the target at `t` seconds. The spring keeps the position and velocity
   * it has at `t`, so the motion bends instead of restarting. A retarget earlier
   * than the last one rewrites the track from `t` on.
   */
  retarget: (t: number, target: number) => void
  /** Exact `[position, velocity]` at `t` seconds; seek in any order, as often as needed. */
  sample: (t: number) => [number, number]
}

/**
 * The interruptible half of the closed form: a track that starts at rest at
 * `initial` and is retargeted along the way, every moment of it exact. A
 * renderer seeks it frame by frame; a scrubber seeks it backwards.
 */
export function createSpringTrack(spring: SpringParams, initial: number): SpringTrack {
  // Each segment is the spring released at `start` with that state, towards its target.
  const segments: { start: number, position: number, velocity: number, target: number }[] = [
    { start: Number.NEGATIVE_INFINITY, position: initial, velocity: 0, target: initial },
  ]

  function segmentAt(t: number) {
    let index = segments.length - 1
    while (index > 0 && segments[index]!.start > t)
      index--
    return index
  }

  function sample(t: number): [number, number] {
    const segment = segments[segmentAt(t)]!
    if (segment.start === Number.NEGATIVE_INFINITY)
      return [segment.position, 0]
    return solveSpring(segment.position, segment.velocity, segment.target, spring, t - segment.start)
  }

  function retarget(t: number, target: number) {
    const [position, velocity] = sample(t)
    segments.length = segmentAt(t) + 1
    segments.push({ start: t, position, velocity, target })
  }

  return { retarget, sample }
}
