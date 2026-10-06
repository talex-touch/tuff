import type { Ref } from 'vue'
import { onBeforeUnmount, watch } from 'vue'

/**
 * Escape closes the composer's popovers wherever focus is — the anchor listens at the document — so
 * whether focus goes back to the chip cannot be decided in the panel's own keydown: focus may have
 * left it. It goes back when it was in one of `areas` (the panel, the chip) or had already fallen to
 * the page: a focused control that went away or disabled itself, a press on a part that takes no
 * focus. Focus the user moved somewhere else stays there.
 *
 * Listens in the capture phase, ahead of the anchor, from the moment `open` turns true until it
 * turns false.
 */
export function useEscapeReturnsFocus(
  open: Ref<boolean>,
  areas: () => (Element | null | undefined)[],
  onEscape: () => void
): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    const active = document.activeElement
    if (!active || active === document.body || areas().some((area) => area?.contains(active))) {
      onEscape()
    }
  }

  watch(open, (isOpen) => {
    if (isOpen) document.addEventListener('keydown', onKeydown, true)
    else document.removeEventListener('keydown', onKeydown, true)
  })

  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
}
