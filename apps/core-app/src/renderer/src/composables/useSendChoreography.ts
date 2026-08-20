import { reactive } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'

/**
 * The send choreography — the whole motion score for a chat turn, lifted out of
 * HomePage so it can be reasoned about (and tested) without the 2,600-line view
 * around it.
 *
 * A composable rather than a component on purpose: this drives three sibling
 * subtrees at once (the composer group, the greeting/pills, the transcript
 * rows) plus the stream's imperative scroll API. A component owns a subtree;
 * this owns a score.
 *
 * Arrival physics — the iMessage collision, done as one system: every new
 * message flies in on a damped spring and, at the moment it lands, knocks the
 * thread above it upward in a decaying wave. Both curves are sampled offline
 * because WAAPI has no spring primitive.
 */

/**
 * Step response of a ζ=0.62 spring (one ~8% overshoot, then a settle): `x` is
 * the eased position 0→1 and `v` the normalized velocity, which drives the
 * jelly stretch — a bubble is longest while it moves fastest, and the brief
 * negative tail squashes it as the overshoot springs back.
 */
const SPRING = [
  { o: 0, x: 0, v: 0 },
  { o: 0.036, x: 0.041, v: 0.538 },
  { o: 0.071, x: 0.139, v: 0.847 },
  { o: 0.107, x: 0.269, v: 0.985 },
  { o: 0.143, x: 0.409, v: 1 },
  { o: 0.179, x: 0.544, v: 0.934 },
  { o: 0.214, x: 0.667, v: 0.821 },
  { o: 0.25, x: 0.772, v: 0.685 },
  { o: 0.286, x: 0.858, v: 0.544 },
  { o: 0.321, x: 0.925, v: 0.412 },
  { o: 0.357, x: 0.974, v: 0.294 },
  { o: 0.393, x: 1.008, v: 0.195 },
  { o: 0.429, x: 1.029, v: 0.116 },
  { o: 0.5, x: 1.046, v: 0.012 },
  { o: 0.571, x: 1.041, v: -0.035 },
  { o: 0.643, x: 1.03, v: -0.046 },
  { o: 0.714, x: 1.017, v: -0.04 },
  { o: 0.821, x: 1.004, v: -0.021 },
  { o: 0.929, x: 0.999, v: -0.007 },
  { o: 1, x: 1, v: 0 }
] as const

const SPRING_MS = 410
/** Where `x` first crosses its target — the impact that launches the wave. */
const SPRING_IMPACT_MS = 161

/**
 * How a resting row rings after being hit from below. Not a raw spring
 * impulse: the onset is mass-shaped (quadratic-ish — a row accelerates, it
 * doesn't twitch), the crown at ~16% is round, and the counter-swing is a
 * gentle −7% rather than a wobble.
 *
 * Sampling has to be dense through the rise and crest because WAAPI interpolates
 * between keyframes linearly, so every pair of samples is a straight line and
 * every sample a potential corner. The original table was sparse there and did
 * carry two: at the 18px amplitude the nearest row gets, velocity changed by
 * 4.06px/frame at the onset (t≈56ms) and 4.23px/frame at the crest (t≈101ms) —
 * the row rushed up and stopped dead at the top instead of settling into it,
 * and the crest is the frame the eye is actually on.
 *
 * The in-between points below are a Catmull-Rom resampling of the original
 * anchors, which are all still here at their exact values: the designed shape is
 * untouched, only the straight lines between it are. Worst corner drops to
 * 2.36px/frame and moves into the fast part of the rise where it cannot be seen;
 * the crest corner is gone. The crown rounds from 0.995 to 1.0003, which is
 * 0.005px — below a pixel, and in the direction the crown wanted anyway.
 */
