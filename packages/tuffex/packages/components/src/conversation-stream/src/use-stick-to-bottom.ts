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
    following.value = false
    atBottom.value = measure()
  }

  function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
    const el = element.value
    if (!el)
      return
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

  /** Called when content grew (stream delta, new message). */
  function followIfSticking(): void {
    if (following.value)
      scrollToBottom('auto')
  }

  return { atBottom, following, handleScroll, handleWheel, scrollToBottom, followIfSticking }
}
