import type { ResolvedTransition, SpringConfig } from '@talex-touch/tuffex/liquid'
import { resolveTransition } from '@talex-touch/tuffex/liquid'
import { hasWindow } from '@talex-touch/utils/env'

/**
 * The composer toolbar's motion score — every duration, spring and distance the controls use.
 * Tune here, not at the call sites.
 *
 * Springs are the library's (`resolveTransition`, compiled to a CSS `linear()` curve) and play
 * through WAAPI: the send key's launch shares its frames with the send lift's per-frame driver, and
 * a compiled curve costs that driver nothing (task `09-26-composer-controls-redesign`, D3 / D4).
 */

/** `--tx-ease-out-strong`, written out because WAAPI cannot read a custom property. */
export const EASE_OUT_STRONG = 'cubic-bezier(0.23, 1, 0.32, 1)'
/** Accelerating exit: whatever leaves, leaves faster than it arrived. */
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'

/** 15% overshoot, 446ms: a released control swings back just past its rest. */
const RELEASE_SPRING = { stiffness: 900, damping: 30, mass: 1 } satisfies SpringConfig
/** 5.5% overshoot, 462ms: the capsules' width, the stop bloom, the arrow re-arming. */
const MORPH_SPRING = { stiffness: 520, damping: 30, mass: 1 } satisfies SpringConfig

export const COMPOSER_MOTION = {
  press: {
    /** Round keys and chips. */
    scale: 0.9,
    /** The 32px send circle presses deeper. */
    islandScale: 0.86,
    /** A 72px capsule pressed to 0.86 reads as collapsing; it presses shallow. */
    capsuleScale: 0.95,
    inMs: 90,
    inEasing: EASE_OUT_STRONG,
    /** A programmatic press (Enter, the send shortcut) holds this long before it springs back. */
    pulseMs: 70,
    /** A press this recent already told the launch story; the launch does not press again. */
    recentMs: 250
  },
  release: RELEASE_SPRING,
  morph: MORPH_SPRING,
  /** T1: the send key wakes when the draft gets its first character. */
  wake: { fromScale: 0.92 },
  /** T5: the skin settles as the capsule folds back into the circle. */
  settle: { fromScale: 0.94 },
  /**
   * T3 ②: the arrow rides up with the lifted message. Not blurred, because the lifted bubble is not;
   * as long as the lift's own cross-fade (`LIFT_SCORE.crossfadeMs`).
   */
  glyphOut: { ms: 140, risePx: 8, easing: EASE_IN },
  /** T5 ②: the arrow re-arms from below as the capsule folds. */
  glyphIn: { delayMs: 45, fromPx: 8, fadeMs: 160 },
  capsule: {
    /** = the microphone 32 + the 8px gap + the send key 32: the capsule covers the mic slot exactly. */
    width: 72,
    /** T3 ④: the arrow gets a head start before the key starts to grow. */
    growDelayMs: 40,
    /** T3 ⑤: primary → ink. */
    toneDelayMs: 60,
    /** T5 ②: the stop label gets a head start before the key folds. */
    retractDelayMs: 45
  },
  /** T3 ⑥: 「■ 停止」 opens once the key has room — never, if the turn ended first (T7). */
  stopBloom: { delayMs: 120, fromScale: 0.6, fadeMs: 180, radiusFrom: 5, radiusTo: 2.5 },
  /** T5 ①: 「■ 停止」 folds away first. */
  stopFold: { ms: 120, toScale: 0.6 },
  /**
   * T3 ③ / T5 ④: the microphone yielding its slot to the stop capsule, and coming back once the
   * capsule has left it. The model pill yields to the dictation capsule on the same numbers.
   */
  micYield: { outMs: 120, scale: 0.85, backDelayMs: 160, backFadeMs: 160 },
  /**
   * Colour changes run only while `.is-morphing` is on (reaching CSS as `--composer-tone-ms`).
   * T1 / T2 recolour the circle; T3 / T5 take the key between primary and ink; a chip recolours
   * with TxModeChip's 240ms.
   */
  tone: { circleMs: 180, islandMs: 200, chipMs: 240 },
  /** = TxModeChip: the icon leads, the old label is gone in ~80ms, the new one sharpens over 280. */
  chip: { labelDelayMs: 50, labelFadeMs: 280, labelBlurPx: 6, widthMs: 300 },
  /** T4: the stop square ticks once when the first token lands. */
  firstTokenTick: { scale: 1.06, ms: 240 },
  /**
   * Read by CSS through inline custom properties (`--composer-ring-*`). `settleMs`: leaving the
   * wait, the breath is let go to full over this long (T4) — a removed CSS animation would snap.
   */
  ring: { turnMs: 2400, breatheMs: 1400, settleMs: 300 },
  mic: {
    /** Level frames kept for the dictation capsule's waveform (≈10 Hz, so 2.4s of history). */
    levelHistory: 24,
    /** One bar plus its gap, px: the waveform shows as many bars as the capsule has room for. */
    barStride: 4.5,
    /**
     * D10-f: the capsule grows left over the model pill it covers, measured at the press, and is
     * exactly that wide; this is its width when nothing was measured, the waveform-plus-timer size.
     */
    capsuleMinPx: 96,
    /** Room the `m:ss` timer takes in the capsule, px. */
    timerPx: 30,
    /** The capsule's content opens once the key has some width to show it in. */
    contentDelayMs: 100,
    /** Neither `ready` nor a level frame by then: the microphone is not answering. */
    captureWatchdogMs: 2000
  },
  /** A launch whose turn never started puts the arrow back after this long. */
  launchSettleMs: 200
} as const