const IMPULSE = [
  { o: 0, y: 0 },
  { o: 0.013, y: 0.0077 },
  { o: 0.0315, y: 0.0248 },
  { o: 0.05, y: 0.084 },
  { o: 0.067, y: 0.2133 },
  { o: 0.0841, y: 0.3848 },
  { o: 0.1, y: 0.547 },
  { o: 0.1141, y: 0.6915 },
  { o: 0.127, y: 0.8268 },
  { o: 0.14, y: 0.927 },
  { o: 0.1533, y: 0.974 },
  { o: 0.1667, y: 0.9858 },
  { o: 0.18, y: 0.991 },
  { o: 0.193, y: 0.999 },
  { o: 0.2059, y: 1.0003 },
  { o: 0.22, y: 0.995 },
  { o: 0.2359, y: 0.9825 },
  { o: 0.253, y: 0.9634 },
  { o: 0.27, y: 0.939 },
  { o: 0.2863, y: 0.9101 },
  { o: 0.3026, y: 0.8759 },
  { o: 0.32, y: 0.836 },
  { o: 0.3389, y: 0.7895 },
  { o: 0.3589, y: 0.7373 },
  { o: 0.38, y: 0.681 },
  { o: 0.45, y: 0.49 },
  { o: 0.52, y: 0.314 },
  { o: 0.6, y: 0.151 },
  { o: 0.68, y: 0.035 },
  { o: 0.76, y: -0.036 },
  { o: 0.84, y: -0.05 },
  { o: 0.92, y: -0.02 },
  { o: 1, y: 0 }
] as const

const IMPULSE_MS = 560

/**
 * The wave fires well *before* the arrival spring's first crossing: the
 * knocked rows' mass-shaped onset takes ~0.2×IMPULSE_MS to build, and the
 * lead is what makes their crest coincide with the landing — the rows read
 * as giving way under the approach, not as being slapped after it.
 */
const KNOCK_LEAD_MS = 110

/**
 * The send flight's own curve — a drop of liquid leaving the composer. Three
 * regimes, position- and velocity-continuous: a lazy jerk ramp (half the time
 * covers barely two fifths of the distance), a compressed rush where velocity
 * peaks just past the split (o≈0.58), and a soft capture — ~3% overshoot
 * gliding home slowly, so the landing reads as absorbed rather than slammed.
 * Baked offline like SPRING; `v` is normalized to its peak.
 */
const FLIGHT = [
  { o: 0, x: 0, v: 0 },
  { o: 0.1, x: 0.003, v: 0.023 },
  { o: 0.2, x: 0.025, v: 0.09 },
  { o: 0.28, x: 0.069, v: 0.177 },
  { o: 0.35, x: 0.134, v: 0.276 },
  { o: 0.41, x: 0.215, v: 0.379 },
  { o: 0.46, x: 0.304, v: 0.477 },
  { o: 0.5, x: 0.391, v: 0.563 },
  { o: 0.54, x: 0.492, v: 0.657 },
  { o: 0.58, x: 0.629, v: 0.982 },
  { o: 0.62, x: 0.791, v: 0.905 },
  { o: 0.66, x: 0.918, v: 0.612 },
  { o: 0.7, x: 0.994, v: 0.315 },
  { o: 0.74, x: 1.027, v: 0.102 },
  { o: 0.79, x: 1.032, v: -0.032 },
  { o: 0.85, x: 1.018, v: -0.063 },
  { o: 0.92, x: 1.004, v: -0.034 },
  { o: 1, x: 1, v: 0 }
] as const

const FLIGHT_MS = 460
/** The split — velocity peaks, the composer lets go, its recoil fires here. */
const FLIGHT_SPLIT_MS = 253
/** First crossing of the resting place — the strike lands here. */
export const FLIGHT_IMPACT_MS = 324
/** How deep the bubble starts sunk into the composer while fused with it. */
const FLIGHT_SINK_PX = 8

/**
 * How far the tracked landing may move in one frame while the clone is still in
 * the air.
 *
 * Tracking the row's live rect is what makes the landing exact, but it also
 * means the clone inherits every layout correction at full size and in a single
 * frame. Late in the flight the curve has covered ~100% of the distance, so a
 * correction of Δ moves the clone by nearly all of Δ at once: measured against a
 * -60px correction at t=350ms, one frame moved -61.8px while its neighbours
 * moved -3.2px and +3.0px — a twentyfold discontinuity, landing exactly where
 * the eye is watching. The causes are the ones named below: the composer
 * collapse settling a frame late, and the virtualizer trading its estimated row
 * height for a measured one.
 *
 * A rate limit rather than jump detection, because it needs no classification:
 * the scroll glide moves the row a few px a frame and never reaches the cap, so
 * it is followed exactly as before, byte for byte. Only a correction hits the
 * cap, and the remainder bleeds off over the following frames. The cap sits
 * under the flight's own peak (~42px/frame at 60Hz) so an absorbed correction
 * still reads as motion the flight was already making.
 */
