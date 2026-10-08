// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { MotionHapticResult, MotionHapticType, MotionPointer, StaggerOptions } from './types'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, readonly, ref, shallowRef, toValue, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { isVibrateSupported, useAutoVibrate } from '../../../../utils/vibrate'
export { useReducedMotion } from '../../../../utils/use-reduced-motion'

/** Own browser resources only while the scope, document and caller are active. */
export function useMotionResources(enabled: MaybeRefOrGetter<boolean>, setup: () => (() => void), dependencies?: MaybeRefOrGetter<unknown>) {
  const mounted = ref(false)
  const pageVisible = ref(false)
  let cleanup: (() => void) | undefined
  function sync() { pageVisible.value = document.visibilityState === 'visible' }
  function start() {
    if (mounted.value) return
    mounted.value = true
    sync()
    document.addEventListener('visibilitychange', sync)
  }
  function stop() {
    mounted.value = false
    cleanup?.()
    cleanup = undefined
    document.removeEventListener('visibilitychange', sync)
  }
  watch(() => [mounted.value && pageVisible.value, toValue(enabled), toValue(dependencies)] as const, ([live, enabledValue]) => {
    cleanup?.()
    cleanup = live && enabledValue ? setup() : undefined
  }, { flush: 'sync' })
  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onBeforeUnmount(stop)
}

export function useMousePosition(
  target?: Ref<HTMLElement | null | undefined>,
  enabled: MaybeRefOrGetter<boolean> = true,
  global: MaybeRefOrGetter<boolean> = false,
) {
  const position = shallowRef<MotionPointer>({ x: 0, y: 0, elementX: 0, elementY: 0, width: 0, height: 0, inside: false })
  function move(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    const rect = target?.value?.getBoundingClientRect()
    position.value = {
      x: event.clientX, y: event.clientY,
      elementX: rect ? event.clientX - rect.left : event.clientX,
      elementY: rect ? event.clientY - rect.top : event.clientY,
      width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight,
      inside: true,
    }
  }
  function leave() { position.value = { ...position.value, inside: false } }
  useMotionResources(() => toValue(enabled) && (!target || !!target.value), () => {
    const eventTarget = !target || toValue(global) ? window : target.value!
    eventTarget.addEventListener('pointermove', move as EventListener, { passive: true })
    eventTarget.addEventListener('pointerleave', leave)
    if (eventTarget === window) document.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      eventTarget.removeEventListener('pointermove', move as EventListener)
      eventTarget.removeEventListener('pointerleave', leave)
      if (eventTarget === window) document.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
      leave()
    }
  }, () => [target?.value, toValue(global)])
  return readonly(position)
}

export function useScrollProgress(
  container: MaybeRefOrGetter<HTMLElement | null | undefined> = undefined,
  enabled: MaybeRefOrGetter<boolean> = true,
  target?: MaybeRefOrGetter<HTMLElement | null | undefined>,
) {
  const progress = ref(0)
  useMotionResources(enabled, () => {
    const element = toValue(container)
    const targetElement = toValue(target)
    const scroller = element ?? window
    function update() {
      const top = element ? element.scrollTop : window.scrollY
      const height = element ? element.clientHeight : window.innerHeight
      let start = 0
      let distance = (element ? element.scrollHeight : document.documentElement.scrollHeight) - height
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect()
        start = top + rect.top - (element?.getBoundingClientRect().top ?? 0)
        distance = rect.height - height
      }
      progress.value = distance > 0 ? Math.min(1, Math.max(0, (top - start) / distance)) : 0
    }
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(targetElement ?? element ?? document.documentElement)
    if (element && targetElement) observer?.observe(element)
    update()
    return () => {
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, () => [toValue(container), toValue(target)])
  return readonly(progress)
}

export function useStagger(count: MaybeRefOrGetter<number>, options: MaybeRefOrGetter<StaggerOptions> = {}) {
  return computed(() => {
    const length = Math.max(0, Math.floor(toValue(count)))
    const { baseDelay = 0, staggerDelay = 50, from = 'first' } = toValue(options)
    const origin = from === 'last' ? length - 1 : from === 'center' ? (length - 1) / 2 : typeof from === 'number' ? from : 0
    return Array.from({ length }, (_, index) => baseDelay + Math.abs(index - origin) * staggerDelay)
  })
}

export function useScreenSize(enabled: MaybeRefOrGetter<boolean> = true) {
  const size = shallowRef({ width: 0, height: 0 })
  useMotionResources(enabled, () => {
    function update() { size.value = { width: window.innerWidth, height: window.innerHeight } }
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  })
  return readonly(size)
}

export function useIsMobile(breakpoint: MaybeRefOrGetter<number> = 768) {
  const mobile = ref(false)
  useMotionResources(() => toValue(breakpoint) > 0, () => {
    const query = window.matchMedia(`(max-width: ${toValue(breakpoint)}px)`)
    function update() { mobile.value = query.matches }
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, () => toValue(breakpoint))
  return readonly(mobile)
}

export function useLoopFlag(
  target: Ref<HTMLElement | null | undefined>,
  enabled: MaybeRefOrGetter<boolean> = true,
  interval: MaybeRefOrGetter<number> = 2000,
) {
  const flag = ref(0)
  const activity = useMotionActivity(target, enabled)
  useMotionResources(() => activity.active.value && toValue(interval) > 0, () => {
    const timer = window.setInterval(() => { flag.value += 1 }, Math.max(16, toValue(interval)))
    return () => window.clearInterval(timer)
  }, () => toValue(interval))
  return readonly(flag)
}

export function useWebHaptics(enabled: MaybeRefOrGetter<boolean> = true) {
  const supported = ref(false)
  let owned = false
  useMotionResources(enabled, () => {
    supported.value = isVibrateSupported()
    return () => {
      if (owned) useAutoVibrate([0])
      owned = false
    }
  })
  const patterns: Record<MotionHapticType, number[]> = {
    light: [10], medium: [25], heavy: [50], success: [15, 60, 15], warning: [30, 60, 30], error: [60, 60, 60, 60, 60],
  }
  function trigger(type: MotionHapticType = 'light'): MotionHapticResult {
    supported.value = isVibrateSupported()
    const accepted = toValue(enabled) && supported.value && useAutoVibrate(patterns[type]) === true
    owned = owned || accepted
    return { supported: supported.value, accepted }
  }
  return { supported: readonly(supported), trigger }
}

export function useCanvasSetup(target: Ref<HTMLCanvasElement | null | undefined>, enabled: MaybeRefOrGetter<boolean> = true) {
  const rect = shallowRef({ width: 0, height: 0, dpr: 1 })
  const activity = useMotionActivity(target, enabled)
  useMotionResources(() => !!target.value && toValue(enabled) && (activity.active.value || activity.reduced.value && activity.visible.value), () => {
    const canvas = target.value!
    function resize(width: number, height: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      rect.value = { width, height, dpr }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    function update() { const bounds = canvas.getBoundingClientRect(); resize(bounds.width, bounds.height) }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(([entry]) => {
      if (entry) resize(entry.contentRect.width, entry.contentRect.height)
    })
    observer?.observe(canvas)
    window.addEventListener('resize', update, { passive: true })
    update()
    return () => { observer?.disconnect(); window.removeEventListener('resize', update) }
  })
  return { rect: readonly(rect), active: activity.active, visible: activity.visible, reduced: activity.reduced }
}
