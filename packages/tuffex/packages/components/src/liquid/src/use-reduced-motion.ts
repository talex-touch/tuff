import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Reactive `prefers-reduced-motion: reduce`. Starts false and resolves on
 *  mount, matching the upstream React hook (SSR-safe). */
export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(false)

  onMounted(() => {
    if (!window.matchMedia)
      return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.value = mq.matches
    const onChange = (e: MediaQueryListEvent): void => {
      reduced.value = e.matches
    }
    mq.addEventListener('change', onChange)
    onBeforeUnmount(() => mq.removeEventListener('change', onChange))
  })

  return reduced
}
