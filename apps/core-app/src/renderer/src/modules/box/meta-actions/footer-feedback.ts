import { computed, shallowRef } from 'vue'

/**
 * The CoreBox footer's one-line execution feedback ("已复制", "已固定", …).
 *
 * CoreBox deliberately mounts no toast host (`AppEntrance.vue`), so an action's `toast.success`
 * never reached the screen and a copy or pin looked like it had done nothing. The footer is the
 * surface the user is already looking at: the action pipeline writes here, `CoreBoxFooter` reads,
 * and the message clears itself after `COREBOX_FOOTER_FEEDBACK_MS`. A newer message replaces an
 * older one and restarts the clock.
 */

export type CoreBoxFooterFeedbackTone = 'success' | 'error'

export interface CoreBoxFooterFeedback {
  /** Changes on every message, so repeating the same text still reads as a new event. */
  id: number
  tone: CoreBoxFooterFeedbackTone
  message: string
}

export const COREBOX_FOOTER_FEEDBACK_MS = 1200

const feedback = shallowRef<CoreBoxFooterFeedback | null>(null)
let clearTimer: ReturnType<typeof setTimeout> | null = null
let sequence = 0

export function showCoreBoxFooterFeedback(
  message: string,
  tone: CoreBoxFooterFeedbackTone = 'success'
): void {
  if (!message) return
  if (clearTimer) clearTimeout(clearTimer)
  sequence += 1
  feedback.value = { id: sequence, tone, message }
  clearTimer = setTimeout(() => {
    clearTimer = null
    feedback.value = null
  }, COREBOX_FOOTER_FEEDBACK_MS)
}

export function clearCoreBoxFooterFeedback(): void {
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = null
  feedback.value = null
}

export function useCoreBoxFooterFeedback() {
  return computed(() => feedback.value)
}
