import type { Ref } from 'vue'
import { ref } from 'vue'

export interface StickToBottomOptions {
  /** How close to the bottom still counts as "at the bottom". */
  threshold?: number
}

/**
 * Follow-the-stream policy: keep the user pinned to the bottom while they are
 * already there, and never yank them back once they scroll away.
 *
 * Programmatic scrolls are disambiguated from user scrolls by *position*, not
 * by bottom-ness: the guard remembers where the programmatic scroll was going
 * and releases when an event arrives at (or past) that position. Arrival must
 * not be judged by `atBottom` — content routinely grows between issuing the
 * scroll and its async event, so the event can land "not at the bottom
 * anymore" while being exactly the scroll we asked for; reading that as the
 * user walking away would silently disarm following. Any upward wheel input
 * still cancels everything immediately — the user always wins.
 */
export function useStickToBottom(
  element: Ref<HTMLElement | null>,
  options: StickToBottomOptions = {},
) {
  const threshold = options.threshold ?? 80
  const atBottom = ref(true)
  const following = ref(true)
  let programmatic = false
  /** Bumped to cancel an in-flight tween; also true-flagged so growth follows defer to it. */
  let tweenSeq = 0
  let tweening = false

  /**
   * The streaming follower is a critically-damped spring, not a chain of
   * fixed-duration tweens: a tween ends at velocity zero, so per-delta
   * restarts read as a pulse — glide, stop, glide. The spring keeps its
   * velocity across retargets (the bottom is re-read every frame), which is
   * what makes token-by-token growth read as one continuous slide.
   *
   * ω = 22 settles a screenful in ~0.4s with no overshoot — scroll must
   * decelerate into place, never bounce.
   */
  const FOLLOW_OMEGA = 22
  let springRaf = 0
  let springV = 0
  let springLast = 0

  function stopSpring(): void {
    if (springRaf && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(springRaf)
    springRaf = 0
    springV = 0
  }

  function springStep(now: number): void {
    springRaf = 0
    const el = element.value
    // A tween that started after us owns the motion; the user walking away
    // ends the chase outright.
    if (!el || tweening || !following.value) {
      springV = 0
      return
    }
    // Clamped so a dropped frame integrates stably instead of exploding.
    const dt = Math.min(0.05, Math.max(0.001, (now - springLast) / 1000))
    springLast = now
    const target = Math.max(0, el.scrollHeight - el.clientHeight)
    const error = target - el.scrollTop
    // Semi-implicit Euler on a critically-damped spring.
    springV += (FOLLOW_OMEGA * FOLLOW_OMEGA * error - 2 * FOLLOW_OMEGA * springV) * dt
    programmatic = true
    el.scrollTop += springV * dt
    atBottom.value = measure()
    if (Math.abs(target - el.scrollTop) < 0.5 && Math.abs(springV) < 20) {
      el.scrollTop = target
      springV = 0
      return
    }
    springRaf = requestAnimationFrame(springStep)
  }

  function springFollow(): void {
    // Already chasing: the per-frame target re-read absorbs the new growth —
    // restarting here would zero the velocity and stutter.
    if (springRaf)
      return
    springLast = typeof performance !== 'undefined' ? performance.now() : 0
    springRaf = requestAnimationFrame(springStep)
  }

  function measure(): boolean {
    const el = element.value
    if (!el)
      return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  function handleScroll(): void {
    atBottom.value = measure()
    if (programmatic) {
      const el = element.value
      // Release only on arrival at the *live* bottom, not the recorded one:
      // virtualized spacers settle a frame after a send, so the destination
      // measured at issue time can be stale — releasing there lets the
      // browser's own scroll-anchoring adjustment read as a user scroll and
      // kill following. Real user escapes go through handleWheel, which
      // ignores this guard entirely.
      if (!el || el.scrollTop >= el.scrollHeight - el.clientHeight - 1)
        programmatic = false
      return
    }
    following.value = atBottom.value
  }

  function handleWheel(event: WheelEvent): void {
    if (event.deltaY >= 0)
      return
    programmatic = false
    tweenSeq += 1
    tweening = false
    stopSpring()
    following.value = false
    atBottom.value = measure()
  }

  function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
    const el = element.value
    if (!el)
      return
    // An explicit jump outranks a tween or spring still gliding there.
    tweenSeq += 1
    tweening = false
    stopSpring()
    following.value = true
    const before = el.scrollTop
    const target = Math.max(0, el.scrollHeight - el.clientHeight)
    if (typeof el.scrollTo === 'function')
      el.scrollTo({ top: el.scrollHeight, behavior })
    else
      el.scrollTop = el.scrollHeight
    atBottom.value = measure()
    // Arm the guard only when movement is actually pending — an instant
    // scroll that changed nothing emits no event, and a stale guard would
    // swallow the next real user scroll.
    if (behavior === 'smooth' ? target > before : el.scrollTop !== before)
      programmatic = true
  }

  /**
   * Glides to the bottom over a fixed duration instead of jumping — the
   * "make room first" beat of a send: the thread slides up as one motion,
   * and the caller learns when the space has finished opening.
   *
   * Driven by rAF rather than native smooth scrolling because the bottom is
   * a moving target (a reply can start streaming mid-glide): the target is
   * re-read every frame, and the fixed duration keeps the gesture identical
   * whether the reader was one line or one screen away. An upward wheel, an
   * explicit `scrollToBottom`, or a newer tween cancels it — resolves `true`
   * only when the glide actually landed.
   */
  function tweenToBottom(duration = 280): Promise<boolean> {
    const el = element.value
    if (!el)
      return Promise.resolve(false)
    if (typeof requestAnimationFrame !== 'function') {
      scrollToBottom()
      return Promise.resolve(true)
    }

    tweenSeq += 1
    const seq = tweenSeq
    tweening = true
    stopSpring()
    following.value = true
    programmatic = true
    const from = el.scrollTop
    const start = performance.now()

    return new Promise((resolve) => {
      const settle = (landed: boolean): void => {
        if (seq === tweenSeq)
          tweening = false
        resolve(landed)
      }
      const step = (now: number): void => {
        const live = element.value
        if (!live || seq !== tweenSeq) {
          settle(false)
          return
        }
        const t = Math.min(1, (now - start) / duration)
        // Ease-out cubic: a scroll should decelerate into place, not bounce.
        const eased = 1 - (1 - t) ** 3
        const target = Math.max(0, live.scrollHeight - live.clientHeight)
        live.scrollTop = from + (target - from) * eased
        atBottom.value = measure()
        if (t >= 1) {
          settle(true)
          return
        }
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }

  /**
   * Called when content grew (stream delta, new message). With `glideMs > 0`,
   * the follow rides the persistent spring instead of snapping — per-token
   * growth then reads as one continuous slide, not a stutter of jumps.
   * Deltas landing mid-chase are absorbed by the spring's per-frame target
   * re-read, with velocity carried through; a fixed-duration tween here
   * restarted from rest on every delta, which read as pulsing.
   */
  function followIfSticking(glideMs = 0): void {
    // A running tween already converges on the live bottom every frame; an
    // instant follow here would teleport past it mid-glide.
    if (tweening)
      return
    if (!following.value)
      return
    if (glideMs > 0 && typeof requestAnimationFrame === 'function') {
      springFollow()
      return
    }
    scrollToBottom('auto')
  }

  return { atBottom, following, handleScroll, handleWheel, scrollToBottom, tweenToBottom, followIfSticking }
}
