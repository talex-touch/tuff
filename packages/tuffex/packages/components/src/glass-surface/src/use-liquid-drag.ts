import type { ComponentPublicInstance, MaybeRefOrGetter, Ref } from 'vue'
import { onBeforeUnmount, shallowRef, toValue, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../utils/frame-loop'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'

type DragTarget = HTMLElement | ComponentPublicInstance | null | undefined

export interface LiquidDragOptions {
  /** What the lens may not leave. Without it the lens goes wherever the pointer does. */
  bounds?: MaybeRefOrGetter<DragTarget>
  disabled?: MaybeRefOrGetter<boolean>
  /** Selector of the elements inside the lens that do not start a drag, buttons and the like. */
  ignore?: string
  /** Spring that eases the lift and the stretch. @default 150 */
  stiffness?: MaybeRefOrGetter<number>
  /** @default 19 */
  damping?: MaybeRefOrGetter<number>
  /** Stretch along an axis per px/s of speed on it, as a share of the size. @default 0.00018 */
  stretch?: MaybeRefOrGetter<number>
  /** The most the lens stretches along one axis, as a share of its size. @default 0.3 */
  maxStretch?: MaybeRefOrGetter<number>
  /** Height at rest, as a share of the layout height. @default 1 */
  restHeight?: MaybeRefOrGetter<number>
  /** How much taller a press makes the lens, as a share of its rest height. @default 0.1 */
  pressGrow?: MaybeRefOrGetter<number>
  /** How far the width swells per unit of speed while the lens lifts or settles. @default 0.016 */
  swell?: MaybeRefOrGetter<number>
}

export interface LiquidDragState {
  dragging: Readonly<Ref<boolean>>
  /** Where the lens is from where layout puts it, px. */
  position: () => { x: number, y: number }
  /** Puts the lens back where layout puts it. */
  reset: () => void
}

interface Axis {
  value: number
  speed: number
}

/** Seconds a frame is taken to last at least, so a burst of pointer events does not divide by zero into a speed spike. */
const MIN_STEP_S = 1 / 240
/** How fast the measured speed follows the pointer's, per second; it smooths the jitter of a mouse. */
const VELOCITY_FOLLOW = 20

function resolveElement(target: DragTarget): HTMLElement | null {
  if (!target)
    return null
  const el = '$el' in target ? target.$el : target
  return el && typeof (el as HTMLElement).getBoundingClientRect === 'function' ? el as HTMLElement : null
}

function clamp(value: number, min: number, max: number): number {
  // A lens larger than its bounds is held at the middle of them rather than pushed out of either end.
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value))
}

/**
 * Makes an element draggable like a drop of liquid glass: it lifts under the pointer, stretches along
 * the way it is dragged and springs back when it stops. Position follows the pointer exactly; only the
 * shape lags. It drives `transform` and the `--tx-glass-lift` custom property of the element, which
 * `TxGlassSurface` reads for its shadows, from a frame loop that sleeps once everything is at rest.
 *
 * The element is deformed by transform alone, so a lens keeps its layout size (and its refraction map)
 * through the whole drag. Under reduced motion the lift is applied without easing and nothing stretches.
 * The numbers may be refs or getters, and are read again on every frame, so they can be tuned live.
 */
