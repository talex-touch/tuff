import type { MaybeRefOrGetter, Ref } from 'vue'
import { onScopeDispose, ref, toValue, watch } from 'vue'

export interface UseDeferredLoadingOptions {
  /**
   * Hold the skeleton back for this long. Data that arrives sooner never shows
   * one at all, which is what stops a fast response from flashing.
   */
  delay?: number
  /**
   * Once the skeleton is up, keep it up for at least this long, so it does not
   * vanish half-drawn the instant the data lands.
   */
  minDuration?: number
}

/**
 * Turns a raw loading flag into one a skeleton can be bound to without flicker.
 *
 * A skeleton that appears and disappears within a few frames is more distracting
 * than no skeleton at all, so the two ends are damped: nothing shows before
 * `delay`, and nothing hides before `minDuration` has passed.
 */
export function useDeferredLoading(
  source: MaybeRefOrGetter<boolean>,
  options: UseDeferredLoadingOptions = {},
): Ref<boolean> {
  const { delay = 150, minDuration = 400 } = options

  const visible = ref(false)
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let shownAt = 0

  function clearTimers(): void {
    if (showTimer !== undefined) {
      clearTimeout(showTimer)
      showTimer = undefined
    }
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer)
      hideTimer = undefined
    }
  }

  watch(
    () => toValue(source),
    (loading) => {
      clearTimers()

      if (loading) {
        // Already on screen from an earlier cycle: leave it alone rather than
        // restarting the delay, which would blink it off and on.
        if (visible.value)
          return

        showTimer = setTimeout(() => {
          showTimer = undefined
          shownAt = Date.now()
          visible.value = true
        }, delay)
        return
      }

      if (!visible.value)
        return

      const remaining = minDuration - (Date.now() - shownAt)
      if (remaining <= 0) {
        visible.value = false
        return
      }

      hideTimer = setTimeout(() => {
        hideTimer = undefined
        visible.value = false
      }, remaining)
    },
    { immediate: true },
  )

  onScopeDispose(clearTimers)

  return visible
}
