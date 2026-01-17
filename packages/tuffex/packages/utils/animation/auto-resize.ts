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

export type AutoResizeApplyMode = 'sync' | 'transition' | 'waapi' | 'auto'

export interface UseAutoResizeOptions {
  width?: boolean

  height?: boolean

  applyStyle?: boolean

  applyMode?: AutoResizeApplyMode

  durationMs?: number

  easing?: string

  clearStyleOnFinish?: boolean

  styleTarget?: 'outer' | 'inner'

  observeTarget?: 'inner' | 'outer' | 'both'

  rounding?: AutoResizeRounding

  immediate?: boolean

  rafBatch?: boolean

  onResize?: (e: AutoResizeEvent) => void

  onBeforeApply?: (e: AutoResizeEvent) => void

  onAfterApply?: (e: AutoResizeEvent) => void
}

export interface UseAutoResizeReturn {
  refresh: () => Promise<void>

  measure: (isManual?: boolean) => Promise<AutoResizeSize | null>

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
    observeTarget: options.observeTarget ?? 'inner',
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
  let rafPromise: Promise<void> | null = null
  let rafPromiseResolve: (() => void) | null = null
  let microtaskPromise: Promise<void> | null = null
  let microtaskPromiseResolve: (() => void) | null = null
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

  const canWaapi = (el: HTMLElement) => {
    return typeof (el as any).animate === 'function'
  }

