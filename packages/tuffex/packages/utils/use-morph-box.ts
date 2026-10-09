import type { MaybeRefOrGetter, Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'
import { stepSpring } from './animation/spring'
import { hasWindow } from './env'
import { useReducedMotion } from './use-reduced-motion'

/**
 * The size half of "one shape, never cut": a box that follows its content's
 * natural size on a frame spring instead of jumping to it.
 *
 * The host owns two elements. `content` holds what the box shows at its own
 * natural size (nothing about the box may constrain it on an animated axis),
 * and `box` is the shape around it. A ResizeObserver on `content` fires after
 * layout and before paint, so the box is pinned at the size it visibly had
 * before the new one can show, then springs to the new one.
 *
 * Interruptible by construction: a size change mid-flight only moves the
 * target, and position and velocity carry over, so the box never jumps back
 * and never stalls at zero velocity the way a restarted tween does. Once both
 * axes settle the inline size is cleared and the box is `auto` again.
 */

export interface MorphBoxSpring {
  stiffness: number
  damping: number
  mass?: number
}

export interface MorphBoxFrame {
  /** Border-box size painted this frame, px. */
  width: number
  height: number
  /** `true` once, on the frame the box lands and returns to `auto`. */
  settled: boolean
}

export interface UseMorphBoxOptions {
  /** Spring the width. Off, the box takes the width its layout gives it. Default `true`. */
  width?: MaybeRefOrGetter<boolean | undefined>
  /** Spring the height. Default `true`. */
  height?: MaybeRefOrGetter<boolean | undefined>
  /** Default {@link MORPH_BOX_SPRING}. */
  spring?: MaybeRefOrGetter<MorphBoxSpring | undefined>
  /** `false` turns the observer off and lands the box at once. Default `true`. */
  enabled?: MaybeRefOrGetter<boolean | undefined>
  onFrame?: (frame: MorphBoxFrame) => void
}

export interface UseMorphBoxReturn {
  /** `true` while the box is springing. */
  morphing: Ref<boolean>
  /** Land on the content's size now, dropping any motion. */
  settle: () => void
}

/** liquid's `snappy` preset: ζ ≈ 0.78, one overshoot of about 2%, settled in ~250ms. */
export const MORPH_BOX_SPRING: MorphBoxSpring = { stiffness: 480, damping: 34 }

const SETTLE_DISTANCE = 0.25
const SETTLE_SPEED = 8
/** A stalled tab must not hand the spring one giant step. */
const MAX_FRAME_S = 0.064
const MIN_CHANGE = 0.5

type Axis = 'width' | 'height'
const AXES: Axis[] = ['width', 'height']

interface Size { width: number, height: number }

/** The box's padding and border, and whether an inline size leaves them out. */
interface Chrome extends Size { contentBox: boolean }

function chromeOf(el: HTMLElement): Chrome {
  const style = getComputedStyle(el)
  const px = (value: string) => Number.parseFloat(value) || 0
  return {
    width: px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth),
    height: px(style.paddingTop) + px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth),
    contentBox: style.boxSizing !== 'border-box',
  }
}

/** Layout size, never the transformed one: a scaled ancestor must not leak into inline px. */
function measure(el: HTMLElement, entry?: ResizeObserverEntry): Size {
  const box = entry?.borderBoxSize?.[0]
  if (box)
    return { width: box.inlineSize, height: box.blockSize }
  return { width: el.offsetWidth, height: el.offsetHeight }
}

