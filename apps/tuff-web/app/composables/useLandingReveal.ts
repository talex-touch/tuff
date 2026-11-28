import type { Ref } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'
import { onBeforeUnmount, onMounted, ref } from 'vue'

export interface UseLandingRevealOptions {
  /** IntersectionObserver rootMargin (default `'80px 0px'`). */
  rootMargin?: string
  /** IntersectionObserver threshold (default `0.02`). */
  threshold?: number
  /** Top boundary multiplier relative to viewport height (default `0.94`). */
  viewportRatio?: number
}

function parseVerticalMarginPx(rootMargin: string): number {
  const firstToken = rootMargin.trim().split(/\s+/)[0] ?? '0'
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(firstToken)
  return match ? Number(match[1]) : 0
}

/**
 * Reveals a landing section or element once it reaches the viewport, combining
 * reduced-motion support, an initial geometry check, `IntersectionObserver`, and
 * capture-phase scroll fallback so elements never stay stranded at `opacity: 0`.
 */
export function useLandingReveal(
  targetRef: Ref<HTMLElement | null>,
  options: UseLandingRevealOptions = {},
) {
  const revealed = ref(false)
  let observer: IntersectionObserver | null = null
  let scrollFrame = 0
  let listenersBound = false

  const rootMargin = options.rootMargin ?? '80px 0px'
  const threshold = options.threshold ?? 0.02
  const viewportRatio = options.viewportRatio ?? 0.94
  const verticalMarginPx = parseVerticalMarginPx(rootMargin)

  function teardown() {
    observer?.disconnect()
    observer = null
    if (scrollFrame && hasWindow()) {
      cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
    }
    if (listenersBound && hasWindow()) {
      window.removeEventListener('scroll', scheduleVisibilityCheck, true)
      window.removeEventListener('resize', scheduleVisibilityCheck)
      listenersBound = false
    }
  }

  function reveal() {
    if (revealed.value)
      return
    revealed.value = true
    teardown()
  }

  function checkVisibility() {
    if (revealed.value || !hasWindow())
      return
    const el = targetRef.value
    if (!el)
      return

    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 && rect.height <= 0)
      return

    const viewHeight = window.innerHeight || document.documentElement.clientHeight
    const triggerBottom = viewHeight * viewportRatio + verticalMarginPx
    if (rect.top <= triggerBottom && rect.bottom >= -verticalMarginPx)
      reveal()
  }

  function scheduleVisibilityCheck() {
    if (revealed.value || scrollFrame || !hasWindow())
      return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      checkVisibility()
    })
  }

  onMounted(() => {
    if (!hasWindow())
      return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal()
      return
    }

    const el = targetRef.value
    if (!el || typeof IntersectionObserver === 'undefined') {
      reveal()
      return
    }

    checkVisibility()
    if (revealed.value)
      return

    observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
        reveal()
    }, { rootMargin, threshold })
    observer.observe(el)

    window.addEventListener('scroll', scheduleVisibilityCheck, { passive: true, capture: true })
    window.addEventListener('resize', scheduleVisibilityCheck, { passive: true })
    listenersBound = true
  })

  onBeforeUnmount(() => {
    teardown()
  })

  return {
    revealed,
    reveal,
  }
}
