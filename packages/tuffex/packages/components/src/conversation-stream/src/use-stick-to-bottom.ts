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
  let lastScrollTop = 0
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
  /** Floating-point scroll position carried across frames so sub-pixel steps advance on 1x displays. */
  let springPos = 0

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
    const target = Math.max(0, el.scrollHeight - el.clientHeight)
    // User dragged the scrollbar or pressed PageUp before the async `scroll`
    // event arrived — yield immediately instead of pulling them back down.
    if (el.scrollTop < lastScrollTop - 2 && el.scrollTop < target - 2) {
      programmatic = false
      springV = 0
      lastScrollTop = el.scrollTop
      springPos = el.scrollTop
      following.value = false
      atBottom.value = measure()
      return
    }

    // Clamped so a backgrounded tab resumes smoothly instead of teleporting.
    const dt = Math.min(0.05, Math.max(0.001, (now - springLast) / 1000))
    springLast = now

    // Keep sub-pixel remainder across frames, but resync if layout or external
    // code moved scrollTop further than the fractional DPR rounding band.
    if (Math.abs(el.scrollTop - springPos) > 2.5)
      springPos = el.scrollTop

    const prevTop = el.scrollTop
    const error = target - springPos
    if (error <= 0) {
      // Already at or past target (e.g. a thinking block collapsed): never step backwards.
      springV = 0
      springPos = el.scrollTop
      lastScrollTop = el.scrollTop
      atBottom.value = measure()
      if (target - el.scrollTop <= 2)
        programmatic = false
      return
    }

    // Exact closed-form step of a critically-damped spring:
    //   x(t) = T + exp(-ωt) * (A + B·t),  A = x0 - T = -error,  B = v0 - ω·error
    // Unconditionally stable and monotonic for any dt — unlike semi-implicit
    // Euler, which flips velocity sign past dt > 1/(2ω) (~22.7ms) and explodes
    // into up/down oscillation when long streaming content drops below 30fps.
    const v0 = Math.max(0, springV)
    const decay = Math.exp(-FOLLOW_OMEGA * dt)
    const c2 = v0 - FOLLOW_OMEGA * error
    const nextPos = target + decay * (-error + c2 * dt)
    const nextV = Math.max(0, decay * (v0 - FOLLOW_OMEGA * c2 * dt))

    programmatic = true
    if (nextPos >= target - 0.5) {
      el.scrollTop = target
      springPos = el.scrollTop
      lastScrollTop = el.scrollTop
      springV = 0
      atBottom.value = measure()
      const moved = Math.abs(el.scrollTop - prevTop) > 0.25
      if (!moved)
        programmatic = false
      return
    }

    springPos = Math.max(springPos, nextPos)
    springV = nextV
    el.scrollTop = springPos
    lastScrollTop = el.scrollTop
    atBottom.value = measure()

    // Fractional DPR / sub-pixel layout heights can cap Chromium's actual max
    // scrollTop 0.5–1.5px below `scrollHeight - clientHeight`. Once virtual
    // progress clears a full pixel past the clamped scrollTop inside that 2px
    // rounding band without moving it, we have hit the physical bottom — stop
    // instead of spinning rAF and holding `programmatic` forever.
    if (target - el.scrollTop <= 2 && springPos - el.scrollTop >= 1.05 && Math.abs(el.scrollTop - prevTop) <= 0.05) {
      springV = 0
      springPos = el.scrollTop
      programmatic = false
      return
    }

    springRaf = requestAnimationFrame(springStep)
  }

  function springFollow(): void {
    // Already chasing: the per-frame target re-read absorbs the new growth —
    // restarting here would zero the velocity and stutter.
    if (springRaf)
      return
    const el = element.value
    if (el) {
      springPos = el.scrollTop
      lastScrollTop = el.scrollTop
    }
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
    const el = element.value
    atBottom.value = measure()
    if (programmatic) {
      // A downward programmatic scroll never decreases scrollTop unless content
      // shrank and clamped it to the new bottom. Any upward jump landing above
      // the bottom is a real user escape (scrollbar drag, PageUp, touch) —
      // including while a streaming spring is in flight. (An active fixed
      // tween checks for upward escapes on its own rAF steps.)
      if (el && !tweening && el.scrollTop < lastScrollTop - 2 && el.scrollTop < el.scrollHeight - el.clientHeight - 2) {
        programmatic = false
        tweenSeq += 1
        tweening = false
        stopSpring()
        lastScrollTop = el.scrollTop
        springPos = el.scrollTop
        following.value = false
        return
      }
      // Release only on arrival at the *live* bottom, not the recorded one:
      // virtualized spacers settle a frame after a send, so the destination
      // measured at issue time can be stale — releasing there lets the
      // browser's own scroll-anchoring adjustment read as a user scroll and
      // kill following. Allow a 2px tolerance for fractional DPR rounding.
      if (!el || el.scrollTop >= el.scrollHeight - el.clientHeight - 2) {
        programmatic = false
        if (el) {
          lastScrollTop = el.scrollTop
          springPos = el.scrollTop
        }
      }
      else if (el) {
        lastScrollTop = Math.max(lastScrollTop, el.scrollTop)
      }
      return
    }
    if (el) {
      const movedUp = el.scrollTop < lastScrollTop - 0.5
      const movedDown = el.scrollTop > lastScrollTop + 0.5
      lastScrollTop = el.scrollTop
      springPos = el.scrollTop
      if (movedUp && el.scrollTop < el.scrollHeight - el.clientHeight - 2) {
        // An upward scroll (including the scroll event right after a small
        // upward trackpad wheel delta still within `threshold`) must disengage
        // rather than re-arming `following` and fighting the user back down.
        following.value = false
      }
      else if (following.value) {
        following.value = atBottom.value
      }
      else if (movedDown && atBottom.value) {
        // Re-engage only when the reader actively scrolls down into the bottom zone.
        following.value = true
      }
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
    if (element.value) {
      lastScrollTop = element.value.scrollTop
      springPos = element.value.scrollTop
    }
    atBottom.value = measure()
  }

  /**
   * Records a host-driven anchor compensation (prepend or above-viewport row
   * measurement) without changing `following` — otherwise the browser's async
   * `scroll` event for that shift would read as a user scroll.
   */
  function syncPosition(): void {
    const el = element.value
    if (!el)
      return
    lastScrollTop = el.scrollTop
    springPos = el.scrollTop
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
    lastScrollTop = el.scrollTop
    springPos = el.scrollTop
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
    lastScrollTop = from
    springPos = from
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
        const target = Math.max(0, live.scrollHeight - live.clientHeight)
        if (live.scrollTop < lastScrollTop - 2 && live.scrollTop < target - 2) {
          programmatic = false
          lastScrollTop = live.scrollTop
          springPos = live.scrollTop
          following.value = false
          atBottom.value = measure()
          settle(false)
          return
        }
        const t = Math.min(1, (now - start) / duration)
        // Ease-out cubic: a scroll should decelerate into place, not bounce.
        const eased = 1 - (1 - t) ** 3
        const prev = live.scrollTop
        live.scrollTop = from + (target - from) * eased
        lastScrollTop = live.scrollTop
        springPos = live.scrollTop
        atBottom.value = measure()
        if (t >= 1) {
          if (Math.abs(live.scrollTop - prev) < 0.25 && target - live.scrollTop <= 2)
            programmatic = false
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

  return { atBottom, following, handleScroll, handleWheel, syncPosition, scrollToBottom, tweenToBottom, followIfSticking }
}