export function useMorphBox(
  box: Ref<HTMLElement | null | undefined>,
  content: Ref<HTMLElement | null | undefined>,
  options: UseMorphBoxOptions = {},
): UseMorphBoxReturn {
  const reduced = useReducedMotion()
  const morphing = ref(false)

  let observer: ResizeObserver | null = null
  let frameId = 0
  let lastTs = 0
  /** The content's size at the last observation; the box rests at this plus `chrome`. */
  let natural: Size | null = null
  let chrome: Chrome = { width: 0, height: 0, contentBox: false }
  const position: Size = { width: 0, height: 0 }
  const velocity: Size = { width: 0, height: 0 }
  const target: Size = { width: 0, height: 0 }

  const animates = (axis: Axis) => toValue(axis === 'width' ? options.width : options.height) !== false
  const enabled = () => toValue(options.enabled) !== false

  function write() {
    const el = box.value
    if (!el)
      return
    // `position` is the border box; a content-box box takes its size without the chrome.
    for (const axis of AXES)
      el.style[axis] = animates(axis) ? `${position[axis] - (chrome.contentBox ? chrome[axis] : 0)}px` : ''
  }

  function cancelFrame() {
    if (frameId && hasWindow())
      cancelAnimationFrame(frameId)
    frameId = 0
  }

  function land() {
    cancelFrame()
    const el = box.value
    if (el) {
      el.style.width = ''
      el.style.height = ''
    }
    velocity.width = 0
    velocity.height = 0
    if (morphing.value) {
      morphing.value = false
      options.onFrame?.({ width: target.width, height: target.height, settled: true })
    }
  }

  function step(ts: number) {
    frameId = 0
    const dt = lastTs ? Math.min(Math.max((ts - lastTs) / 1000, 0), MAX_FRAME_S) : 1 / 60
    lastTs = ts
    const spring = toValue(options.spring) ?? MORPH_BOX_SPRING
    let settled = true
    for (const axis of AXES) {
      if (!animates(axis))
        continue
      const [p, v] = stepSpring(position[axis], velocity[axis], target[axis], spring, dt)
      position[axis] = p
      velocity[axis] = v
      if (Math.abs(p - target[axis]) > SETTLE_DISTANCE || Math.abs(v) > SETTLE_SPEED)
        settled = false
    }
    if (settled) {
      land()
      return
    }
    write()
    options.onFrame?.({ width: position.width, height: position.height, settled: false })
    frameId = requestAnimationFrame(step)
  }

  function onResize(entry?: ResizeObserverEntry) {
    const el = box.value
    const inner = content.value
    if (!el || !inner)
      return
    const next = measure(inner, entry)
    const previous = natural
    const restChrome = chrome
    natural = next
    chrome = chromeOf(el)
    // The first sighting has nothing to come from, and neither does a box whose
    // content had no size yet (mounted hidden, or before its first layout): it
    // must appear at its size, not grow out of nothing. Reduced motion and a
    // disabled morph let the box follow its content as plain layout would.
    if (!previous || (previous.width === 0 && previous.height === 0) || reduced.value || !enabled()) {
      land()
      return
    }
    const changed = AXES.some(axis => animates(axis) && Math.abs(next[axis] - previous[axis]) >= MIN_CHANGE)
    if (!changed && !morphing.value)
      return

    target.width = next.width + chrome.width
    target.height = next.height + chrome.height
    if (!morphing.value) {
      // At rest the box sat exactly at its content's previous size inside the
      // chrome it had then: start there, and pin it before this frame paints.
      position.width = previous.width + restChrome.width
      position.height = previous.height + restChrome.height
      velocity.width = 0
      velocity.height = 0
      lastTs = 0
      morphing.value = true
      write()
    }
    if (!frameId && hasWindow())
      frameId = requestAnimationFrame(step)
  }

  // A new content element, or the morph turned off or on: start over from rest.
  function observe() {
    observer?.disconnect()
    observer = null
    natural = null
    land()
    const inner = content.value
    if (!inner || typeof ResizeObserver === 'undefined' || !enabled())
      return
    observer = new ResizeObserver((entries) => {
      const entry = entries.find(e => e.target === content.value)
      if (entry)
        onResize(entry)
    })
    observer.observe(inner)
    onResize()
  }

  onMounted(observe)
  watch([content, () => enabled()], observe)
  watch(reduced, (value) => {
    if (value)
      land()
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    cancelFrame()
  })

  return { morphing, settle: land }
}