let morph: ResolvedTransition | null = null
let release: ResolvedTransition | null = null
let snappy: ResolvedTransition | null = null

/** Resolved on first use, never at import: the compiler probes `CSS.supports` for `linear()`. */
export function morphCurve(): ResolvedTransition {
  morph ??= resolveTransition(MORPH_SPRING)
  return morph
}

export function releaseCurve(): ResolvedTransition {
  release ??= resolveTransition(RELEASE_SPRING)
  return release
}

/** The library's `snappy` preset: 400ms, 1.4% overshoot. */
export function snappyCurve(): ResolvedTransition {
  snappy ??= resolveTransition('snappy')
  return snappy
}

export function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * `element.animate`, or `null` where the runtime has none (jsdom). Keyframes go through a
 * lib-agnostic type: the pinned DOM lib predates individual `scale` / `translate` / `rotate`
 * keyframes, which the runtime (Chromium 146) supports.
 */
export function animateElement(
  element: Element | null | undefined,
  keyframes: Record<string, string | number>[],
  options: KeyframeAnimationOptions
): Animation | null {
  if (!element || typeof element.animate !== 'function') return null
  return element.animate(keyframes as unknown as Keyframe[], options)
}

/** A numeric CSS length (`'72px'`) or `fallback` when it does not parse. */
export function readPx(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

/** The element's current `scale` (an individual transform property); 1 for `none` or unreadable. */
export function readScale(element: Element): number {
  if (!hasWindow()) return 1
  const value = getComputedStyle(element).scale
  if (!value || value === 'none') return 1
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 1
}

export type FrameProperty = 'opacity' | 'scale' | 'translate'
export type Frame = Partial<Record<FrameProperty, string>>

/**
 * Where `element` visibly is for `properties`, a running animation included. Read it before that
 * animation is cancelled and start the next one from it, and an interrupted exit or entrance carries
 * on from the frame on screen instead of snapping to a keyframe first. This is `commitStyles()` +
 * `cancel()` without the committed inline style, which would outrank the class-driven rest every
 * state here ends on. Unreadable values are left out, so spreading the result over a keyframe keeps
 * that keyframe's own value (jsdom reads none).
 */
export function readFrame(
  element: Element | null | undefined,
  properties: readonly FrameProperty[]
): Frame {
  const frame: Frame = {}
  if (!element || !hasWindow()) return frame
  const style = getComputedStyle(element)
  for (const property of properties) {
    const value = style.getPropertyValue(property).trim()
    if (value) frame[property] = value
  }
  return frame
}

/**
 * Whether an entrance has anything on screen to continue from. An element still visible was
 * caught leaving and turns back from where it is; an invisible one enters from its designed start.
 */
export function isShowing(frame: Frame): boolean {
  const opacity = Number.parseFloat(frame.opacity ?? '')
  return Number.isFinite(opacity) && opacity > 0.01
}

export type KeyframeValues = Record<string, string | number>

/**
 * The first keyframe of an exit: `rest` for an element at rest, or — caught entering — the frame
 * its entrance had reached. Read it before the running animations are cancelled.
 */
export function exitFrame(
  element: Element | null | undefined,
  rest: KeyframeValues,
  properties: readonly FrameProperty[] = ['opacity', 'scale']
): KeyframeValues {
  return { ...rest, ...readFrame(element, properties) }
}

/**
 * The first keyframe of an entrance: its designed `start`, unless the element was caught leaving
 * and is still on screen — then it turns back from there instead of vanishing to start over. When
 * nothing was on screen it returns `start` itself, so a caller can tell a fresh entrance apart.
 */
export function entryFrame(
  element: Element | null | undefined,
  start: KeyframeValues,
  properties: readonly FrameProperty[] = ['opacity', 'scale']
): KeyframeValues {
  const current = readFrame(element, ['opacity', ...properties])
  return isShowing(current) ? { ...start, ...current } : start
}