const CORRECTION_MAX_STEP_PX = 28

/** The "make room" glide before the strike — fixed, however far away the reader was. */
export const SCROLL_TWEEN_MS = 280

/** Linear interpolation over the baked FLIGHT table (offsets are monotonic). */
export function sampleFlight(o: number): { x: number; v: number } {
  if (o <= 0) return { x: 0, v: 0 }
  if (o >= 1) return { x: 1, v: 0 }
  for (let i = 1; i < FLIGHT.length; i++) {
    const b = FLIGHT[i]
    if (o <= b.o) {
      const a = FLIGHT[i - 1]
      const t = (o - a.o) / (b.o - a.o)
      return { x: a.x + (b.x - a.x) * t, v: a.v + (b.v - a.v) * t }
    }
  }
  return { x: 1, v: 0 }
}

/**
 * WAAPI through lib-agnostic parameter types: the DOM lib pinned by the
 * toolchain predates `filter` keyframes and additive `composite`, both of
 * which the runtime (Chromium 130+) supports.
 */
function animateRaw(
  el: HTMLElement,
  frames: Record<string, string | number>[],
  options: Record<string, string | number>
): Animation {
  return el.animate(
    frames as unknown as Parameters<HTMLElement['animate']>[0],
    options as unknown as Parameters<HTMLElement['animate']>[1]
  )
}

export function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export interface SendChoreographyOptions {
  /** Where the flight clone is parked — the page root, outside the scroller. */
  host: () => HTMLElement | null
  /** The stream's scroller, read only for the "this send barely travels" bail. */
  scroller: () => HTMLElement | null
  /** The composer group; the FLIP travels the group so the pills ride along. */
  composerGroup: () => HTMLElement | null
  /** The composer itself, used as the FLIP fallback and the recoil target. */
  composer: () => HTMLElement | null
}

export interface SendFlightHandle {
  /** Resolves when the bubble reaches its resting place. */
  impact: Promise<void>
}

export interface SendChoreography {
  /** Ids whose entrance has not finished; the row template renders these hidden. */
  enteringMessages: Set<string>
  markEntering: (ids: string[]) => void
  playEntrance: (id: string, strength?: number) => void
  playSend: (messageId: string, composerEl: HTMLElement | null) => SendFlightHandle | null
  playComposerFlip: (deltaY: number) => void
  /**
   * Runs `fn` after `delay` unless a newer send — or an unmount — took the
   * stage first. Registered, so it dies with `cancel()`.
   */
  scheduleForCurrentSend: (fn: () => void, delay: number) => void
  /** Bumps the sequence so a half-played score stops claiming the stage. */
  invalidate: () => void
  /** Cancels every pending beat — call on unmount. */
  cancel: () => void
}

