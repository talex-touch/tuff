import { onMounted, onUnmounted, type Ref } from 'vue'

export interface DialogFocusOptions {
  target: Ref<HTMLElement | null>
  focus?: () => void
  scrollLock?: boolean
}

/**
 * Captures focus while a dialog is open and optionally prevents document scrolling.
 */
export function useDialogFocus({ target, focus, scrollLock = false }: DialogFocusOptions): void {
  let previouslyFocusedElement: HTMLElement | null = null

  const preventScroll = (): void => {
    window.scrollTo({ top: 0 })
  }

  onMounted(() => {
    previouslyFocusedElement = document.activeElement as HTMLElement
    if (focus) focus()
    else target.value?.focus()

    if (scrollLock) window.addEventListener('scroll', preventScroll)
  })

  onUnmounted(() => {
    if (scrollLock) window.removeEventListener('scroll', preventScroll)
    previouslyFocusedElement?.focus()
  })
}
