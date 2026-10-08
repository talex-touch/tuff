import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, toValue, watch } from 'vue'
import { useReducedMotion } from './use-reduced-motion'

export interface MotionActivity {
  /** Mounted, intersecting and in a visible document, even with reduced motion. */
  present: ComputedRef<boolean>
  /** Motion may run only while mounted, visible, enabled and not reduced. */
  active: ComputedRef<boolean>
  reduced: Ref<boolean>
  /** Intersection visibility, independent of the document's visibility. */
  visible: Ref<boolean>
}

/** One suspension boundary for the Motion family; no browser access during SSR. */
export function useMotionActivity(
  target: Ref<HTMLElement | null | undefined>,
  enabled: MaybeRefOrGetter<boolean> = true,
): MotionActivity {
  const reduced = useReducedMotion()
  const visible = ref(false)
  const mounted = ref(false)
  const documentVisible = ref(false)
  let observer: IntersectionObserver | undefined
  let stopTargetWatch: (() => void) | undefined

  const present = computed(() => mounted.value && documentVisible.value && visible.value)
  const active = computed(() => present.value && toValue(enabled) && !reduced.value)

  function syncDocumentVisibility(): void {
    documentVisible.value = document.visibilityState === 'visible'
  }

  function observe(element: HTMLElement | null | undefined): void {
    observer?.disconnect()
    observer = undefined
    visible.value = false
    if (!element || !mounted.value)
      return
    if (typeof IntersectionObserver === 'undefined') {
      visible.value = true
      return
    }
    const current = new IntersectionObserver((entries) => {
      // An old queued callback must not reactivate a replaced or deactivated host.
      if (observer !== current || !mounted.value || target.value !== element)
        return
      for (const entry of entries) {
        if (entry.target === element)
          visible.value = entry.isIntersecting && entry.intersectionRatio > 0
      }
    })
    observer = current
    current.observe(element)
  }

  function start(): void {
    if (mounted.value)
      return
    mounted.value = true
    syncDocumentVisibility()
    document.addEventListener('visibilitychange', syncDocumentVisibility)
    stopTargetWatch = watch(target, observe, { immediate: true, flush: 'post' })
  }

  function stop(): void {
    mounted.value = false
    visible.value = false
    documentVisible.value = false
    observer?.disconnect()
    observer = undefined
    stopTargetWatch?.()
    stopTargetWatch = undefined
    document.removeEventListener('visibilitychange', syncDocumentVisibility)
  }

  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onBeforeUnmount(stop)
  return { present, active, reduced, visible }
}
