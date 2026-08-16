// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { ComputedRef } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface UseElapsedOptions {
  /** Wall-clock origin in epoch ms. Omit (or return undefined) to count from mount. */
  startedAt?: () => number | undefined
  /** Stops the interval when false — a hidden readout should not schedule work. @default true */
  active?: () => boolean
  /** @default 100 */
  intervalMs?: number
}

/**
 * `12.3s` below a minute, `2m 3.0s` above it.
 *
 * Milliseconds are floored to deciseconds before the branch, so the tenth
 * that reads `60.0s` under a naive `toFixed(1)` cannot occur.
 */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 100) / 10
  if (total < 60)
    return `${total.toFixed(1)}s`
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
}

/**
 * Elapsed milliseconds since an origin, refreshed on an interval.
 *
 * The reading is always `Date.now() - origin` rather than a self-incrementing
 * counter: a background tab throttles timers, and a counter that adds a fixed
 * step per fire drifts behind wall clock for as long as the tab stays hidden.
 */
export function useElapsed(options: UseElapsedOptions = {}): ComputedRef<number> {
  const { startedAt, active, intervalMs = 100 } = options

  const origin = ref(startedAt?.() ?? Date.now())
  const elapsedMs = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  function tick(): void {
    elapsedMs.value = Math.max(0, Date.now() - origin.value)
  }

  function stop(): void {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function start(): void {
    stop()
    tick()
    timer = setInterval(tick, intervalMs)
  }

  if (startedAt) {
    watch(startedAt, (next) => {
      origin.value = next ?? Date.now()
      tick()
    })
  }

  if (active) {
    watch(active, (running) => {
      if (running)
        start()
      else
        stop()
    })
  }

  onMounted(() => {
    if (active?.() === false)
      return
    start()
  })

  onBeforeUnmount(stop)

  return computed(() => elapsedMs.value)
}