export function useLiquidDrag(target: MaybeRefOrGetter<DragTarget>, options: LiquidDragOptions = {}): LiquidDragState {
  const dragging = shallowRef(false)
  const reduced = useReducedMotion()

  const lift: Axis = { value: 0, speed: 0 }
  const stretchX: Axis = { value: 0, speed: 0 }
  const stretchY: Axis = { value: 0, speed: 0 }
  let x = 0
  let y = 0
  let lastX = 0
  let lastY = 0
  let velocityX = 0
  let velocityY = 0

  let element: HTMLElement | null = null
  let pointerId = -1
  let grabX = 0
  let grabY = 0
  let homeX = 0
  let homeY = 0
  let minX = Number.NEGATIVE_INFINITY
  let maxX = Number.POSITIVE_INFINITY
  let minY = Number.NEGATIVE_INFINITY
  let maxY = Number.POSITIVE_INFINITY
  let previous: { touchAction: string, userSelect: string, cursor: string } | null = null

  function advance(axis: Axis, goal: number, dt: number, spring: { stiffness: number, damping: number }): void {
    const [value, speed] = stepSpring(axis.value, axis.speed, goal, spring, dt)
    axis.value = value
    axis.speed = speed
  }

  function draw(): void {
    if (!element)
      return
    const swell = toValue(options.swell) ?? 0.016
    const restHeight = toValue(options.restHeight) ?? 1
    const pressGrow = toValue(options.pressGrow) ?? 0.1
    const scaleX = (1 + swell * lift.speed) * (1 + stretchX.value) * (1 - stretchY.value)
    const scaleY = restHeight * (1 + pressGrow * lift.value) * (1 + stretchY.value) * (1 - stretchX.value)
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`
    element.style.setProperty('--tx-glass-lift', String(lift.value))
  }

  function settled(): boolean {
    const axes = [lift, stretchX, stretchY]
    const liftTarget = dragging.value ? 1 : 0
    return Math.abs(lift.value - liftTarget) < 0.001
      && axes.every(axis => Math.abs(axis.speed) < 0.01)
      && Math.abs(stretchX.value) < 0.0005
      && Math.abs(stretchY.value) < 0.0005
      && Math.abs(velocityX) < 1
      && Math.abs(velocityY) < 1
  }

  const loop = createFrameLoop((frame) => {
    const dt = Math.max(frame, MIN_STEP_S)
    const follow = Math.min(1, VELOCITY_FOLLOW * dt)
    velocityX += ((x - lastX) / dt - velocityX) * follow
    velocityY += ((y - lastY) / dt - velocityY) * follow
    lastX = x
    lastY = y

    if (reduced.value) {
      lift.value = dragging.value ? 1 : 0
      lift.speed = 0
      stretchX.value = 0
      stretchX.speed = 0
      stretchY.value = 0
      stretchY.speed = 0
    }
    else {
      const spring = { stiffness: toValue(options.stiffness) ?? 150, damping: toValue(options.damping) ?? 19 }
      const stretchRate = toValue(options.stretch) ?? 0.00018
      const maxStretch = toValue(options.maxStretch) ?? 0.3
      advance(stretchX, Math.min(maxStretch, stretchRate * Math.abs(velocityX)), dt, spring)
      advance(stretchY, Math.min(maxStretch, stretchRate * Math.abs(velocityY)), dt, spring)
      advance(lift, dragging.value ? 1 : 0, dt, spring)
    }

    draw()
    if (dragging.value || !settled())
      return true

    // Land exactly on rest, so the last frame the loop draws is the one that stays.
    lift.value = 0
    lift.speed = 0
    stretchX.value = 0
    stretchX.speed = 0
    stretchY.value = 0
    stretchY.speed = 0
    velocityX = 0
    velocityY = 0
    draw()
    return false
  }, { maxStep: 1 / 30, firstStep: 1 / 60 })

  function onPointerDown(event: PointerEvent): void {
    if (!element || dragging.value || event.button !== 0 || toValue(options.disabled))
      return
    if (options.ignore && event.target instanceof Element && event.target.closest(options.ignore))
      return

    // The rect includes the offset and the scale about the centre, and neither moves the centre.
    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    homeX = centerX - x
    homeY = centerY - y
    grabX = event.clientX - centerX
    grabY = event.clientY - centerY

    const stage = resolveElement(toValue(options.bounds))?.getBoundingClientRect()
    const halfWidth = element.offsetWidth / 2
    const halfHeight = element.offsetHeight / 2
    minX = stage ? stage.left + halfWidth - homeX : Number.NEGATIVE_INFINITY
    maxX = stage ? stage.right - halfWidth - homeX : Number.POSITIVE_INFINITY
    minY = stage ? stage.top + halfHeight - homeY : Number.NEGATIVE_INFINITY
    maxY = stage ? stage.bottom - halfHeight - homeY : Number.POSITIVE_INFINITY

    pointerId = event.pointerId
    lastX = x
    lastY = y
    dragging.value = true
    // Capture keeps the events coming when the pointer outruns the lens, but not everywhere it can be asked for, so the window listens as well.
    element.setPointerCapture?.(pointerId)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    element.style.cursor = 'grabbing'
    event.preventDefault()
    loop.start()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging.value || event.pointerId !== pointerId)
      return
    x = clamp(event.clientX - grabX - homeX, minX, maxX)
    y = clamp(event.clientY - grabY - homeY, minY, maxY)
    loop.start()
  }

  function stopListening(): void {
    // The immediate watcher below also runs while rendering on the server, where there is no window.
    if (typeof window === 'undefined')
      return
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
  }

  function onPointerEnd(event: PointerEvent): void {
    if (!dragging.value || event.pointerId !== pointerId)
      return
    dragging.value = false
    pointerId = -1
    stopListening()
    if (element) {
      element.releasePointerCapture?.(event.pointerId)
      element.style.cursor = 'grab'
    }
    loop.start()
  }

  function attach(next: HTMLElement): void {
    element = next
    previous = { touchAction: next.style.getPropertyValue('touch-action'), userSelect: next.style.getPropertyValue('user-select'), cursor: next.style.cursor }
    next.style.setProperty('touch-action', 'none')
    next.style.setProperty('user-select', 'none')
    next.style.cursor = 'grab'
    next.addEventListener('pointerdown', onPointerDown)
    next.addEventListener('lostpointercapture', onPointerEnd)
    draw()
  }

  function detach(): void {
    loop.stop()
    dragging.value = false
    stopListening()
    if (!element)
      return
    element.removeEventListener('pointerdown', onPointerDown)
    element.removeEventListener('lostpointercapture', onPointerEnd)
    if (previous) {
      element.style.setProperty('touch-action', previous.touchAction)
      element.style.setProperty('user-select', previous.userSelect)
      element.style.cursor = previous.cursor
    }
    element.style.transform = ''
    element.style.removeProperty('--tx-glass-lift')
    element = null
    previous = null
  }

  watch(() => resolveElement(toValue(target)), (next) => {
    detach()
    if (next)
      attach(next)
  }, { immediate: true, flush: 'post' })

  // At rest nothing runs the loop, so a new height has to wake it for the lens to take the new shape.
  watch(() => [toValue(options.restHeight), toValue(options.pressGrow)], () => {
    if (element)
      loop.start()
  })

  onBeforeUnmount(detach)

  return {
    dragging,
    position: () => ({ x, y }),
    reset() {
      x = 0
      y = 0
      lastX = 0
      lastY = 0
      loop.start()
    },
  }
}
