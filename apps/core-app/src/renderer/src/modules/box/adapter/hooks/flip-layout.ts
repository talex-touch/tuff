/**
 * FLIP for the CoreBox results area.
 *
 * Record where things are, let the DOM settle into the new layout in one pass, then play each
 * element from its old box to its new one with transforms only. A re-wrap or the preview pane
 * opening then moves tiles and rows on the compositor, instead of the browser re-laying out the
 * whole column (and repainting the preview image) on every frame of a width transition — which
 * is what made the collapse stutter.
 *
 * Elements opt in with `data-flip-key` (an identity stable across the change) and `data-flip`:
 * - `move` translates only. Rows and titles: their width change is far too large to scale text
 *   through.
 * - `scale` also morphs the box. A `[data-flip-inner]` child is counter-scaled so the content
 *   keeps its final size while the background grows or shrinks around it.
 */

export interface FlipRect {
  left: number
  top: number
  width: number
  height: number
}

export interface FlipSnapshot {
  rects: Map<string, FlipRect>
}

export interface FlipDelta {
  dx: number
  dy: number
  sx: number
  sy: number
}

export const FLIP_DURATION_MS = 220
const FLIP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** Samples for the scale morph; the box and its counter-scaled inner are both sampled here. */
const SCALE_SAMPLES = 12

function readRect(el: Element): FlipRect {
  const rect = el.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export function captureFlipSnapshot(root: ParentNode | null | undefined): FlipSnapshot | null {
  if (!root) return null
  const rects = new Map<string, FlipRect>()
  root.querySelectorAll<HTMLElement>('[data-flip-key]').forEach((el) => {
    const key = el.dataset.flipKey
    if (key) rects.set(key, readRect(el))
  })
  return rects.size > 0 ? { rects } : null
}

/** `null` when the element did not move or resize enough to be worth an animation. */
export function computeFlipDelta(before: FlipRect, after: FlipRect): FlipDelta | null {
  const dx = before.left - after.left
  const dy = before.top - after.top
  const sx = after.width > 0 ? before.width / after.width : 1
  const sy = after.height > 0 ? before.height / after.height : 1
  const moved = Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5
  const resized = Math.abs(sx - 1) >= 0.01 || Math.abs(sy - 1) >= 0.01
  if (!moved && !resized) return null
  return { dx, dy, sx, sy }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/**
 * Keyframes for a `scale` element and its inner. Sampled with the easing baked in and played
 * linearly: a two-frame `scale(s) → scale(1)` on the box and `scale(1/s) → scale(1)` on the inner
 * would not multiply out to 1 between the frames, and the content would breathe mid-flight.
 */
export function buildScaleFlipKeyframes(
  delta: FlipDelta,
  samples = SCALE_SAMPLES
): { outer: Keyframe[]; inner: Keyframe[] } {
  const outer: Keyframe[] = []
  const inner: Keyframe[] = []
  for (let index = 0; index <= samples; index += 1) {
    const offset = index / samples
    const progress = easeOutCubic(offset)
    const sx = delta.sx + (1 - delta.sx) * progress
    const sy = delta.sy + (1 - delta.sy) * progress
    const dx = delta.dx * (1 - progress)
    const dy = delta.dy * (1 - progress)
    outer.push({
      offset,
      transformOrigin: '0 0',
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    })
    inner.push({
      offset,
      transformOrigin: '0 0',
      transform: `scale(${1 / sx}, ${1 / sy})`
    })
  }
  return { outer, inner }
}

/** Plays the elements under `root` from `snapshot` to where they are now; returns how many moved. */
export function playFlip(
  root: ParentNode | null | undefined,
  snapshot: FlipSnapshot | null,
  duration = FLIP_DURATION_MS
): number {
  if (!root || !snapshot) return 0
  let animated = 0
  root.querySelectorAll<HTMLElement>('[data-flip-key]').forEach((el) => {
    const key = el.dataset.flipKey
    if (!key || typeof el.animate !== 'function') return
    const before = snapshot.rects.get(key)
    if (!before) return
    const delta = computeFlipDelta(before, readRect(el))
    if (!delta) return

    if (el.dataset.flip === 'scale') {
      const frames = buildScaleFlipKeyframes(delta)
      el.animate(frames.outer, { duration, easing: 'linear' })
      const inner = el.querySelector<HTMLElement>('[data-flip-inner]')
      if (inner && typeof inner.animate === 'function') {
        inner.animate(frames.inner, { duration, easing: 'linear' })
      }
    } else {
      el.animate(
        [
          { transform: `translate(${delta.dx}px, ${delta.dy}px)` },
          { transform: 'translate(0px, 0px)' }
        ],
        { duration, easing: FLIP_EASING }
      )
    }
    animated += 1
  })
  return animated
}
