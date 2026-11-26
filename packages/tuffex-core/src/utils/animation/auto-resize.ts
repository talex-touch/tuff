import type { MaybeRefOrGetter, ShallowRef } from '@vue/reactivity'
import { shallowRef, toValue } from '@vue/reactivity'

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

export interface AutoResizeControllerOptions {
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
  onResize?: (e: AutoResizeEvent) => void
  onBeforeApply?: (e: AutoResizeEvent) => void
  onAfterApply?: (e: AutoResizeEvent) => void
}

export interface AutoResizeController {
  refresh: () => Promise<void>
  measure: (isManual?: boolean) => Promise<AutoResizeSize | null>
  start: () => void
  stop: () => void
  setEnabled: (enabled: boolean) => void
  size: ShallowRef<AutoResizeSize | null>
}

/**
 * Framework-agnostic ResizeObserver auto-resize controller built purely on `@vue/reactivity` + DOM.
 */
export function createAutoResizeController(
  outerTarget: MaybeRefOrGetter<HTMLElement | null>,
  innerTarget: MaybeRefOrGetter<HTMLElement | null>,
  options: AutoResizeControllerOptions = {},
): AutoResizeController {
  const opt = {
    get width() { return toValue(options.width) ?? true },
    get height() { return toValue(options.height) ?? false },
    get applyStyle() { return toValue(options.applyStyle) ?? true },
    get applyMode() { return toValue(options.applyMode) ?? 'sync' },
    get styleTarget() { return toValue(options.styleTarget) ?? 'outer' },
    get observeTarget() { return toValue(options.observeTarget) ?? 'inner' },
    get rounding() { return toValue(options.rounding) ?? 'ceil' },
    get durationMs() { return toValue(options.durationMs) ?? 200 },
    get easing() { return toValue(options.easing) ?? 'ease' },
    get clearStyleOnFinish() { return toValue(options.clearStyleOnFinish) ?? true },
    onResize: options.onResize ?? (() => {}),
    onBeforeApply: options.onBeforeApply ?? (() => {}),
    onAfterApply: options.onAfterApply ?? (() => {}),
  }

  const size = shallowRef<AutoResizeSize | null>(null)
  let enabled = true
  let ro: ResizeObserver | null = null
  let activeCleanup: (() => void) | null = null
  let startImpl: () => void = () => {}
  const start = () => startImpl()

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
    const outer = toValue(outerTarget)
    const inner = toValue(innerTarget)
    const styleEl = opt.styleTarget === 'outer' ? outer : inner
    return { outer, inner, styleEl }
  }

  const computeSize = (inner: HTMLElement, styleEl: HTMLElement): AutoResizeSize => {
    const rect = inner.getBoundingClientRect()
    let extraW = 0
    let extraH = 0
    if (styleEl !== inner && typeof getComputedStyle === 'function') {
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
      width: round(rect.width + extraW),
      height: round(rect.height + extraH),
    }
  }

  const apply = (e: AutoResizeEvent, styleEl: HTMLElement) => {
    if (!opt.applyStyle)
      return

    ro?.disconnect()
    activeCleanup?.()
    activeCleanup = null

    if (opt.applyMode === 'sync' || !e.prev) {
      if (opt.width)
        styleEl.style.width = `${e.next.width}px`
      if (opt.height)
        styleEl.style.height = `${e.next.height}px`
      if (enabled)
        start()
      return
    }

    const props: string[] = []
    if (opt.width && e.prev.width !== e.next.width)
      props.push('width')
    if (opt.height && e.prev.height !== e.next.height)
      props.push('height')

    if (props.length === 0) {
      if (enabled)
        start()
      return
    }

    const prevTransitionProperty = styleEl.style.transitionProperty
    const prevTransitionDuration = styleEl.style.transitionDuration
    const prevTransitionTimingFunction = styleEl.style.transitionTimingFunction
    const prevWidth = styleEl.style.width
    const prevHeight = styleEl.style.height

    styleEl.style.transitionProperty = props.join(',')
    styleEl.style.transitionDuration = '0ms'
    styleEl.style.transitionTimingFunction = opt.easing
    if (props.includes('width'))
      styleEl.style.width = `${e.prev.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${e.prev.height}px`
    void styleEl.offsetWidth

    styleEl.style.transitionDuration = `${opt.durationMs}ms`
    if (props.includes('width'))
      styleEl.style.width = `${e.next.width}px`
    if (props.includes('height'))
      styleEl.style.height = `${e.next.height}px`

    let finished = false
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
      if (enabled)
        start()
    }

    const timeoutId = typeof setTimeout !== 'undefined'
      ? setTimeout(done, opt.durationMs + 34)
      : null

    activeCleanup = () => {
      if (timeoutId != null)
        clearTimeout(timeoutId)
      done()
    }
  }

  const measure = async (isManual = false): Promise<AutoResizeSize | null> => {
    await Promise.resolve()
    const { inner, styleEl } = getTargets()
    if (!inner || !styleEl || !enabled)
      return null
    const next = computeSize(inner, styleEl)
    const event: AutoResizeEvent = { prev: size.value, next, isManual }
    size.value = next
    opt.onResize(event)
    return next
  }

  const refresh = async (): Promise<void> => {
    await Promise.resolve()
    const { inner, styleEl } = getTargets()
    if (!inner || !styleEl || !enabled)
      return
    const next = computeSize(inner, styleEl)
    const event: AutoResizeEvent = { prev: size.value, next, isManual: true }
    size.value = next
    opt.onResize(event)
    opt.onBeforeApply(event)
    apply(event, styleEl)
    opt.onAfterApply(event)
  }

  startImpl = () => {
    if (ro || typeof ResizeObserver === 'undefined')
      return
    const { outer, inner } = getTargets()
    const targets: HTMLElement[] = []
    if (opt.observeTarget === 'inner' && inner) {
      targets.push(inner)
    }
    else if (opt.observeTarget === 'outer' && outer) {
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
    ro = new ResizeObserver(() => {
      void refresh()
    })
    for (const t of targets)
      ro.observe(t)
  }

  const stop = () => {
    ro?.disconnect()
    ro = null
    activeCleanup?.()
    activeCleanup = null
  }

  const setEnabled = (v: boolean) => {
    enabled = v
    if (!v)
      stop()
    else start()
  }

  return { refresh, measure, start, stop, setEnabled, size }
}
