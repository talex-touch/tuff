import type { Ref } from 'vue'
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

/** Reactive reduced-motion preference; listeners follow mount/KeepAlive activity. */
export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(false)
  let query: MediaQueryList | undefined

  function sync(): void {
    reduced.value = query?.matches ?? false
  }

  function start(): void {
    if (query || !window.matchMedia)
      return
    query = window.matchMedia('(prefers-reduced-motion: reduce)')
    sync()
    query.addEventListener('change', sync)
  }

  function stop(): void {
    query?.removeEventListener('change', sync)
    query = undefined
  }

  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onBeforeUnmount(stop)
  return reduced
}
