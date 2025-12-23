import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export interface AutoResizeSize {
  width: number
  height: number
}

export interface AutoResizeEvent {
  prev: AutoResizeSize | null
  next: AutoResizeSize
  isManual: boolean
}

export type AutoResizeRounding = 'none' | 'round' | 'floor' | 'ceil'

export type AutoResizeApplyMode = 'sync' | 'transition'

export interface UseAutoResizeOptions {
  width?: boolean

  height?: boolean

  applyStyle?: boolean

  applyMode?: AutoResizeApplyMode

  durationMs?: number

  easing?: string

  clearStyleOnFinish?: boolean

  styleTarget?: 'outer' | 'inner'

  rounding?: AutoResizeRounding

  immediate?: boolean

  rafBatch?: boolean

  onResize?: (e: AutoResizeEvent) => void

  onBeforeApply?: (e: AutoResizeEvent) => void

  onAfterApply?: (e: AutoResizeEvent) => void
}

export interface UseAutoResizeReturn {
  refresh: () => Promise<void>

  start: () => void

  stop: () => void

  setEnabled: (enabled: boolean) => void

  size: Ref<AutoResizeSize | null>
}

export function useAutoResize(
  outerRef: Ref<HTMLElement | null>,
  innerRef: Ref<HTMLElement | null>,
  options: UseAutoResizeOptions = {},
): UseAutoResizeReturn {
  const opt: Required<UseAutoResizeOptions> = {
    width: options.width ?? true,
    height: options.height ?? false,
    applyStyle: options.applyStyle ?? true,
    applyMode: options.applyMode ?? 'sync',
    styleTarget: options.styleTarget ?? 'outer',
    rounding: options.rounding ?? 'ceil',
    immediate: options.immediate ?? true,
    rafBatch: options.rafBatch ?? true,
    durationMs: options.durationMs ?? 200,
    easing: options.easing ?? 'ease',
    clearStyleOnFinish: options.clearStyleOnFinish ?? true,
    onResize: options.onResize ?? (() => {}),
    onBeforeApply: options.onBeforeApply ?? (() => {}),
    onAfterApply: options.onAfterApply ?? (() => {}),
  }

  const size = ref<AutoResizeSize | null>(null)
  const enabled = ref(true)
  const ro = ref<ResizeObserver | null>(null)
  let rafId: number | null = null
  let pendingManual = false
  let activeApplyCleanup: (() => void) | null = null

  const round = (v: number) => {
    switch (opt.rounding) {
      case 'none':
        return v
      case 'round':
        return Math.round(v)
      case 'floor':
        return Math.floor(v)
      case 'ceil':
      default:
        return Math.ceil(v)
    }
  }

  const getTargets = () => {
    const outer = outerRef.value
    const inner = innerRef.value
    const styleEl = opt.styleTarget === 'outer' ? outer : inner
    return { outer, inner, styleEl }
  }

  const apply = (e: AutoResizeEvent, styleEl: HTMLElement) => {
    if (!opt.applyStyle)
      return

    activeApplyCleanup?.()
    activeApplyCleanup = null

    if (opt.applyMode === 'sync') {
      if (opt.width)
        styleEl.style.width = `${e.next.width}px`
      if (opt.height)
        styleEl.style.height = `${e.next.height}px`
      return
    }

    const prev = e.prev
    if (!prev)
      return

    const props: string[] = []
    if (opt.width && prev.width !== e.next.width)
      props.push('width')
    if (opt.height && prev.height !== e.next.height)
      props.push('height')

    if (props.length === 0)
      return

    const prevTransitionProperty = styleEl.style.transitionProperty
    const prevTransitionDuration = styleEl.style.transitionDuration
    const prevTransitionTimingFunction = styleEl.style.transitionTimingFunction
    const prevWidth = styleEl.style.width
    const prevHeight = styleEl.style.height

    styleEl.style.transitionProperty = props.join(',')
    styleEl.style.transitionDuration = '0ms'
    styleEl.style.transitionTimingFunction = opt.easing

    if (props.includes('width'))
      styleEl.style.width = `${prev.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${prev.height}px`

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    styleEl.offsetWidth

    styleEl.style.transitionDuration = `${opt.durationMs}ms`
    if (props.includes('width'))
      styleEl.style.width = `${e.next.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${e.next.height}px`

    let finished = false
    const remaining = new Set(props)
    let timeoutId: number | null = null

    const done = () => {
      if (finished)
        return
      finished = true

      styleEl.style.transitionProperty = prevTransitionProperty
      styleEl.style.transitionDuration = prevTransitionDuration
      styleEl.style.transitionTimingFunction = prevTransitionTimingFunction

      if (opt.clearStyleOnFinish) {
        if (props.includes('width'))
          styleEl.style.width = ''
        if (props.includes('height'))
          styleEl.style.height = ''
      }
      else {
        if (props.includes('width'))
          styleEl.style.width = prevWidth
        if (props.includes('height'))
          styleEl.style.height = prevHeight
      }
    }

    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== styleEl)
        return
      if (!props.includes(ev.propertyName))
        return

      remaining.delete(ev.propertyName)
      if (remaining.size > 0)
        return

      styleEl.removeEventListener('transitionend', onEnd)
      done()
    }

    styleEl.addEventListener('transitionend', onEnd)

    if (typeof setTimeout !== 'undefined') {
      timeoutId = setTimeout(() => {
        styleEl.removeEventListener('transitionend', onEnd)
        done()
      }, opt.durationMs + 34) as unknown as number
    }

    activeApplyCleanup = () => {
      styleEl.removeEventListener('transitionend', onEnd)
      if (timeoutId != null)
        clearTimeout(timeoutId)
      done()
    }
  }

  const measureAndSync = async (isManual: boolean) => {
    await nextTick()
    const { inner, styleEl } = getTargets()
    if (!inner || !styleEl)
      return
    if (!enabled.value)
      return

    const rect = inner.getBoundingClientRect()
    const next: AutoResizeSize = {
      width: round(rect.width),
      height: round(rect.height),
    }

    const prev = size.value
    const event: AutoResizeEvent = { prev, next, isManual }

    size.value = next

    opt.onResize(event)
    opt.onBeforeApply(event)
    apply(event, styleEl)
    opt.onAfterApply(event)
  }

  const schedule = (isManual: boolean) => {
    if (!opt.rafBatch) {
      void measureAndSync(isManual)
      return
    }
    if (rafId != null)
      return
    if (typeof requestAnimationFrame === 'undefined') {
      void measureAndSync(isManual)
      return
    }
    rafId = requestAnimationFrame(() => {
      rafId = null
      const manual = pendingManual
      pendingManual = false
      void measureAndSync(manual)
    })
  }

  const start = () => {
    if (ro.value)
      return
    const { inner } = getTargets()
    if (!inner)
      return
    if (typeof ResizeObserver === 'undefined')
      return
    ro.value = new ResizeObserver(() => schedule(false))
    ro.value.observe(inner)
  }

  const stop = () => {
    ro.value?.disconnect()
    ro.value = null
    if (rafId != null)
      cancelAnimationFrame(rafId)
    rafId = null
    pendingManual = false
    activeApplyCleanup?.()
    activeApplyCleanup = null
  }

  const setEnabled = (v: boolean) => {
    enabled.value = v
    if (!v)
      stop()
    else start()
  }

  const refresh = async () => {
    pendingManual = true
    schedule(true)
    if (typeof requestAnimationFrame === 'undefined')
      return
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }

  onMounted(async () => {
    if (!enabled.value)
      return
    start()
    if (opt.immediate)
      await measureAndSync(false)
  })

  onBeforeUnmount(() => stop())

  return { refresh, start, stop, setEnabled, size }
}
