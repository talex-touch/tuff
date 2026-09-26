import type { FusionSurfaceTransition } from '@talex-touch/tuffex/fusion-surface'
import { springSteps } from '@talex-touch/tuffex/fusion-surface'

/**
 * The send lift's score — the send, the way iMessage does it: the typed text is lifted out of the
 * composer as it stands, its bubble fills in around it, and the whole bubble rides one spring to
 * its row while the thread makes room. One motion, started on the press, nothing blurred, nothing
 * detached from the text. `lift-driver.ts` runs the frames, `useSendChoreography.ts` measures and
 * wires the page; tune here, not at the call sites.
 */
export const LIFT_SCORE = {
  /**
   * Frames between the append and the landing read: the new rows render in the first, the
   * virtualizer measures them and re-lays the window in the second. The lifted text holds still
   * on the composer meanwhile — a frame or two at the press.
   */
  settleFrames: 2,

  /**
   * The bubble's spring: iOS's feel — a 0.40s response at a 0.84 damping ratio, so it arrives
   * quickly and settles with one small overshoot. stiffness = (2π / response)², damping =
   * 2ζ√stiffness.
   */
  spring: { stiffness: 246.7, damping: 26.4, mass: 1 } satisfies FusionSurfaceTransition,
  /**
   * The conversation's first message takes its time: the stage is changing hands (the greeting
   * leaves, the composer docks) and the reader has nothing else to look at — a 0.62s response at a
   * 0.86 damping ratio. The model's first token usually arrives while it is still settling.
   */
  openingSpring: { stiffness: 102.7, damping: 17.43, mass: 1 },
  /**
   * …and it peels off the composer instead of being shot out of it: the spring's pull comes on
   * over `openingRampMs` from `openingRampFloor` of itself (damping scaled by the root, so the
   * damping ratio holds). About 5% of the travel in the first 100ms, half by 300ms, at rest in
   * about a second. The first send's dock rides the same curve, so box and bubble part together.
   */
  openingRampMs: 320,
  openingRampFloor: 0.06,

  /**
   * The bubble fills in around the lifted text between these shares of the travel: none while it
   * still sits on the composer, all of it well before it lands.
   */
  fillFrom: 0.04,
  fillTo: 0.42,

  /**
   * When the bubble lays the text out differently from the composer (a wrapped draft), the draft
   * fades out where it was while the bubble's text fades in, over this long.
   */
  crossfadeMs: 140,

  /** The one mid-flight landing read, as a share of the vertical travel. */
  rereadAt: 0.7,
  /** Largest gap between the lifted bubble's last pose and the real row at the swap. */
  landTolerancePx: 0.5,
  /** Landing reads at rest before the swap happens regardless (the row kept moving). */
  maxVerifies: 3,
  /**
   * A lift still running this long after launch lands where it stands. Keep it under
   * `ENTRANCE_WATCHDOG_MS` (2s, `useSendChoreography.ts`) less the settle frames.
   */
  timeoutMs: 1600
} as const

export interface LiftRect {
  left: number
  top: number
  width: number
  height: number
}

export interface LiftScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export interface LiftSpring {
  stiffness: number
  damping: number
  mass: number
}

/**
 * `spring` `sinceMs` into a ramp of `rampMs`: its stiffness eased in from `floor`, its damping by
 * the root of the same share (the damping ratio stays the spring's). No ramp, the spring itself.
 */
export function rampedSpring(
  spring: LiftSpring,
  sinceMs: number,
  rampMs: number,
  floor: number
): LiftSpring {
  if (!(rampMs > 0)) return spring
  const share = floor + (1 - floor) * smoothstep(sinceMs / rampMs)
  return {
    stiffness: spring.stiffness * share,
    damping: spring.damping * Math.sqrt(share),
    mass: spring.mass
  }
}

/**
 * The ramped spring's step response as keyframes for a WAAPI animation: `x` is the position 0→1,
 * `v` the velocity as a share of its peak. Simulated at 1/240s until at rest; `duration` is how
 * long that took (ms). The first send's dock plays this so it leaves on the bubble's own curve.
 */
export function sampleSpringCurve(
  spring: LiftSpring,
  rampMs: number,
  floor: number,
  keyframes = 40
): { duration: number; frames: { o: number; x: number; v: number }[] } {
  const h = 1 / 240
  const track: { t: number; x: number; v: number }[] = [{ t: 0, x: 0, v: 0 }]
  let x = 0
  let v = 0
  let t = 0
  while (t < 3) {
    ;[x, v] = springSteps(x, v, 1, rampedSpring(spring, t * 1000, rampMs, floor), h)
    t += h
    track.push({ t, x, v })
    if (Math.abs(1 - x) < 5e-4 && Math.abs(v) < 5e-3) break
  }
  const peak = Math.max(...track.map((s) => Math.abs(s.v))) || 1
  const frames = Array.from({ length: keyframes + 1 }, (_, i) => {
    const at = (i / keyframes) * t
    const s = track[Math.min(track.length - 1, Math.round(at / h))]
    return { o: i / keyframes, x: i === keyframes ? 1 : s.x, v: i === keyframes ? 0 : s.v / peak }
  })
  return { duration: Math.round(t * 1000), frames }
}

/** Share of the travel from `from` to `to` covered at `at`, clamped; 1 when there is no travel. */
export function travelProgress(from: number, to: number, at: number): number {
  const span = to - from
  if (Math.abs(span) < 1e-6) return 1
  return clamp((at - from) / span, 0, 1)
}

/** How much of the bubble's fill shows at `progress` of the travel, 0–1. */
export function fillAt(progress: number): number {
  const { fillFrom, fillTo } = LIFT_SCORE
  return smoothstep((progress - fillFrom) / (fillTo - fillFrom))
}

/**
 * Where the lifted bubble starts: laid over the draft so its text sits on the draft's — the same
 * glyphs, not a copy of them nearby. `line` is the draft's first-line box (the textarea's content
 * box at its first visible line), `inset` the bubble's padding. The bubble's line box is taller,
 * so `lines` of text are centred on the draft's block: a four-line draft is off by half the
 * height difference at its first and last lines instead of all of it at its last.
 */
export function liftOrigin(input: {
  line: { left: number; top: number }
  inset: { left: number; top: number }
  inputLineHeight: number
  bubbleLineHeight: number
  lines?: number
}): { left: number; top: number } {
  const lead = ((input.lines ?? 1) * (input.bubbleLineHeight - input.inputLineHeight)) / 2
  return {
    left: input.line.left - input.inset.left,
    top: input.line.top - input.inset.top - lead
  }
}

/**
 * Where the real row will rest, from where it is now: after a send the stream glides to its
 * bottom, so the row still owes the rest of that glide. A transcript that fits the viewport never
 * scrolls, and the term is zero.
 */
export function predictLanding(rect: LiftRect, scroll: LiftScrollMetrics | null): LiftRect {
  if (!scroll) return { ...rect }
  const end = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
  return { ...rect, top: rect.top - (end - scroll.scrollTop) }
}

/** Largest per-axis gap between two rects. */
export function rectGap(a: LiftRect, b: LiftRect): number {
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height)
  )
}
