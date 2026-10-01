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