  const apply = (e: AutoResizeEvent, styleEl: HTMLElement) => {
    if (!opt.applyStyle)
      return

    // Pause ResizeObserver during style application to prevent feedback loops
    ro.value?.disconnect()

    activeApplyCleanup?.()
    activeApplyCleanup = null

    if (opt.applyMode === 'sync') {
      if (opt.width)
        styleEl.style.width = `${e.next.width}px`
      if (opt.height)
        styleEl.style.height = `${e.next.height}px`
      // Resume ResizeObserver immediately for sync mode
      if (enabled.value)
        start()
      return
    }

    const resolvedApplyMode: AutoResizeApplyMode = opt.applyMode === 'auto'
      ? (canWaapi(styleEl) ? 'waapi' : 'transition')
      : opt.applyMode

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

    const prevWidth = styleEl.style.width
    const prevHeight = styleEl.style.height

    if (resolvedApplyMode === 'waapi') {
      if (!canWaapi(styleEl))
        return

      if (props.includes('width'))
        styleEl.style.width = `${prev.width}px`
      if (props.includes('height'))
        styleEl.style.height = `${prev.height}px`

      const frames: Keyframe[] = [
        {
          ...(props.includes('width') ? { width: `${prev.width}px` } : {}),
          ...(props.includes('height') ? { height: `${prev.height}px` } : {}),
        },
        {
          ...(props.includes('width') ? { width: `${e.next.width}px` } : {}),
          ...(props.includes('height') ? { height: `${e.next.height}px` } : {}),
        },
      ]

      const anim = (styleEl as any).animate(frames, {
        duration: opt.durationMs,
        easing: opt.easing,
        fill: 'forwards',
      }) as Animation

      let finished = false
      const done = () => {
        if (finished)
          return
        finished = true

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

      const onFinish = () => {
        done()
        // Resume ResizeObserver after animation finishes
        if (enabled.value)
          start()
      }
      const onCancel = () => {
        done()
        // Resume ResizeObserver after animation cancels
        if (enabled.value)
          start()
      }

      anim.addEventListener('finish', onFinish, { once: true })
      anim.addEventListener('cancel', onCancel, { once: true })

      activeApplyCleanup = () => {
        anim.removeEventListener('finish', onFinish)
        anim.removeEventListener('cancel', onCancel)
        anim.cancel()
        done()
        // Resume ResizeObserver after animation cleanup
        if (enabled.value)
          start()
      }

      return
    }

    const prevTransitionProperty = styleEl.style.transitionProperty
    const prevTransitionDuration = styleEl.style.transitionDuration
    const prevTransitionTimingFunction = styleEl.style.transitionTimingFunction

    styleEl.style.transitionProperty = props.join(',')
    styleEl.style.transitionDuration = '0ms'
    styleEl.style.transitionTimingFunction = opt.easing

    if (props.includes('width'))
      styleEl.style.width = `${prev.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${prev.height}px`

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
      // Resume ResizeObserver after transition ends
      if (enabled.value)
        start()
    }

    styleEl.addEventListener('transitionend', onEnd)

    if (typeof setTimeout !== 'undefined') {
      timeoutId = setTimeout(() => {
        styleEl.removeEventListener('transitionend', onEnd)
        done()
        // Resume ResizeObserver after timeout
        if (enabled.value)
          start()
      }, opt.durationMs + 34) as unknown as number
    }

    activeApplyCleanup = () => {
      styleEl.removeEventListener('transitionend', onEnd)
      if (timeoutId != null)
        clearTimeout(timeoutId)
      done()
      // Resume ResizeObserver after transition cleanup
      if (enabled.value)
        start()
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

    let extraW = 0
    let extraH = 0
    if (styleEl !== inner) {
      const cs = getComputedStyle(styleEl)
      if (cs.boxSizing === 'border-box') {
        const px = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)
        const py = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom)
        const bx = Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.borderRightWidth)
        const by = Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth)
        extraW = (Number.isFinite(px) ? px : 0) + (Number.isFinite(bx) ? bx : 0)
        extraH = (Number.isFinite(py) ? py : 0) + (Number.isFinite(by) ? by : 0)
      }
    }

    const next: AutoResizeSize = {
      width: round(rect.width + extraW),
      height: round(rect.height + extraH),
    }

    const prev = size.value
    const event: AutoResizeEvent = { prev, next, isManual }

    size.value = next

    opt.onResize(event)
    opt.onBeforeApply(event)
    apply(event, styleEl)
    opt.onAfterApply(event)
  }

  const measure = async (isManual = false): Promise<AutoResizeSize | null> => {
    await nextTick()
    const { inner, styleEl } = getTargets()
    if (!inner || !styleEl)
      return null
    if (!enabled.value)
      return null

    const rect = inner.getBoundingClientRect()

    let extraW = 0
    let extraH = 0
    if (styleEl !== inner) {
      const cs = getComputedStyle(styleEl)
      if (cs.boxSizing === 'border-box') {
        const px = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)
        const py = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom)
        const bx = Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.borderRightWidth)
        const by = Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth)
        extraW = (Number.isFinite(px) ? px : 0) + (Number.isFinite(bx) ? bx : 0)
        extraH = (Number.isFinite(py) ? py : 0) + (Number.isFinite(by) ? by : 0)
      }
    }

    const next: AutoResizeSize = {
      width: round(rect.width + extraW),
      height: round(rect.height + extraH),
    }

    const prev = size.value
    const event: AutoResizeEvent = { prev, next, isManual }
    size.value = next
    opt.onResize(event)
    return next
  }

  const schedule = (isManual: boolean) => {
    const cancelRaf = () => {
      if (rafId != null)
        cancelAnimationFrame(rafId)
      rafId = null
      rafPromiseResolve?.()
      rafPromiseResolve = null
      rafPromise = null
    }

    if (isManual)
      pendingManual = true

    if (!enabled.value)
      return Promise.resolve()

    if (!opt.rafBatch)
      return measureAndSync(pendingManual)

    if (!isManual) {
      if (rafId != null)
        cancelRaf()

      if (microtaskPromise != null)
        return microtaskPromise

      microtaskPromise = new Promise<void>((resolve) => {
        microtaskPromiseResolve = resolve
      })

      const queue = typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (cb: () => void) => Promise.resolve().then(cb)

      queue(() => {
        const manual = pendingManual
        pendingManual = false
        void measureAndSync(manual)
          .finally(() => {
            microtaskPromiseResolve?.()
            microtaskPromiseResolve = null
            microtaskPromise = null
          })
      })

      return microtaskPromise
    }

    if (typeof requestAnimationFrame === 'undefined')
      return measureAndSync(pendingManual)

    if (rafId != null)
      return rafPromise ?? Promise.resolve()

    rafPromise = new Promise<void>((resolve) => {
      rafPromiseResolve = resolve
    })

    rafId = requestAnimationFrame(() => {
      rafId = null
      const manual = pendingManual
      pendingManual = false
      void measureAndSync(manual)
        .finally(() => {
          rafPromiseResolve?.()
          rafPromiseResolve = null
          rafPromise = null
        })
    })

    return rafPromise
  }

  const start = () => {
    if (ro.value)
      return
    const { outer, inner } = getTargets()
    const targets: HTMLElement[] = []
    if (opt.observeTarget === 'inner') {
      if (inner)
        targets.push(inner)
    }
    else if (opt.observeTarget === 'outer') {
      if (outer)
        targets.push(outer)
    }
    else {
      if (inner)
        targets.push(inner)
      if (outer && outer !== inner)
        targets.push(outer)
    }

    if (targets.length === 0)
      return
    if (typeof ResizeObserver === 'undefined')
      return
    ro.value = new ResizeObserver(() => schedule(false))
    for (const t of targets)
      ro.value.observe(t)
  }

  const stop = () => {
    ro.value?.disconnect()
    ro.value = null
    if (rafId != null)
      cancelAnimationFrame(rafId)
    rafId = null
    rafPromiseResolve?.()
    rafPromiseResolve = null
    rafPromise = null
    microtaskPromiseResolve?.()
    microtaskPromiseResolve = null
    microtaskPromise = null
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
    await schedule(true)
  }

  onMounted(async () => {
    if (!enabled.value)
      return
    start()
    if (opt.immediate)
      await measureAndSync(false)
  })

  onBeforeUnmount(() => stop())

  return { refresh, measure, start, stop, setEnabled, size }
}
