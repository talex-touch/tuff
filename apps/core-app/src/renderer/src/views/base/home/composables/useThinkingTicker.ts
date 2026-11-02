import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { rollNextThinkingVerb, rollThinkingVerb } from '~/modules/conversation/thinking-words'

export interface UseThinkingTickerOptions {
  /** Whether the turn is currently waiting or running an untitled thought. */
  active: Ref<boolean>
  /** Language tag for the thinking verb list (defaults to 'en' for global indicator words). */
  locale?: Ref<string>
  /** How often the verb morphs into a new one while active (defaults to 2400ms). */
  intervalMs?: number
}

export interface UseThinkingTickerReturn {
  activeVerb: Ref<string>
  activeLabel: Ref<string>
  stop: () => void
  start: () => void
}

/**
 * Ticker for the thinking verb shown in the transcript orb and run dock status.
 * Rolls a fresh verb when active begins and morphs through distinct verbs
 * until the turn produces its first token or concrete step.
 */
export function useThinkingTicker(options: UseThinkingTickerOptions): UseThinkingTickerReturn {
  const intervalMs = options.intervalMs ?? 2400
  const activeVerb = ref<string>('Thinking')
  let timer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(): void {
    stop()
    const loc = options.locale?.value ?? 'en'
    activeVerb.value = rollThinkingVerb(loc)
    timer = setInterval(() => {
      activeVerb.value = rollNextThinkingVerb(activeVerb.value, loc)
    }, intervalMs)
  }

  watch(
    options.active,
    (isActive) => {
      if (isActive) start()
      else stop()
    },
    { immediate: true, flush: 'sync' }
  )

  if (getCurrentInstance()) {
    onBeforeUnmount(stop)
  }

  const activeLabel = computed(() => `${activeVerb.value}…`)

  return {
    activeVerb,
    activeLabel,
    stop,
    start
  }
}
