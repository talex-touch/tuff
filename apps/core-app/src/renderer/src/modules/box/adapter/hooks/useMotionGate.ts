import type { ComputedRef } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed } from 'vue'
import { useGlobalBatteryOptimizer } from '~/modules/hooks/useBatteryOptimizer'

export interface MotionGate {
  /** The global low-battery motion switch, for the few CoreBox rules that read it directly. */
  lowBatteryMode: ComputedRef<boolean>
  /**
   * Whether script-driven motion may start: false under `prefers-reduced-motion: reduce` or in
   * low-battery mode. Reactive, so a computed or watcher that calls it re-runs when either flips.
   */
  shouldAnimate: () => boolean
}

/**
 * The one motion gate for CoreBox.
 *
 * Stylesheets already stop their own motion: `@media (prefers-reduced-motion: reduce)` in
 * `styles/accessibility.scss`, and `html[data-low-battery-motion]` in `styles/index.scss`. Neither
 * reaches `element.animate()` or anything a script drives, so that motion asks `shouldAnimate()`
 * before it starts.
 *
 * This also owns the low-battery attribute for the window it runs in. The main window gets it from
 * its runtime services, which lightweight windows such as CoreBox never mount; without this call,
 * CoreBox CSS would keep animating on low battery.
 */
export function useMotionGate(): MotionGate {
  const { lowBatteryMode } = useGlobalBatteryOptimizer()
  const reducedMotion = usePreferredReducedMotion()
  const motionAllowed = computed(() => reducedMotion.value !== 'reduce' && !lowBatteryMode.value)

  return {
    lowBatteryMode,
    shouldAnimate: () => motionAllowed.value
  }
}
