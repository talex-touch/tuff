import type { Ref } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from '~/composables/useSendChoreography'

export const HOME_COMPOSER_MAX_INPUT_HEIGHT = 200

export interface UseHomeComposerLayoutOptions {
  input: Ref<HTMLTextAreaElement | null>
  composer?: Ref<HTMLElement | null>
  composerGroup: Ref<HTMLElement | null>
}

/**
 * Owns the composer field's auto-grow/collapse height motion, send-lift bubble width measurement,
 * and ResizeObserver-driven clearance height for the conversation stream.
 */
export function useHomeComposerLayout(options: UseHomeComposerLayoutOptions) {
  const composerHeight = ref(0)

  function autoGrow(): void {
    const input = options.input.value
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, HOME_COMPOSER_MAX_INPUT_HEIGHT)}px`
  }

  function collapseDraft(animate: boolean): void {
    const input = options.input.value
    if (!input) return
    const from = input.offsetHeight
    autoGrow()
    const to = Number.parseFloat(input.style.height) || from
    if (animate && Math.abs(from - to) >= 1 && !prefersReducedMotion()) {
      input.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0, 0, 1)'
      })
    }
  }

  function bubbleMaxWidth(): number {
    const lane =
      options.composer?.value ??
      options.composerGroup.value?.querySelector<HTMLElement>('.TuffAIComposer')
    return (lane?.getBoundingClientRect().width ?? 0) * 0.78
  }

  let composerObserver: ResizeObserver | null = null

  onMounted(() => {
    const element = options.composerGroup.value
    if (!element || typeof ResizeObserver === 'undefined') return
    composerObserver = new ResizeObserver(([entry]) => {
      if (entry)
        composerHeight.value = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
    })
    composerObserver.observe(element)
  })

  onBeforeUnmount(() => {
    composerObserver?.disconnect()
    composerObserver = null
  })

  const composerClearance = computed(() =>
    composerHeight.value > 0 ? `${Math.round(composerHeight.value)}px` : undefined
  )

  return {
    composerHeight,
    composerClearance,
    autoGrow,
    collapseDraft,
    bubbleMaxWidth
  }
}