export function useSendChoreography(options: SendChoreographyOptions): SendChoreography {
  /** Stamps each send's choreography; a newer send silences the older one's pending beats. */
  let sendSeq = 0

  /**
   * Ids of messages whose entrance has not finished. The template renders them
   * at `opacity: 0` so the fresh row never flashes at rest before its WAAPI
   * spring takes over; ids leave the set when the animation settles, so a
   * virtualized remount (scrolling back up) stays still. Filled only while a
   * turn is streaming — restoring a stored thread never replays entrances.
   */
  const enteringMessages = reactive(new Set<string>())

  // Every deferred beat is registered here so `cancel()` can actually cancel.
  // Before this, unmounting mid-flight left knocks and un-hides to fire against
  // whatever happened to be on screen next.
  const timers = new Set<number>()
  function schedule(fn: () => void, delay: number): void {
    const handle = window.setTimeout(() => {
      timers.delete(handle)
      fn()
    }, delay)
    timers.add(handle)
  }

  function messageElement(id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)
  }

  /** Spring keyframes for a bubble rising `rise`px into place, jelly included. */
  function arrivalKeyframes(rise: number, jelly: number): Record<string, string | number>[] {
    return SPRING.map(({ o, x, v }) => ({
      offset: o,
      transform:
        `translateY(${((1 - x) * rise).toFixed(2)}px) ` +
        `scale(${(1 - jelly * 0.5 * v).toFixed(4)}, ${(1 + jelly * v).toFixed(4)})`,
      opacity: Math.min(1, o / 0.18)
    }))
  }

  /**
   * The collision itself: rows above the landing bubble ring like a chain of
   * sprung masses — nearer rows harder and sooner, farther rows later, slower
   * and duller, the way a real chain disperses. Pure translation: deformation
   * belongs to the incoming bubble; a neighbour that squashes while it lifts
   * reads as two motions fighting. Amplitudes die inside four rows.
   */
  function knockRows(origin: HTMLElement, strength: number): void {
    if (prefersReducedMotion()) return
    // Scoped to the origin's own stream: during a thread-switch crossfade both
    // the leaving and entering transcripts are mounted, and a document-wide
    // query would ring rows across the two.
    const scope = origin.closest<HTMLElement>('.HomePage-Stream') ?? origin.ownerDocument
    const rows = Array.from(scope.querySelectorAll<HTMLElement>('[data-message-id]'))
    const index = rows.indexOf(origin)
    if (index <= 0) return

    const amplitudes = [18, 12, 7, 3.5]
    amplitudes.forEach((amplitude, order) => {
      const row = rows[index - 1 - order]
      const lift = amplitude * strength
      if (!row || lift < 0.75) return
      // Promoted for the ring, released after: four rows composited at once is
      // fine, four rows promoted forever is memory.
      row.style.willChange = 'transform'
      const clear = (): void => {
        row.style.willChange = ''
      }
      const wave = animateRaw(
        row,
        IMPULSE.map(({ o, y }) => ({
          offset: o,
          transform: `translateY(${(-lift * y).toFixed(2)}px)`
        })),
        // Dispersion: each hop through the chain loses pace as well as height.
        {
          duration: Math.round(IMPULSE_MS * (1 + 0.15 * order)),
          delay: order * 42,
          easing: 'linear'
        }
      )
      void wave.finished.then(clear).catch(clear)
    })
  }

  /** A reply surfaces from just below its resting place and nudges the thread. */
  function playEntrance(id: string, strength = 0.6): void {
    const el = messageElement(id)
    if (!el) {
      enteringMessages.delete(id)
      return
    }
    // `backwards`, not `both`: the first keyframe covers the pre-start frame
    // (the `--enter` class covers the pre-animation render), and leaving no
    // forward fill means a finished entrance holds no composited state. The
    // hide class leaves at impact, while the animation still owns opacity —
    // never at the finish edge, where removal could flash.
    animateRaw(el, arrivalKeyframes(26, 0.07), {
      duration: SPRING_MS,
      easing: 'linear',
      fill: 'backwards'
    })
    if (strength > 0) {
      // Sequence-stamped: a rapid follow-up send or a thread switch owns the
      // stage by the time this fires, and a stale knock would hit its rows.
      const seq = sendSeq
      schedule(() => {
        if (seq === sendSeq) knockRows(el, strength)
      }, SPRING_IMPACT_MS - KNOCK_LEAD_MS)
    }
    // Deliberately unstamped: un-hiding is idempotent and must survive any
    // sequence bump, or the row stays at opacity 0 forever.
    schedule(() => enteringMessages.delete(id), SPRING_IMPACT_MS)
  }

  /**
   * The send flight, iMessage's own trick: a fixed-position CLONE of the bubble
   * flies from the composer to the hidden real bubble's position — re-read from
   * its live rect every frame — while the thread slides independently
   * underneath. Decoupling flight from scroll is what lets the drop leave the
   * composer on press, with no queueing behind the glide; tracking the live
   * rect is what makes the landing exact wherever layout finally settles.
   *
   * No blur: per-frame `blur()` radius changes force a re-raster of the bubble
   * texture every frame, which is exactly the stutter this replaces. The jelly
   * stretch carries the speed instead — fast things deform, crisp.
   *
   * Beats fire off the same per-frame clock that drives the clone (split →
   * recoil, impact → knock, finish → swap clone for the real row) — wall-clock
   * timers drifted a frame or two under load and landed the knock after the eye
   * had already seen the touch-down.
   */
  function playSend(messageId: string, composerEl: HTMLElement | null): SendFlightHandle | null {
    const bail = (): null => {
      enteringMessages.delete(messageId)
      return null
    }
    if (!composerEl || prefersReducedMotion()) return bail()
    const bubble = messageElement(messageId)
    if (!bubble) return bail()

    const host = options.host()
    if (!host) return bail()
    const scroller = options.scroller()
    const bubbleRect = bubble.getBoundingClientRect()
    // Estimate only, and only for the bail: the flight itself never trusts a
    // precomputed landing (see `place` below) — but a send whose travel rounds
    // to nothing should still skip the whole apparatus.
    const owed = scroller
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop)
      : 0
    const launchTop = composerEl.getBoundingClientRect().top
    if (launchTop - (bubbleRect.top - owed) < 4) return bail()

    const clone = bubble.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-message-id') // the knock query must not hit the stand-in
    clone.setAttribute('aria-hidden', 'true')
    clone.classList.remove('HomePage-Message--enter')
    // The layer comes from the class, not from here: it belongs on the same scale
    // as the composer it has to stay under, and a number written at this site
    // drifts out of that scale silently. The clone keeps the scope attribute it
    // inherited from the real row, so the scoped rule still matches it.
    clone.classList.add('HomePage-FlightClone')
    Object.assign(clone.style, {
      position: 'fixed',
      top: '0px',
      left: `${bubbleRect.left}px`,
      width: `${bubbleRect.width}px`,
      margin: '0',
      pointerEvents: 'none',
      willChange: 'transform'
    } satisfies Partial<CSSStyleDeclaration>)
    host.appendChild(clone)

    // Not a baked WAAPI track. Every prior pass precomputed the landing at
    // press time — while the composer collapse (its ResizeObserver lands a
    // frame later), the glide's continuously re-read scroll target and the
    // virtualizer's estimated height for the never-measured new row were all
    // still moving — so the clone-for-row swap jumped by the accumulated error,
    // worse the longer the draft. Sampling the spring per frame against the
    // hidden real row's LIVE rect makes the last frame the row's actual
    // position by construction; every layout correction pulls the clone along.
    const start = performance.now()
    // The landing the clone is flying at. It chases the row's live rect, rate
    // limited so a correction is absorbed over a few frames instead of teleporting
    // the bubble (see CORRECTION_MAX_STEP_PX); at the finish it is the live rect
    // exactly, which is what keeps the clone-for-row swap invisible.
    let tracked = Number.NaN
    let lastElapsed = 0
    const place = (elapsed: number): void => {
      const o = Math.min(1, elapsed / FLIGHT_MS)
      const { x, v } = sampleFlight(o)
      const targetTop = bubble.getBoundingClientRect().top
      const frames = Math.max(1, (elapsed - lastElapsed) / 16.67)
      lastElapsed = elapsed
      if (Number.isNaN(tracked) || o >= 1) {
        tracked = targetTop
      } else {
        const step = CORRECTION_MAX_STEP_PX * frames
        const drift = targetTop - tracked
        tracked += Math.max(-step, Math.min(step, drift))
      }
      const y = tracked + (1 - x) * (launchTop + FLIGHT_SINK_PX - tracked)
      // The bubble emerges slightly small, as if still part of the box, and
      // the jelly stretch rides the velocity on top of that.
      const emerge = 0.94 + 0.06 * Math.min(1, o / 0.45)
      clone.style.transform =
        `translateY(${y.toFixed(1)}px) ` +
        `scale(${(emerge * (1 - 0.05 * v)).toFixed(4)}, ${(emerge * (1 + 0.14 * v)).toFixed(4)})`
      clone.style.opacity = String(Math.min(1, 0.4 + o * 1.35))
    }

    let impactResolve: () => void = () => {}
    const impact = new Promise<void>((resolve) => {
      impactResolve = resolve
    })
    const seq = sendSeq
    let recoiled = false
    let knocked = false
    let landed = false
    let done = false

    // The swap: the clone's landing pose is exactly the real row's rest, so
    // revealing one while removing the other is invisible.
    const finish = (): void => {
      if (done) return
      done = true
      enteringMessages.delete(messageId)
      clone.remove()
      impactResolve()
    }

    const watchFrame = (): void => {
      if (done) return
      // A newer send owns the stage now; this flight ends where it stands.
      if (seq !== sendSeq) {
        finish()
        return
      }
      const elapsed = performance.now() - start
      if (elapsed >= FLIGHT_MS) {
        // Land exactly on the live row, then swap inside the same paint.
        place(FLIGHT_MS)
        finish()
        return
      }
      place(elapsed)
      if (!recoiled && elapsed >= FLIGHT_SPLIT_MS) {
        recoiled = true
        // Recoil at the split — the box springs back the moment the drop snaps
        // free. Composited additively so it stacks on the first-send FLIP.
        animateRaw(
          composerEl,
          [
            { transform: 'scale(1)' },
            { transform: 'scale(0.985)', offset: 0.35 },
            { transform: 'scale(1)' }
          ],
          { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', composite: 'add' }
        )
      }
      if (!knocked && elapsed >= FLIGHT_IMPACT_MS - KNOCK_LEAD_MS) {
        knocked = true
        // A full-strength hit: the bubble arrives carrying the send's momentum.
        knockRows(bubble, 1)
      }
      if (!landed && elapsed >= FLIGHT_IMPACT_MS) {
        landed = true
        impactResolve()
      }
      requestAnimationFrame(watchFrame)
    }
    place(0)
    requestAnimationFrame(watchFrame)

    return { impact }
  }

  /**
   * The composer's dock/undock journey rides the same spring as the messages —
   * a slight overshoot past its destination and a whisper of jelly, so landing
   * reads as a soft impact rather than an ease-out stop. Sign-agnostic: the
   * first-send drop and the new-conversation rise share it. The *group* is what
   * travels, so the quick pills dissolve in place on the composer's back
   * instead of detaching the moment the dock class flips the layout.
   */
  function playComposerFlip(deltaY: number): void {
    const el = options.composerGroup() ?? options.composer()
    if (!el) return
    animateRaw(
      el,
      SPRING.map(({ o, x, v }) => {
        // The messages' full 8% rebound scaled to a box this big reads as a
        // wobble, not a landing — compress the overshoot to ~3% and let the
        // jelly carry the impact instead. Vertical only: an X squeeze on a
        // 720px-wide box is a visible ±8px breathing of its edges.
        const xc = x > 1 ? 1 + (x - 1) * 0.35 : x
        return {
          offset: o,
          transform:
            `translateY(${((1 - xc) * deltaY).toFixed(1)}px) ` +
            `scaleY(${(1 + 0.022 * v).toFixed(4)})`
        }
      }),
      { duration: 520, easing: 'linear' }
    )
  }

  function markEntering(ids: string[]): void {
    for (const id of ids) enteringMessages.add(id)
  }

  function scheduleForCurrentSend(fn: () => void, delay: number): void {
    const seq = sendSeq
    schedule(() => {
      if (seq === sendSeq) fn()
    }, delay)
  }

  function invalidate(): void {
    sendSeq += 1
  }

  function cancel(): void {
    for (const handle of timers) window.clearTimeout(handle)
    timers.clear()
    // Any in-flight clone reads this on its next frame and retires itself.
    sendSeq += 1
  }

  return {
    enteringMessages,
    markEntering,
    playEntrance,
    playSend,
    playComposerFlip,
    scheduleForCurrentSend,
    invalidate,
    cancel
  }
}
