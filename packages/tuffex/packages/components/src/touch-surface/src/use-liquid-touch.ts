import type { ComponentPublicInstance, MaybeRefOrGetter, Ref } from 'vue'
import { onBeforeUnmount, shallowRef, toValue, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../utils/frame-loop'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'

type TouchTarget = HTMLElement | ComponentPublicInstance | null | undefined

export interface LiquidTouchOptions {
  disabled?: MaybeRefOrGetter<boolean | undefined>
  /** How far it leans toward the pointer, as a share of half its size, with the pointer at its edge. @default 0.1 */
  lean?: MaybeRefOrGetter<number | undefined>
  /** The most it leans, px. @default 12 */
  maxLean?: MaybeRefOrGetter<number | undefined>
  /** Lift under a hovering mouse or pen, 0 to 1; a press is 1. @default 0.3 */
  hoverLift?: MaybeRefOrGetter<number | undefined>
  /** How much larger a full lift makes it, as a share of its size. @default 0.06 */
  pressGrow?: MaybeRefOrGetter<number | undefined>
  /** Spring that eases the lift, the lean and the stretch. @default 150 */
  stiffness?: MaybeRefOrGetter<number | undefined>
  /** @default 19 */
  damping?: MaybeRefOrGetter<number | undefined>
  /** Stretch along an axis per px/s of pointer speed on it, as a share of the size. @default 0.0001 */
  stretch?: MaybeRefOrGetter<number | undefined>
  /** The most it stretches along one axis, as a share of its size. @default 0.2 */
  maxStretch?: MaybeRefOrGetter<number | undefined>
  /** How far the width swells per unit of speed while the lift changes. @default 0.016 */
  swell?: MaybeRefOrGetter<number | undefined>
}

export interface LiquidTouchState {
  /** A mouse or pen is over it. Never true for a finger, which has no hover. */
  hovered: Readonly<Ref<boolean>>
  /** The primary button or a finger is down on it, wherever the pointer has gone since. */
  pressed: Readonly<Ref<boolean>>
}

interface Axis {
  value: number
  speed: number
  target: number
  /** How near the target counts as there. */
  tolerance: number
}

/** Seconds a frame is taken to last at least, so a burst of pointer events does not divide by zero into a speed spike. */
const MIN_STEP_S = 1 / 240
/** How fast the measured speed follows the pointer's, per second; it smooths the jitter of a mouse. */
const VELOCITY_FOLLOW = 20

function resolveElement(target: TouchTarget): HTMLElement | null {
  if (!target)
    return null
  const el = '$el' in target ? target.$el : target
  return el && typeof (el as HTMLElement).getBoundingClientRect === 'function' ? el as HTMLElement : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The spring's last decimals are noise, and a number like 7e-8 is not worth a style write. */
function tidy(value: number): number {
  return Math.round(value * 10000) / 10000
}

function axis(tolerance: number): Axis {
  return { value: 0, speed: 0, target: 0, tolerance }
}

/**
 * Makes an element answer a touch like a drop of liquid glass: under a hovering mouse or a finger it
 * lifts, leans toward the pointer, stretches along the way the pointer moves and swells, then springs
 * back when the pointer goes. Nothing is dragged and nothing is captured; the element stays where
 * layout puts it, and a finger that starts to scroll the page simply lets go.
 *
 * It drives the `translate` and `scale` properties of the element, so a `transform` of its own is left
 * alone, and the `--tx-glass-lift` custom property, which `TxGlassSurface` reads for its shadows, from a
 * frame loop that sleeps once everything is at rest. The element is deformed by transform alone, so it
 * keeps its layout size (and the refraction map of a lens). Under reduced motion the lift applies
 * without easing and nothing leans or stretches. The numbers may be refs or getters, and are read again
 * on every frame, so they can be tuned live.
 */
export function useLiquidTouch(target: MaybeRefOrGetter<TouchTarget>, options: LiquidTouchOptions = {}): LiquidTouchState {
  const hovered = shallowRef(false)
  const pressed = shallowRef(false)
  const reduced = useReducedMotion()

  const lift = axis(0.001)
  const leanX = axis(0.01)
  const leanY = axis(0.01)
  const stretchX = axis(0.0005)
  const stretchY = axis(0.0005)
  const axes = [lift, leanX, leanY, stretchX, stretchY]

  let pointerX = 0
  let pointerY = 0
  let lastX = 0
  let lastY = 0
  let velocityX = 0
  let velocityY = 0
  // Where the pointer is from the middle of the element, in half its size, held to the element.
  let unitX = 0
  let unitY = 0
  let halfWidth = 0
  let halfHeight = 0

  let element: HTMLElement | null = null
  let pointerId = -1

  function setPointer(event: PointerEvent): void {
    if (!element)
      return
    const rect = element.getBoundingClientRect()
    halfWidth = element.offsetWidth / 2
    halfHeight = element.offsetHeight / 2
    // The rect carries the lean, and the scale about the middle does not move the middle.
    const centerX = rect.left + rect.width / 2 - leanX.value
    const centerY = rect.top + rect.height / 2 - leanY.value
    unitX = halfWidth > 0 ? clamp((event.clientX - centerX) / halfWidth, -1, 1) : 0
    unitY = halfHeight > 0 ? clamp((event.clientY - centerY) / halfHeight, -1, 1) : 0
    pointerX = event.clientX
    pointerY = event.clientY
  }

  /** Starts the pointer's speed from nothing, so arriving from afar is not read as a swipe. */
  function settlePointer(): void {
    lastX = pointerX
    lastY = pointerY
    velocityX = 0
    velocityY = 0
  }

  function aim(): void {
    const engaged = hovered.value || pressed.value
    const hoverLift = clamp(toValue(options.hoverLift) ?? 0.3, 0, 1)
    lift.target = pressed.value ? 1 : hovered.value ? hoverLift : 0

    if (!engaged || reduced.value) {
      leanX.target = 0
      leanY.target = 0
      stretchX.target = 0
      stretchY.target = 0
      return
    }
    const lean = toValue(options.lean) ?? 0.1
    const maxLean = toValue(options.maxLean) ?? 12
    const stretchRate = toValue(options.stretch) ?? 0.0001
    const maxStretch = toValue(options.maxStretch) ?? 0.2
    leanX.target = unitX * Math.min(lean * halfWidth, maxLean)
    leanY.target = unitY * Math.min(lean * halfHeight, maxLean)
    stretchX.target = Math.min(maxStretch, stretchRate * Math.abs(velocityX))
    stretchY.target = Math.min(maxStretch, stretchRate * Math.abs(velocityY))
  }

  function integrate(dt: number): void {
    if (reduced.value) {
      for (const each of axes) {
        each.value = each.target
        each.speed = 0
      }
      return
    }
    const spring = { stiffness: toValue(options.stiffness) ?? 150, damping: toValue(options.damping) ?? 19 }
    for (const each of axes) {
      const [value, speed] = stepSpring(each.value, each.speed, each.target, spring, dt)
      each.value = value
      each.speed = speed
    }
  }

  function draw(): void {
    if (!element)
      return
    const swell = toValue(options.swell) ?? 0.016
    const pressGrow = toValue(options.pressGrow) ?? 0.06
    const grow = 1 + pressGrow * lift.value
    const scaleX = grow * (1 + swell * lift.speed) * (1 + stretchX.value) * (1 - stretchY.value)
    const scaleY = grow * (1 + stretchY.value) * (1 - stretchX.value)
    element.style.setProperty('translate', `${tidy(leanX.value)}px ${tidy(leanY.value)}px`)
    element.style.setProperty('scale', `${tidy(scaleX)} ${tidy(scaleY)}`)
    element.style.setProperty('--tx-glass-lift', String(tidy(lift.value)))
  }

  /** At rest nothing is written at all: the element is the one layout drew, with no layer of its own to keep. */
  function clear(): void {
    if (!element)
      return
    element.style.removeProperty('translate')
    element.style.removeProperty('scale')
    element.style.removeProperty('--tx-glass-lift')
  }

  function settled(): boolean {
    return axes.every(each => Math.abs(each.value - each.target) < each.tolerance && Math.abs(each.speed) < each.tolerance * 10)
      && Math.abs(velocityX) < 1
      && Math.abs(velocityY) < 1
  }

  const loop = createFrameLoop((frame) => {
    const dt = Math.max(frame, MIN_STEP_S)
    const follow = Math.min(1, VELOCITY_FOLLOW * dt)
    if (hovered.value || pressed.value) {
      velocityX += ((pointerX - lastX) / dt - velocityX) * follow
      velocityY += ((pointerY - lastY) / dt - velocityY) * follow
    }
    else {
      velocityX -= velocityX * follow
      velocityY -= velocityY * follow
    }
    lastX = pointerX
    lastY = pointerY

    aim()
    integrate(dt)
    draw()
    if (!settled())
      return true

    // Land exactly on the targets, so the last frame the loop draws is the one that stays.
    for (const each of axes) {
      each.value = each.target
      each.speed = 0
    }
    velocityX = 0
    velocityY = 0
    if (hovered.value || pressed.value)
      draw()
    else
      clear()
    return false
  }, { maxStep: 1 / 30, firstStep: 1 / 60 })

  function engage(event: PointerEvent): void {
    const wasEngaged = hovered.value || pressed.value
    setPointer(event)
    if (!wasEngaged)
      settlePointer()
  }

  function onPointerOver(event: PointerEvent): void {
    if (event.pointerType === 'touch' || toValue(options.disabled))
      return
    // A press is followed from the window, which also hears it once it has left the element.
    if (!pressed.value)
      engage(event)
    hovered.value = true
    loop.start()
  }

  function onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'touch' || !hovered.value)
      return
    hovered.value = false
    loop.start()
  }

  function stopListening(): void {
    // The immediate watcher below also runs while rendering on the server, where there is no window.
    if (typeof window === 'undefined')
      return
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
  }

  function onPointerDown(event: PointerEvent): void {
    if (!element || pressed.value || !event.isPrimary || toValue(options.disabled))
      return
    // On a mouse only the primary button presses, and a control-click is a context menu that eats the release.
    if (event.pointerType === 'mouse' && (event.button !== 0 || event.ctrlKey))
      return

    engage(event)
    pointerId = event.pointerId
    pressed.value = true
    // A finger is held to the element by the browser, but a mouse is not, and neither is a finger the page has taken for a scroll.
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    loop.start()
  }

  function onWindowMove(event: PointerEvent): void {
    if (!pressed.value || event.pointerId !== pointerId)
      return
    // A control-click or a release the page never heard leaves a mouse moving with no button down.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      onPointerEnd(event)
      return
    }
    setPointer(event)
    loop.start()
  }

  function onPointerEnd(event: PointerEvent): void {
    if (!pressed.value || event.pointerId !== pointerId)
      return
    pressed.value = false
    pointerId = -1
    stopListening()
    loop.start()
  }

  function release(): void {
    hovered.value = false
    pressed.value = false
    pointerId = -1
    stopListening()
  }

  function attach(next: HTMLElement): void {
    element = next
    // Entering is hover before the first move, which a mouse that arrives still may not have made.
    next.addEventListener('pointerenter', onPointerOver)
    next.addEventListener('pointermove', onPointerOver)
    next.addEventListener('pointerleave', onPointerLeave)
    next.addEventListener('pointerdown', onPointerDown)
  }

  function detach(): void {
    loop.stop()
    release()
    if (!element)
      return
    element.removeEventListener('pointerenter', onPointerOver)
    element.removeEventListener('pointermove', onPointerOver)
    element.removeEventListener('pointerleave', onPointerLeave)
    element.removeEventListener('pointerdown', onPointerDown)
    clear()
    element = null
    for (const each of axes) {
      each.value = 0
      each.speed = 0
      each.target = 0
    }
    velocityX = 0
    velocityY = 0
  }

  watch(() => resolveElement(toValue(target)), (next) => {
    detach()
    if (next)
      attach(next)
  }, { immediate: true, flush: 'post' })

  // A touch effect turned off lets go of whatever it holds, and the loop eases the element back.
  watch(() => !!toValue(options.disabled), (off) => {
    if (!off || !element)
      return
    release()
    loop.start()
  })

  // At rest nothing runs the loop, so a new number has to wake it for a lifted element to take the new shape.
  watch(() => [toValue(options.pressGrow), toValue(options.hoverLift), toValue(options.lean), toValue(options.maxLean)], () => {
    if (element && (hovered.value || pressed.value))
      loop.start()
  })

  onBeforeUnmount(detach)

  return { hovered, pressed }
}
