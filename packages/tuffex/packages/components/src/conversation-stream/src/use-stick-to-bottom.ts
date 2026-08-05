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
 * Programmatic scrolls are disambiguated from user scrolls without comparing
 * positions: a programmatic scroll only ever travels *toward* the bottom, so
 * the guard stays up until a scroll event lands inside the threshold, and any
 * upward wheel input cancels it immediately — the user always wins.
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
      // Smooth scrolls emit many intermediate events that are not the user
      // walking away — release the guard only on arrival.
      if (atBottom.value)
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
    programmatic = true
    following.value = true
    if (typeof el.scrollTo === 'function')
      el.scrollTo({ top: el.scrollHeight, behavior })
    else
      el.scrollTop = el.scrollHeight
    atBottom.value = measure()
    if (atBottom.value)
      programmatic = false
  }

  /** Called when content grew (stream delta, new message). */
  function followIfSticking(): void {
    if (following.value)
      scrollToBottom('auto')
  }

  return { atBottom, following, handleScroll, handleWheel, scrollToBottom, followIfSticking }
}
