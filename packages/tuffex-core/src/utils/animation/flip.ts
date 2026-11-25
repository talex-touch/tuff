import { shallowRef, toValue, type MaybeRefOrGetter, type ShallowRef } from '@vue/reactivity'

export type FlipMode = 'transform' | 'size'

export interface FlipSizeOptions {
  width?: MaybeRefOrGetter<boolean>
  height?: MaybeRefOrGetter<boolean>
}

export interface FlipControllerOptions {
  duration?: MaybeRefOrGetter<number>
  easing?: MaybeRefOrGetter<string>
  mode?: FlipMode
  includeScale?: boolean
  size?: FlipSizeOptions
  onBefore?: () => void
  onAfter?: () => void
}

export interface FlipController {
  flip: (action: () => void | Promise<void>) => Promise<void>
  kill: () => void
  running: ShallowRef<boolean>
}

/**
 * Framework-agnostic FLIP animation controller built purely on `@vue/reactivity` + DOM.
 */
export function createFlipController(
  target: MaybeRefOrGetter<HTMLElement | null>,
  opts: FlipControllerOptions = {},
): FlipController {
  const running = shallowRef(false)

  const opt = {
    get duration() { return toValue(opts.duration) ?? 200 },
    get easing() { return toValue(opts.easing) ?? 'cubic-bezier(0.2, 0, 0, 1)' },
    mode: opts.mode ?? 'transform',
    includeScale: opts.includeScale ?? true,
    size: opts.size ?? { width: true, height: true },
    onBefore: opts.onBefore ?? (() => {}),
    onAfter: opts.onAfter ?? (() => {}),
  }

  let activeCleanup: (() => void) | null = null
  let lastMode: FlipMode = opt.mode

  const kill = () => {
    const el = toValue(target)
    const shouldFreeze = running.value && el && lastMode === 'size'
    const freezeRect = shouldFreeze && el ? el.getBoundingClientRect() : null

    activeCleanup?.()
    activeCleanup = null

    if (shouldFreeze && el && freezeRect) {
      el.style.transitionProperty = ''
      el.style.transitionDuration = '0ms'
      el.style.transitionTimingFunction = ''
      const shouldWidth = toValue(opt.size?.width) ?? true
      const shouldHeight = toValue(opt.size?.height) ?? true
      if (shouldWidth)
        el.style.width = `${freezeRect.width}px`
      if (shouldHeight)
        el.style.height = `${freezeRect.height}px`
      void el.offsetWidth
    }

    running.value = false
  }

  const waitRaf = async () => {
    if (typeof requestAnimationFrame === 'undefined')
      return
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }

  async function flip(action: () => void | Promise<void>) {
    const el = toValue(target)
    if (!el) {
      await action()
      return
    }

    kill()
    running.value = true
    lastMode = opt.mode

    const first = el.getBoundingClientRect()
    opt.onBefore()
    await action()
    await Promise.resolve()
    await waitRaf()

    const last = el.getBoundingClientRect()
    const dx = first.left - last.left
    const dy = first.top - last.top
    const dw = first.width / (last.width || 1)
    const dh = first.height / (last.height || 1)

    if (opt.mode === 'transform') {
      const prevTransitionProperty = el.style.transitionProperty
      const prevTransitionDuration = el.style.transitionDuration
      const prevTransitionTimingFunction = el.style.transitionTimingFunction
      const prevTransform = el.style.transform
      const prevTransformOrigin = el.style.transformOrigin

      el.style.transitionProperty = 'transform'
      el.style.transitionDuration = '0ms'
      el.style.transitionTimingFunction = opt.easing
      el.style.transformOrigin = 'top left'
      const scalePart = opt.includeScale ? ` scale(${dw}, ${dh})` : ''
      el.style.transform = `translate(${dx}px, ${dy}px)${scalePart}`
      void el.offsetWidth

      el.style.transitionDuration = `${opt.duration}ms`
      el.style.transform = `translate(0px, 0px)${opt.includeScale ? ' scale(1, 1)' : ''}`

      const restore = () => {
        el.style.transitionProperty = prevTransitionProperty
        el.style.transitionDuration = prevTransitionDuration
        el.style.transitionTimingFunction = prevTransitionTimingFunction
        el.style.transform = prevTransform
        el.style.transformOrigin = prevTransformOrigin
      }

      const onEnd = (e: TransitionEvent) => {
        if (e.propertyName !== 'transform')
          return
        el.removeEventListener('transitionend', onEnd)
        restore()
        opt.onAfter()
        running.value = false
      }

      el.addEventListener('transitionend', onEnd)
      activeCleanup = () => {
        el.removeEventListener('transitionend', onEnd)
        restore()
      }
      return
    }

    const shouldWidth = toValue(opt.size?.width) ?? true
    const shouldHeight = toValue(opt.size?.height) ?? true
    const prevTransitionProperty = el.style.transitionProperty
    const prevTransitionDuration = el.style.transitionDuration
    const prevTransitionTimingFunction = el.style.transitionTimingFunction
    const prevWidth = el.style.width
    const prevHeight = el.style.height

    const props: string[] = []
    if (shouldWidth && first.width !== last.width)
      props.push('width')
    if (shouldHeight && first.height !== last.height)
      props.push('height')

    if (props.length === 0) {
      if (shouldWidth && prevWidth)
        el.style.width = prevWidth
      if (shouldHeight && prevHeight)
        el.style.height = prevHeight
      opt.onAfter()
      running.value = false
      return
    }

    el.style.transitionProperty = props.join(',')
    el.style.transitionDuration = '0ms'
    el.style.transitionTimingFunction = opt.easing
    if (props.includes('width'))
      el.style.width = `${first.width}px`
    if (props.includes('height'))
      el.style.height = `${first.height}px`
    void el.offsetWidth

    el.style.transitionDuration = `${opt.duration}ms`
    if (props.includes('width'))
      el.style.width = `${last.width}px`
    if (props.includes('height'))
      el.style.height = `${last.height}px`

    let finished = false
    const remaining = new Set(props)
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const done = () => {
      if (finished)
        return
      finished = true
      el.style.transitionProperty = prevTransitionProperty
      el.style.transitionDuration = prevTransitionDuration
      el.style.transitionTimingFunction = prevTransitionTimingFunction
      if (props.includes('width'))
        el.style.width = prevWidth
      if (props.includes('height'))
        el.style.height = prevHeight
      opt.onAfter()
      running.value = false
    }

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || !props.includes(e.propertyName))
        return
      remaining.delete(e.propertyName)
      if (remaining.size > 0)
        return
      el.removeEventListener('transitionend', onEnd)
      done()
    }

    el.addEventListener('transitionend', onEnd)
    if (typeof setTimeout !== 'undefined') {
      timeoutId = setTimeout(() => {
        el.removeEventListener('transitionend', onEnd)
        done()
      }, opt.duration + 34)
    }

    activeCleanup = () => {
      el.removeEventListener('transitionend', onEnd)
      if (timeoutId != null)
        clearTimeout(timeoutId)
      done()
    }
  }

  return { flip, kill, running }
}
