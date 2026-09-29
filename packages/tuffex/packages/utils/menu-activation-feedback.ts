import type { Ref } from 'vue'
import { onBeforeUnmount, ref } from 'vue'

export const MENU_ACTIVATION_FEEDBACK_PHASE_MS = 90

export type MenuActivationFeedbackPhase = 'idle' | 'clear' | 'confirm'

export interface MenuActivationFeedbackOptions {
  enabled: () => boolean
  shouldClose: () => boolean
  onSelect: () => void
  onClose: () => void
}

export interface MenuActivationFeedbackControl {
  activate: () => void
  phase: Ref<MenuActivationFeedbackPhase>
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useMenuActivationFeedback(options: MenuActivationFeedbackOptions): MenuActivationFeedbackControl {
  const phase = ref<MenuActivationFeedbackPhase>('idle')
  let timer: number | null = null

  function clearTimer(): void {
    if (timer === null)
      return
    window.clearTimeout(timer)
    timer = null
  }

  function reset(): void {
    clearTimer()
    phase.value = 'idle'
  }

  function finish(): void {
    timer = null
    phase.value = 'idle'
    options.onSelect()
    options.onClose()
  }

  function activate(): void {
    if (phase.value !== 'idle')
      return

    const shouldClose = options.shouldClose()
    if (!shouldClose || !options.enabled() || prefersReducedMotion()) {
      options.onSelect()
      if (shouldClose)
        options.onClose()
      return
    }

    phase.value = 'clear'
    timer = window.setTimeout(() => {
      timer = null
      phase.value = 'confirm'
      timer = window.setTimeout(finish, MENU_ACTIVATION_FEEDBACK_PHASE_MS)
    }, MENU_ACTIVATION_FEEDBACK_PHASE_MS)
  }

  onBeforeUnmount(reset)

  return {
    activate,
    phase,
  }
}
