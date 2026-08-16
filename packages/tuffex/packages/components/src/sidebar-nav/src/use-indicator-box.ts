// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { Ref } from 'vue'
import { onBeforeUnmount, readonly, ref, watch } from 'vue'

export interface IndicatorBox {
  top: number
  left: number
  width: number
  height: number
}

export interface UseIndicatorBoxOptions {
  /** Positioned ancestor the box is measured against. */
  container: Ref<HTMLElement | null | undefined>
  /**
   * Element the indicator should sit behind. A getter rather than a ref so the
   * caller can resolve it from a keyed map on every measurement.
   */
  target: () => HTMLElement | null | undefined
}

export interface UseIndicatorBoxReturn {
  /** `null` until the first successful measurement. */
  box: Readonly<Ref<IndicatorBox | null>>
  /**
   * `false` for the first measurement so the caller can suppress its
   * transition — otherwise the indicator slides in from the container's top
   * edge on mount. Mirrors `TxTabs`' `indicatorRevealed`.
   */
  revealed: Readonly<Ref<boolean>>
  measure: () => void
}

/**
 * Measures a target element relative to a container so a single floating
 * element can travel between siblings instead of every sibling painting its own
 * background.
 *
 * Both axes are reported. `TxSidebarNav` animates `top`/`height`; a horizontal
 * segmented control animates `left`/`width` from the same reading.
 *
 * Upstream measures only when the hovered/active key changes, which leaves the
 * indicator stranded after a container resize, a font swap or an item being
 * added. A `ResizeObserver` on both elements closes that.
 */
export function useIndicatorBox(options: UseIndicatorBoxOptions): UseIndicatorBoxReturn {
  const box = ref<IndicatorBox | null>(null)
  const revealed = ref(false)

  let observer: ResizeObserver | null = null
  let observedTarget: HTMLElement | null = null

  function measure() {
    const container = options.container.value
    const target = options.target()
    if (!container || !target) {
      box.value = null
      revealed.value = false
      return
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    box.value = {
      top: targetRect.top - containerRect.top,
      left: targetRect.left - containerRect.left,
      width: targetRect.width,
      height: targetRect.height,
    }
  }

  function observe() {
    if (typeof ResizeObserver === 'undefined')
      return
    const container = options.container.value
    const target = options.target()
    if (!observer)
      observer = new ResizeObserver(() => measure())

    if (observedTarget && observedTarget !== target)
      observer.unobserve(observedTarget)
    if (container)
      observer.observe(container)
    if (target) {
      observer.observe(target)
      observedTarget = target
    }
  }

  watch(
    [options.container, () => options.target()],
    () => {
      measure()
      observe()
      // Reveal only after a box exists, so the very first paint lands in place
      // rather than travelling there.
      if (box.value)
        revealed.value = true
    },
    // `post` runs after the DOM patch: `pre` would read the previous layout and
    // park the indicator one item behind.
    { flush: 'post', immediate: true },
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    observedTarget = null
  })

  return {
    box: readonly(box) as Readonly<Ref<IndicatorBox | null>>,
    revealed: readonly(revealed),
    measure,
  }
}
