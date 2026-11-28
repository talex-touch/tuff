import type { MaybeRefOrGetter, Ref } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref, toValue } from 'vue'

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
  // Scalar options accept refs/getters so callers can keep them reactive after
  // mount. They are resolved lazily via toValue() at each consumption point.
  width?: MaybeRefOrGetter<boolean>

  height?: MaybeRefOrGetter<boolean>

  applyStyle?: MaybeRefOrGetter<boolean>

  applyMode?: MaybeRefOrGetter<AutoResizeApplyMode>

  durationMs?: MaybeRefOrGetter<number>

  easing?: MaybeRefOrGetter<string>

  clearStyleOnFinish?: MaybeRefOrGetter<boolean>

  styleTarget?: MaybeRefOrGetter<'outer' | 'inner'>

  observeTarget?: MaybeRefOrGetter<'inner' | 'outer' | 'both'>

  rounding?: MaybeRefOrGetter<AutoResizeRounding>

  immediate?: MaybeRefOrGetter<boolean>

  rafBatch?: MaybeRefOrGetter<boolean>

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
  // Resolve scalar options lazily. Each access re-reads the source via toValue(),
  // so refs/getters passed by the caller stay live after mount instead of being
  // frozen into a one-shot snapshot at construction time (issue #366). Callbacks
  // are kept as-is: toValue() would mistake a plain callback for a getter.
  const opt = {
    get width() { return toValue(options.width) ?? true },
    get height() { return toValue(options.height) ?? false },
    get applyStyle() { return toValue(options.applyStyle) ?? true },
    get applyMode() { return toValue(options.applyMode) ?? 'sync' },
    get styleTarget() { return toValue(options.styleTarget) ?? 'outer' },
    get observeTarget() { return toValue(options.observeTarget) ?? 'inner' },
    get rounding() { return toValue(options.rounding) ?? 'ceil' },
    get immediate() { return toValue(options.immediate) ?? true },
    get rafBatch() { return toValue(options.rafBatch) ?? true },
    get durationMs() { return toValue(options.durationMs) ?? 200 },
    get easing() { return toValue(options.easing) ?? 'ease' },
    get clearStyleOnFinish() { return toValue(options.clearStyleOnFinish) ?? true },
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
  let activeApplyCleanup: ((resume?: boolean) => void) | null = null

  const pauseObserver = () => {
    ro.value?.disconnect()
    ro.value = null
  }

  const resumeObserver = () => {
    if (enabled.value)
      start()
  }

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

  const measureBox = (el: HTMLElement): AutoResizeSize => {
    const rect = el.getBoundingClientRect()
    const ow = el.offsetWidth
    const oh = el.offsetHeight
    // When an ancestor CSS transform (such as a popover open scale animation) is active,
    // getBoundingClientRect() returns the transformed box while offsetWidth/offsetHeight
    // reflects the untransformed layout size. Keep rect when unscaled so subpixel rounding
    // modes and jsdom mocks that stub getBoundingClientRect() remain exact.
    const width = ow > 0 && Math.abs(rect.width - ow) > 1 ? ow : rect.width
    const height = oh > 0 && Math.abs(rect.height - oh) > 1 ? oh : rect.height
    return { width, height }
  }

  const computeMeasuredSize = (inner: HTMLElement, styleEl: HTMLElement): AutoResizeSize => {
    const box = measureBox(inner)
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

    return {
      width: round(box.width + extraW),
      height: round(box.height + extraH),
    }
  }

  const apply = (e: AutoResizeEvent, styleEl: HTMLElement) => {
    if (!opt.applyStyle)
      return

    let interruptedFrom: AutoResizeSize | null = null
    if (activeApplyCleanup) {
      const liveBox = measureBox(styleEl)
      if (liveBox.width > 0 || liveBox.height > 0) {
        interruptedFrom = {
          width: round(liveBox.width),
          height: round(liveBox.height),
        }
      }
      const cleanup = activeApplyCleanup
      activeApplyCleanup = null
      cleanup(false)
    }

    if (opt.applyMode === 'sync') {
      const nextW = opt.width ? `${e.next.width}px` : null
      const nextH = opt.height ? `${e.next.height}px` : null
      const needsWrite = (nextW !== null && styleEl.style.width !== nextW)
        || (nextH !== null && styleEl.style.height !== nextH)
      if (!needsWrite) {
        resumeObserver()
        return
      }
      pauseObserver()
      if (nextW !== null)
        styleEl.style.width = nextW
      if (nextH !== null)
        styleEl.style.height = nextH
      resumeObserver()
      return
    }

    const resolvedApplyMode: AutoResizeApplyMode = opt.applyMode === 'auto'
      ? (canWaapi(styleEl) ? 'waapi' : 'transition')
      : opt.applyMode

    const from = interruptedFrom ?? e.prev
    if (!from) {
      resumeObserver()
      return
    }

    const props: string[] = []
    if (opt.width && from.width !== e.next.width)
      props.push('width')
    if (opt.height && from.height !== e.next.height)
      props.push('height')

    if (props.length === 0) {
      resumeObserver()
      return
    }

    if (resolvedApplyMode === 'waapi' && !canWaapi(styleEl)) {
      resumeObserver()
      return
    }

    // Pause ResizeObserver only while actively mutating/animating styleEl
    pauseObserver()

    const prevWidth = styleEl.style.width
    const prevHeight = styleEl.style.height

    if (resolvedApplyMode === 'waapi') {
      if (props.includes('width'))
        styleEl.style.width = `${from.width}px`
      if (props.includes('height'))
        styleEl.style.height = `${from.height}px`

      const frames: Keyframe[] = [
        {
          ...(props.includes('width') ? { width: `${from.width}px` } : {}),
          ...(props.includes('height') ? { height: `${from.height}px` } : {}),
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
      const done = (committed: boolean) => {
        if (finished)
          return
        finished = true

        if (opt.clearStyleOnFinish) {
          if (props.includes('width'))
            styleEl.style.width = ''
          if (props.includes('height'))
            styleEl.style.height = ''
        }
        else if (committed) {
          if (props.includes('width'))
            styleEl.style.width = `${e.next.width}px`
          if (props.includes('height'))
            styleEl.style.height = `${e.next.height}px`
        }
        else {
          if (props.includes('width'))
            styleEl.style.width = prevWidth
          if (props.includes('height'))
            styleEl.style.height = prevHeight
        }
      }

      const cleanup = (resume = true) => {
        anim.removeEventListener('finish', onFinish)
        anim.removeEventListener('cancel', onCancel)
        done(false)
        anim.cancel()
        if (activeApplyCleanup === cleanup)
          activeApplyCleanup = null
        if (resume)
          resumeObserver()
      }

      function onFinish() {
        anim.removeEventListener('cancel', onCancel)
        done(true)
        // Release fill: 'forwards' after inline styles settle so future content
        // height/width changes are never pinned to the completed animation keyframe.
        anim.cancel()
        if (activeApplyCleanup === cleanup)
          activeApplyCleanup = null
        resumeObserver()
      }

      function onCancel() {
        anim.removeEventListener('finish', onFinish)
        done(false)
        if (activeApplyCleanup === cleanup)
          activeApplyCleanup = null
        resumeObserver()
      }

      anim.addEventListener('finish', onFinish, { once: true })
      anim.addEventListener('cancel', onCancel, { once: true })

      activeApplyCleanup = cleanup
      return
    }

    const prevTransitionProperty = styleEl.style.transitionProperty
    const prevTransitionDuration = styleEl.style.transitionDuration
    const prevTransitionTimingFunction = styleEl.style.transitionTimingFunction

    styleEl.style.transitionProperty = props.join(',')
    styleEl.style.transitionDuration = '0ms'
    styleEl.style.transitionTimingFunction = opt.easing

    if (props.includes('width'))
      styleEl.style.width = `${from.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${from.height}px`

    styleEl.offsetWidth

    styleEl.style.transitionDuration = `${opt.durationMs}ms`
    if (props.includes('width'))
      styleEl.style.width = `${e.next.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${e.next.height}px`

    let finished = false
    const remaining = new Set(props)
    let timeoutId: number | null = null

    const done = (committed: boolean) => {
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
      else if (committed) {
        if (props.includes('width'))
          styleEl.style.width = `${e.next.width}px`
        if (props.includes('height'))
          styleEl.style.height = `${e.next.height}px`
      }
      else {
        if (props.includes('width'))
          styleEl.style.width = prevWidth
        if (props.includes('height'))
          styleEl.style.height = prevHeight
      }
    }

    const cleanup = (resume = true) => {
      styleEl.removeEventListener('transitionend', onEnd)
      if (timeoutId != null)
        clearTimeout(timeoutId)
      done(false)
      if (activeApplyCleanup === cleanup)
        activeApplyCleanup = null
      if (resume)
        resumeObserver()
    }

    function onEnd(ev: TransitionEvent) {
      if (ev.target !== styleEl)
        return
      if (!props.includes(ev.propertyName))
        return

      remaining.delete(ev.propertyName)
      if (remaining.size > 0)
        return

      styleEl.removeEventListener('transitionend', onEnd)
      if (timeoutId != null)
        clearTimeout(timeoutId)
      done(true)
      if (activeApplyCleanup === cleanup)
        activeApplyCleanup = null
      resumeObserver()
    }

    styleEl.addEventListener('transitionend', onEnd)

    if (typeof setTimeout !== 'undefined') {
      timeoutId = setTimeout(() => {
        styleEl.removeEventListener('transitionend', onEnd)
        done(true)
        if (activeApplyCleanup === cleanup)
          activeApplyCleanup = null
        resumeObserver()
      }, opt.durationMs + 34) as unknown as number
    }

    activeApplyCleanup = cleanup
  }

  const measureAndSync = async (isManual: boolean) => {
    await nextTick()
    const { inner, styleEl } = getTargets()
    if (!inner || !styleEl)
      return
    if (!enabled.value)
      return

    const next = computeMeasuredSize(inner, styleEl)

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

    const next = computeMeasuredSize(inner, styleEl)

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
    pauseObserver()
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
    const cleanup = activeApplyCleanup
    activeApplyCleanup = null
    cleanup?.(false)
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
