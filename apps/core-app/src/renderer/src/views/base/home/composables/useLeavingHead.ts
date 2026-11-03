import type { Ref } from 'vue'
import { prefersReducedMotion } from '~/composables/useSendChoreography'

/** The greeting as it stood before the stage flips to a conversation. */
export interface LeavingHead {
  el: HTMLElement
  rect: DOMRect
}

/**
 * The greeting leaves when the stage flips from blank to a conversation — on a first send and on
 * opening a stored thread. It must neither ride the new layout (it would teleport to the column
 * top) nor keep occupying it (it would shove the stream down, then snap it up when the fade ends),
 * so it is measured before the flip and pinned where it stood, out of flow, afterwards.
 */
export function useLeavingHead(headRef: Ref<HTMLElement | null>) {
  /** Read before the reactive flip: once the thread is non-empty, the ref no longer points at it. */
  function measureLeavingHead(): LeavingHead | null {
    const el = headRef.value
    return el ? { el, rect: el.getBoundingClientRect() } : null
  }

  function pinLeavingHead(head: LeavingHead | null): void {
    if (!head?.el.isConnected || prefersReducedMotion()) return
    const host = head.el.parentElement?.getBoundingClientRect()
    if (!host) return
    head.el.style.position = 'absolute'
    head.el.style.top = `${Math.round(head.rect.top - host.top)}px`
    head.el.style.left = `${Math.round(head.rect.left - host.left)}px`
    // Only the measured offsets are inline; the layer rides the shared scale.
    head.el.classList.add('is-leaving')
  }

  return { measureLeavingHead, pinLeavingHead }
}
