import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { MotionAxis, ViewMotion } from '../../../../utils/pan-zoom'
import type { PreviewBounds, PreviewBox, PreviewPoint, PreviewSize, PreviewView } from './zoom'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { drawnScale } from '../../../../utils/drawn-scale'
import { createFrameLoop } from '../../../../utils/frame-loop'
import {
  createVelocityTracker,
  isZoomWheel,
  responseSpring,
  rubberband,
  wheelPixels,
  wheelZoomFactor,
} from '../../../../utils/gesture'
import {
  clampView,
  releaseAxis,
  resistView,
  restingAxis,
  restingView,
  scaleAbout,
  springView,
  stepAxis,
  stepView,
  VIEW_SPRING,
  viewGoal,
  viewNow,
} from '../../../../utils/pan-zoom'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import {
  detailScale,
  fitView,
  isNotchWheel,
  panBounds,
  resistScale,
  zoomPresets,
} from './zoom'

// The preview's hands. A drag pans a zoomed picture 1:1 and resists past its edges, and a flick
// coasts on; at fit, a sideways drag turns the page and a vertical one pulls the picture away to
// close. Two fingers pinch about their midpoint, and a trackpad pinch or ⌘/Ctrl + wheel zooms
// about the pointer. A mouse wheel's notches zoom too, while a trackpad's two-finger scroll pans.
// A click or a double-click on the picture, or a double tap, zooms to the detail about the pointer
// and back, and a touch held still on it asks for the menu. The keys mirror all of it. The physics
// is the maps' roam: the same springs, rubber band and glide.

export type PreviewGesture = 'idle' | 'pan' | 'pinch' | 'swipe' | 'dismiss'

export interface PreviewGestureOptions {
  /** The element the slides fill, which the pointers land on. */
  stage: Ref<HTMLElement | null>
  /** The stage's size, in CSS pixels. */
  size: () => PreviewSize
  /** Where a picture fits: the stage less the room the chrome takes. */
  box: () => PreviewBox
  /** The current picture's natural size; `null` until it has loaded, and when it failed. */
  image: () => PreviewSize | null
  /** The largest zoom, against a picture's own pixels. */
  maxScale: () => number
  /** Whether input moves anything: not while the preview closes. */
  active: () => boolean
  /** Whether there is a picture `step` away. */
  canStep: (step: -1 | 1) => boolean
  /** Shows the picture `step` away, once its slide is halfway in. */
  onStep: (step: -1 | 1) => void
  /**
   * A flick, or a drag let go far enough, asked to close; `velocity` is the picture's (px/s).
   * Returns whether the host takes the picture away itself; otherwise it flies on as thrown.
   */
  onDismiss: (velocity: [number, number]) => boolean | void
  /** Whether a click landed on the picture, which it zooms, rather than on the backdrop. */
  isPicture: (target: EventTarget | null) => boolean
  /** A mouse click on the backdrop. */
  onBackdrop: () => void
  /** A touch or pen tap that did not start a double tap, once the double tap's window has passed. */
  onTap: () => void
  /** A touch or pen held still on the picture; returns whether that opened something, which ends the press. */
  onLongPress?: (point: PreviewPoint) => boolean
  /** How far a page turn overshoots before it settles, 0 to 1. */
  bounce?: () => number
}

export interface PreviewGestures {
  /** The current picture as drawn, framing it as turned; `null` while it has no size. */
  view: ComputedRef<PreviewView | null>
  /** Quarter turns clockwise the current picture is turned by. */
  turns: Ref<number>
  /** That turn as drawn (degrees): it springs from one quarter to the next. */
  angle: Ref<number>
  /** The slides' offset while one is dragged or comes in (px). */
  track: Ref<number>
  /** The current slide's offset while a drag would close the preview (px). */
  dismiss: ShallowRef<PreviewPoint>
  /** How far that drag has gone, 0 to 1: the backdrop and the chrome fade with it. */
  dismissProgress: ComputedRef<number>
  gesture: Ref<PreviewGesture>
  /** Something moves on its own: a glide, a spring or a slide. */
  moving: Ref<boolean>
  zoomed: ComputedRef<boolean>
  /** The view springs back to the whole picture: zoomed as drawn still, but not where it is headed. */
  fitting: Ref<boolean>
  atMinScale: ComputedRef<boolean>
  atMaxScale: ComputedRef<boolean>
  /** The scales the zoom readout's menu offers for the current picture, below its whole. */
  presets: ComputedRef<number[]>
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  onLostPointerCapture: (event: PointerEvent) => void
  onClick: (event: MouseEvent) => void
  /** A wheel zooms about the pointer, or about `about`, in the stage's pixels, when given. */
  onWheel: (event: WheelEvent, about?: PreviewPoint) => void
  /** Safari's trackpad pinch, which arrives as these rather than as a zoom wheel. */
  onGestureStart: (event: Event) => void
  onGestureChange: (event: Event) => void
  onGestureEnd: (event: Event) => void
  /** A key press the preview owns; returns whether it was used. */
  onKey: (event: KeyboardEvent) => boolean
  zoomIn: () => void
  zoomOut: () => void
  /** Springs to scale `k`, about the middle of the fit box, as the zoom buttons do. */
  zoomTo: (k: number) => void
  /** Springs back to the whole picture. */
  resetZoom: () => void
  /** Turns the current picture a quarter clockwise (1) or back (-1), and shows it whole. */
  rotate: (direction: 1 | -1) => void
  /**
   * A zoomed picture moves so `point`, in its own pixels as turned, sits in the middle of the
   * stage, as far as its edges allow: a minimap's press glides there, and its drag (`follow`)
   * follows at once.
   */
  lookAt: (point: PreviewPoint, follow?: boolean) => void
  /** Turns the page, sliding the next picture in. */
  go: (step: -1 | 1) => void
  /** A slide under way goes back rather than turning the page: closing, the picture flying home stays current. */
  keepPage: () => void
  /** Escape: the gesture under way goes back to where it started. Returns whether there was one. */
  cancel: () => boolean
  /** The press under way opened something else, a menu say: it ends here, without a click or a tap. */
  endPress: () => void
  /** The new current picture starts whole: after a page turn. */
  resetView: () => void
  /** Everything at rest: on opening, closing, and an index the host moved. */
  resetAll: () => void
}

/** A slide coming in, and a closing drag going back. */
const SLIDE_SPRING = responseSpring(0.4, 1)
/** A press moving further than this (px) drags instead of clicking. */
const DRAG_SLOP_PX = 4
/** Room between two slides (px). */
export const SLIDE_GAP = 24
/** Two taps this close in time (ms) and space (px) are a double tap. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 24
/** A mouse press this soon (ms) after a click, and as close as a double tap's, is a double-click's second. */
const DOUBLE_CLICK_MS = 500
/** A zoom wheel event under this (px) is a trackpad pinch, which follows on the frame; bigger ones are notches and spring. */
const CONTINUOUS_WHEEL_PX = 50
/** A mouse wheel's notch zooms at least as far as this many pixels would, 1.25 times, whatever its wheel reports. */
const NOTCH_PX = 64
/** Wheel events further apart than this (ms) belong to separate gestures. */
const WHEEL_GAP_MS = 200
/** A trackpad pinch has ended once its wheel events have stopped for this long (ms). */
const WHEEL_SETTLE_MS = 160
/** A sideways two-finger swipe this long (px), at fit, turns the page. */
const WHEEL_STEP_PX = 80
/** A flick faster than this (px/s) the way a slide or a closing drag went carries it through, however short. */
const FLICK_SPEED = 500
/** A closing drag let go past this share of the stage's height closes. */
const DISMISS_SHARE = 0.16
/** A picture thrown off to close leaves at least this fast (px/s). */
const DISMISS_SPEED = 1200
/** One key press pans this share of the stage. */
const KEY_PAN = 0.1
/** A touch held this long (ms) without moving asks for the menu. */
const LONG_PRESS_MS = 480

interface PreviewMotion extends ViewMotion {
  /** Lands on the fit view, which then follows the stage through resizes. */
  toFit: boolean
}

interface Press {
  id: number
  type: string
  x: number
  y: number
  origin: PreviewView | null
  kind: 'press' | 'pan' | 'swipe' | 'dismiss'
}

interface Pinch {
  distance: number
  middle: PreviewPoint
  last: PreviewPoint
  origin: PreviewView
  /** The view as pinched, before its translation resists at the edges. */
  raw: PreviewView
}

interface WheelStream {
  kind: 'zoom' | 'scroll'
  last: number
  swipe: number
  turned: boolean
}

/** Safari's `GestureEvent`, which the DOM typings do not carry. */
interface SafariGestureEvent extends Event {
  scale: number
  clientX: number
  clientY: number
}

function midpoint(a: PreviewPoint, b: PreviewPoint): PreviewPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function usePreviewGestures(options: PreviewGestureOptions): PreviewGestures {
  const reduced = useReducedMotion()

  const turns = ref(0)
  const angle = ref(0)

  /** The current picture's size as turned: a quarter turn swaps its sides. */
  function oriented(): PreviewSize | null {
    const image = options.image()
    if (!image)
      return null
    return Math.abs(turns.value) % 2 === 1 ? { width: image.height, height: image.width } : image
  }

  const fit = computed<PreviewView | null>(() => {
    const image = oriented()
    return image ? fitView(image, options.box()) : null
  })
  /** The view as drawn; `null` follows the fit view, through resizes. */
  const drawn = shallowRef<PreviewView | null>(null)
  const view = computed<PreviewView | null>(() => (fit.value ? drawn.value ?? fit.value : null))
  const minScale = computed(() => fit.value?.k ?? 1)
  const maxScale = computed(() => Math.max(minScale.value, options.maxScale()))
  const zoomed = computed(() => view.value !== null && view.value.k > minScale.value * (1 + 1e-3))
  const atMinScale = computed(() => !zoomed.value)
  const atMaxScale = computed(() => view.value === null || view.value.k >= maxScale.value * (1 - 1e-3))
  const presets = computed(() => zoomPresets(minScale.value, maxScale.value))

  const track = ref(0)
  const dismiss = shallowRef<PreviewPoint>({ x: 0, y: 0 })
  const dismissProgress = computed(() => {
    const height = options.size().height
    return height > 0 ? Math.min(1, Math.abs(dismiss.value.y) / (height * 0.5)) : 0
  })
  const gesture = ref<PreviewGesture>('idle')
  const moving = ref(false)
  const fitting = ref(false)

  function boundsAt(k: number): PreviewBounds {
    const image = oriented()
    return image ? panBounds(k, image, options.box(), options.size()) : { tx: [0, 0], ty: [0, 0] }
  }

  function clampScale(k: number): number {
    return Math.max(minScale.value, Math.min(maxScale.value, k))
  }

  // -- Motion ------------------------------------------------------------------------------

  let viewMotion: PreviewMotion | null = null
  let angleMotion: MotionAxis | null = null
  let trackMotion: MotionAxis | null = null
  /** The page the slide in flight turns once it lands. */
  let trackStep: -1 | 0 | 1 = 0
  let dismissMotion: { x: MotionAxis, y: MotionAxis } | null = null

  // A stage not laid out yet has nothing to move across: everything lands at once.
  function canAnimate(): boolean {
    return !reduced.value && typeof requestAnimationFrame !== 'undefined' && options.size().width > 0
  }

  function syncMoving(): void {
    moving.value = viewMotion !== null || angleMotion !== null || trackMotion !== null || dismissMotion !== null
    fitting.value = viewMotion?.toFit === true
  }

  /** Page turns overshoot by the host's bounce; at none they stop where they land. */
  function slideSpring(): { stiffness: number, damping: number } {
    const bounce = Math.min(0.9, Math.max(0, options.bounce?.() ?? 0))
    return bounce > 0 ? responseSpring(0.4, 1 - bounce) : SLIDE_SPRING
  }

  function land(): void {
    const step = trackStep
    trackMotion = null
    trackStep = 0
    track.value = 0
    if (step !== 0)
      options.onStep(step)
  }

  const loop = createFrameLoop((dt) => {
    const vm = viewMotion
    if (vm) {
      if (stepView(vm, dt)) {
        viewMotion = null
        drawn.value = vm.toFit ? null : viewNow(vm)
      }
      else {
        drawn.value = viewNow(vm)
      }
    }
    const am = angleMotion
    if (am) {
      stepAxis(am, dt, VIEW_SPRING, null, 0.05)
      angle.value = am.value
      if (am.mode === 'rest')
        angleMotion = null
    }
    const tm = trackMotion
    if (tm) {
      const before = tm.value
      const spring = slideSpring()
      stepAxis(tm, dt, spring, null, 0.5)
      // Without a bounce a slide stops where it lands, rather than easing back from past it.
      if (spring === SLIDE_SPRING && tm.mode !== 'rest' && (before - tm.target) * (tm.value - tm.target) < 0)
        tm.mode = 'rest'
      // Halfway in, the incoming picture becomes the current one and the track is measured from
      // it, so the counter and the host's index turn with the page, not after the spring's tail.
      if (tm.mode !== 'rest' && trackStep !== 0 && trackStep * tm.value < -slideWidth() / 2) {
        const step = trackStep
        const shift = step * slideWidth()
        trackStep = 0
        tm.value += shift
        tm.target += shift
        options.onStep(step)
      }
      if (tm.mode === 'rest')
        land()
      else
        track.value = tm.value
    }
    const dm = dismissMotion
    if (dm) {
      stepAxis(dm.x, dt, SLIDE_SPRING, null, 0.5)
      stepAxis(dm.y, dt, SLIDE_SPRING, null, 0.5)
      dismiss.value = { x: dm.x.value, y: dm.y.value }
      if (dm.x.mode === 'rest' && dm.y.mode === 'rest')
        dismissMotion = null
    }
    syncMoving()
    return moving.value
  })

  function run(): void {
    syncMoving()
    loop.start()
  }

  function stopView(): void {
    viewMotion = null
    syncMoving()
  }

  /** Where the view is heading: a key press or a notch builds on the last one. */
  function goal(): PreviewView | null {
    return viewMotion ? viewGoal(viewMotion) : view.value
  }

  /** Springs to `target`, keeping any velocity in flight. */
  function springTo(target: PreviewView, toFit: boolean): void {
    const from = view.value
    if (!from)
      return
    if (!canAnimate()) {
      stopView()
      drawn.value = toFit ? null : target
      return
    }
    const bounds = boundsAt(target.k)
    const next = viewMotion ?? { ...restingView(from, bounds), toFit }
    springView(next, target)
    next.bounds = bounds
    next.toFit = toFit
    viewMotion = next
    run()
  }

  /** Springs to `target` held inside its bounds; one at the fit scale lands on the fit view itself. */
  function aim(target: PreviewView): void {
    const whole = fit.value
    if (!whole)
      return
    if (target.k <= whole.k * (1 + 1e-6))
      springTo(whole, true)
    else
      springTo(clampView(target, boundsAt(target.k)), false)
  }

  function zoomAbout(factor: number, point: PreviewPoint): void {
    const from = goal()
    if (from)
      aim(scaleAbout(from, clampScale(from.k * factor), point))
  }

  function boxCentre(): PreviewPoint {
    const box = options.box()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  function zoomIn(): void {
    zoomAbout(Math.SQRT2, boxCentre())
  }

  function zoomOut(): void {
    zoomAbout(Math.SQRT1_2, boxCentre())
  }

  function zoomTo(k: number): void {
    const from = goal()
    if (from)
      aim(scaleAbout(from, clampScale(k), boxCentre()))
  }

  function resetZoom(): void {
    if (fit.value)
      springTo(fit.value, true)
  }

  function rotate(direction: 1 | -1): void {
    const from = view.value
    const before = oriented()
    if (!options.active() || busy() || !from || !before)
      return
    clearWheelPinch()
    turns.value += direction
    const after = oriented()!
    // Drawn where it was, measured against its frame turned the new way: the centre and the scale
    // stay, and the turn and the fit spring on from there together.
    const cx = from.tx + (from.k * before.width) / 2
    const cy = from.ty + (from.k * before.height) / 2
    drawn.value = { k: from.k, tx: cx - (from.k * after.width) / 2, ty: cy - (from.k * after.height) / 2 }
    const target = turns.value * 90
    viewMotion = null
    if (!canAnimate()) {
      angleMotion = null
      angle.value = target
      drawn.value = null
      syncMoving()
      return
    }
    angleMotion = { mode: 'spring', value: angle.value, velocity: angleMotion?.velocity ?? 0, target }
    springTo(fit.value!, true)
  }

  function lookAt(point: PreviewPoint, follow = false): void {
    const from = goal()
    if (!options.active() || busy() || !from || !zoomed.value)
      return
    const size = options.size()
    const target = { k: from.k, tx: size.width / 2 - point.x * from.k, ty: size.height / 2 - point.y * from.k }
    // A drag still gliding to where its press began is headed on instead, and catches up.
    if (follow && !viewMotion)
      drawn.value = clampView(target, boundsAt(target.k))
    else
      aim(target)
  }

  function toggleZoom(point: PreviewPoint): void {
    const from = goal()
    const whole = fit.value
    if (!from || !whole)
      return
    if (from.k > whole.k * (1 + 1e-3))
      springTo(whole, true)
    else
      aim(scaleAbout(from, clampScale(detailScale(whole.k, maxScale.value)), point))
  }

  /** A pan, a pinch or a trackpad pinch let go: glide on, or spring back inside the limits. */
  function releaseView(velocity: [number, number], anchor: PreviewPoint): void {
    const from = view.value
    if (!from)
      return
    const k = clampScale(from.k)
    if (k !== from.k) {
      aim(scaleAbout(from, k, anchor))
      return
    }
    // Two samples with one timestamp read as 0 / 0; that is no momentum.
    const [vx, vy] = velocity.map(v => (Number.isFinite(v) ? v : 0)) as [number, number]
    const bounds = boundsAt(k)
    // Along an axis held centred, there is nowhere to glide.
    const tx = releaseAxis(from.tx, vx, bounds.tx, bounds.tx[0] < bounds.tx[1])
    const ty = releaseAxis(from.ty, vy, bounds.ty, bounds.ty[0] < bounds.ty[1])
    const toFit = !zoomed.value
    if (tx.mode === 'rest' && ty.mode === 'rest') {
      if (toFit)
        drawn.value = null
      return
    }
    if (!canAnimate()) {
      drawn.value = toFit ? null : clampView(from, bounds)
      return
    }
    viewMotion = { k: restingAxis(k), tx, ty, bounds, toFit }
    run()
  }

  // -- Slides ------------------------------------------------------------------------------

  function slideWidth(): number {
    return options.size().width + SLIDE_GAP
  }

  /** Slides the track to the page `step` away (0: back to the current one), carrying `velocity`. */
  function slide(step: -1 | 0 | 1, velocity = 0): void {
    if (!canAnimate()) {
      trackMotion = null
      trackStep = 0
      track.value = 0
      syncMoving()
      if (step !== 0)
        options.onStep(step)
      return
    }
    trackMotion = { mode: 'spring', value: track.value, velocity, target: -step * slideWidth() }
    trackStep = step
    run()
  }

  function keepPage(): void {
    if (!trackMotion || trackStep === 0)
      return
    trackMotion.target = 0
    trackMotion.mode = 'spring'
    trackStep = 0
  }

  function go(step: -1 | 1): void {
    if (!options.active() || busy())
      return
    if (trackMotion && trackStep === -step) {
      // The other way while a slide comes in: it goes back instead.
      keepPage()
      return
    }
    if (trackMotion && trackStep !== 0) {
      // Land the slide in flight at once and carry its motion into the next one, so pressing
      // twice turns two pages without waiting for the first.
      const landed = trackStep
      const { value, velocity } = trackMotion
      trackMotion = null
      trackStep = 0
      options.onStep(landed)
      track.value = value + landed * slideWidth()
      trackMotion = { mode: 'spring', value: track.value, velocity, target: options.canStep(step) ? -step * slideWidth() : 0 }
      trackStep = options.canStep(step) ? step : 0
      run()
      return
    }
    if (options.canStep(step))
      slide(step, trackMotion?.velocity ?? 0)
  }

  function releaseSwipe(velocity: number): void {
    const offset = track.value
    const step: -1 | 1 = offset < 0 ? 1 : -1
    const flung = Math.abs(velocity) > FLICK_SPEED
    const through = flung ? Math.sign(velocity) === Math.sign(offset) : Math.abs(offset) > slideWidth() / 2
    slide(through && options.canStep(step) ? step : 0, velocity)
  }

  function springDismissBack(velocity: [number, number] = [0, 0]): void {
    const { x, y } = dismiss.value
    if (!canAnimate()) {
      dismissMotion = null
      dismiss.value = { x: 0, y: 0 }
      syncMoving()
      return
    }
    dismissMotion = {
      x: { mode: 'spring', value: x, velocity: velocity[0], target: 0 },
      y: { mode: 'spring', value: y, velocity: velocity[1], target: 0 },
    }
    run()
  }

  function releaseDismiss(velocity: [number, number]): void {
    const { x, y } = dismiss.value
    const [vx, vy] = velocity
    const flung = Math.abs(vy) > FLICK_SPEED && Math.sign(vy) === Math.sign(y)
    if (!flung && Math.abs(y) <= options.size().height * DISMISS_SHARE) {
      springDismissBack(velocity)
      return
    }
    // A host flying the picture home takes it from where it was let go.
    if (options.onDismiss([Number.isFinite(vx) ? vx : 0, Number.isFinite(vy) ? vy : 0]))
      return
    if (canAnimate()) {
      // It carries on the way it was thrown while the preview fades.
      const speed = Math.sign(y || vy || 1) * Math.max(Math.abs(vy), DISMISS_SPEED)
      dismissMotion = {
        x: { mode: 'glide', value: x, velocity: vx, target: x },
        y: { mode: 'glide', value: y, velocity: speed, target: y },
      }
      run()
    }
  }

  // -- Pointers ----------------------------------------------------------------------------

  const touches = new Map<number, PreviewPoint>()
  const tracker = createVelocityTracker()
  let press: Press | null = null
  let pinch: Pinch | null = null
  /** A trackpad pinch in Safari: the view it started from. */
  let gestureOrigin: PreviewView | null = null
  /** The press moved something or stopped it, so it is not a click or a tap. */
  let suppressClick = false
  let pointerType = 'mouse'
  let lastTap: { time: number, x: number, y: number } | null = null
  /** A mouse click that zoomed: a press on it soon after is the double-click's second. */
  let zoomClick: { time: number, x: number, y: number } | null = null
  let tapTimer: ReturnType<typeof setTimeout> | undefined
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let lastPoint: PreviewPoint = { x: 0, y: 0 }

  function clearTap(): void {
    if (tapTimer !== undefined)
      clearTimeout(tapTimer)
    tapTimer = undefined
    lastTap = null
  }

  function clearHold(): void {
    if (holdTimer !== undefined)
      clearTimeout(holdTimer)
    holdTimer = undefined
  }

  /** A touch on the picture that stays put asks for the menu, as a long press on a photo does. */
  function startHold(event: PointerEvent, point: PreviewPoint): void {
    clearHold()
    const onLongPress = options.onLongPress
    if (!onLongPress || event.pointerType === 'mouse' || !options.isPicture(event.target))
      return
    const id = event.pointerId
    holdTimer = setTimeout(() => {
      holdTimer = undefined
      if (!press || press.id !== id || press.kind !== 'press' || touches.size > 1 || !options.active())
        return
      if (onLongPress(point)) {
        press = null
        suppressClick = true
        clearTap()
      }
    }, LONG_PRESS_MS)
  }

  /** A drag, a pinch or a trackpad pinch is under way. */
  function busy(): boolean {
    return pinch !== null || gestureOrigin !== null || (press !== null && press.kind !== 'press')
  }

  function toLocal(event: { clientX: number, clientY: number }): PreviewPoint {
    const el = options.stage.value
    if (!el)
      return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    // The stage scales in as the preview opens: read the point in its own, unscaled pixels.
    const scale = drawnScale(el, rect)
    return { x: (event.clientX - rect.left) / scale.x, y: (event.clientY - rect.top) / scale.y }
  }

  function startPinch(): void {
    const [a, b] = [...touches.values()]
    if (!a || !b)
      return
    // A second finger turns a press, a pan, a swipe or a closing drag into a pinch.
    clearHold()
    if (press?.kind === 'swipe')
      slide(0)
    else if (press?.kind === 'dismiss')
      springDismissBack()
    press = null
    clearTap()
    stopView()
    const origin = view.value
    if (!origin) {
      gesture.value = 'idle'
      return
    }
    suppressClick = true
    gesture.value = 'pinch'
    const middle = midpoint(a, b)
    pinch = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), middle, last: middle, origin, raw: origin }
  }

  function movePinch(): void {
    const [a, b] = [...touches.values()]
    if (!pinch || !a || !b)
      return
    const { origin } = pinch
    const k = resistScale(origin.k * Math.hypot(b.x - a.x, b.y - a.y) / pinch.distance, minScale.value, maxScale.value)
    const middle = midpoint(a, b)
    const ratio = k / origin.k
    // The part of the picture under the first midpoint stays under the fingers.
    const raw = {
      k,
      tx: middle.x - (pinch.middle.x - origin.tx) * ratio,
      ty: middle.y - (pinch.middle.y - origin.ty) * ratio,
    }
    drawn.value = resistView(raw, boundsAt(k), options.size())
    pinch.last = middle
    pinch.raw = raw
  }

  function endPinch(event: PointerEvent): void {
    const anchor = pinch?.last ?? lastPoint
    const raw = pinch?.raw ?? null
    pinch = null
    const remaining = [...touches.entries()][0]
    const current = view.value
    if (remaining && raw && current) {
      // The finger still down pans on from here. It starts from the pinch's own translation, so
      // the part already pulled past an edge resists the same and the picture does not jump.
      press = { id: remaining[0], type: 'touch', x: remaining[1].x, y: remaining[1].y, origin: raw, kind: 'pan' }
      gesture.value = 'pan'
      tracker.reset(event.timeStamp, current.tx, current.ty)
      return
    }
    gesture.value = 'idle'
    releaseView([0, 0], anchor)
  }

  function onPointerDown(event: PointerEvent): void {
    if (!options.active())
      return
    const touch = event.pointerType === 'touch'
    // ⌃-click is the secondary click on macOS: its release goes to the context menu.
    if (!touch && (event.button !== 0 || event.isPrimary === false || event.ctrlKey))
      return
    pointerType = event.pointerType
    const local = toLocal(event)
    lastPoint = local
    if (touch) {
      touches.set(event.pointerId, local)
      if (touches.size > 1) {
        if (touches.size === 2 && !trackMotion && !dismissMotion)
          startPinch()
        return
      }
    }
    // A slide coming in, or a closing drag going back, finishes first; the press only stops a click.
    if (trackMotion || dismissMotion) {
      suppressClick = true
      press = null
      return
    }
    // Grabbing a moving picture stops it where it is drawn, and that press only stops it. A
    // double-click's second press is no grab: the zoom its first click began runs on.
    const second = zoomClick !== null && event.pointerType === 'mouse' && event.timeStamp - zoomClick.time < DOUBLE_CLICK_MS
      && Math.hypot(local.x - zoomClick.x, local.y - zoomClick.y) < DOUBLE_TAP_PX
    zoomClick = null
    suppressClick = second || viewMotion !== null
    if (!second)
      stopView()
    press = { id: event.pointerId, type: event.pointerType, x: local.x, y: local.y, origin: view.value, kind: 'press' }
    startHold(event, local)
  }

  function onPointerMove(event: PointerEvent): void {
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, toLocal(event))
      if (pinch) {
        movePinch()
        return
      }
    }
    if (!press || event.pointerId !== press.id || (press.kind === 'press' && (trackMotion || dismissMotion)))
      return
    // A mouse let go where the page never heard of it says nothing: moving on without the
    // button is hover, so the press ends here.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      onPointerUp(event)
      return
    }
    const local = toLocal(event)
    lastPoint = local
    const dx = local.x - press.x
    const dy = local.y - press.y
    if (press.kind === 'press') {
      if (Math.hypot(dx, dy) < DRAG_SLOP_PX)
        return
      // A double-click's second press left its zoom running: dragged on, it stops the picture
      // where it is drawn and follows from there.
      if (viewMotion) {
        stopView()
        const now = view.value
        press.origin = now && { k: now.k, tx: now.tx - dx, ty: now.ty - dy }
      }
      press.kind = zoomed.value && press.origin ? 'pan' : Math.abs(dx) >= Math.abs(dy) ? 'swipe' : 'dismiss'
      gesture.value = press.kind
      suppressClick = true
      clearTap()
      clearHold()
      // Captured only now: a press that never moves keeps its click. jsdom has no pointer capture.
      options.stage.value?.setPointerCapture?.(event.pointerId)
      if (press.kind === 'pan' && press.origin)
        tracker.reset(event.timeStamp, press.origin.tx, press.origin.ty)
      else
        tracker.reset(event.timeStamp, 0, 0)
    }
    // Each follows 1:1 from the press, so the slop is not lost.
    if (press.kind === 'pan' && press.origin) {
      const { origin } = press
      const shown = resistView({ k: origin.k, tx: origin.tx + dx, ty: origin.ty + dy }, boundsAt(origin.k), options.size())
      drawn.value = shown
      tracker.push(event.timeStamp, shown.tx, shown.ty)
    }
    else if (press.kind === 'swipe') {
      // Past the first or the last picture the slides resist, as a scroll view does at its end.
      track.value = options.canStep(dx < 0 ? 1 : -1) ? dx : rubberband(dx, options.size().width)
      tracker.push(event.timeStamp, track.value, 0)
    }
    else if (press.kind === 'dismiss') {
      dismiss.value = { x: dx, y: dy }
      tracker.push(event.timeStamp, dx, dy)
    }
  }

  function tap(event: PointerEvent): void {
    // A mouse's clicks go through onClick, one at a time.
    if (event.pointerType === 'mouse')
      return
    const point = toLocal(event)
    const previous = lastTap
    if (previous && event.timeStamp - previous.time < DOUBLE_TAP_MS && Math.hypot(point.x - previous.x, point.y - previous.y) < DOUBLE_TAP_PX) {
      clearTap()
      toggleZoom(point)
      return
    }
    clearTap()
    lastTap = { time: event.timeStamp, x: point.x, y: point.y }
    // A single tap waits out the double tap it might begin.
    tapTimer = setTimeout(() => {
      tapTimer = undefined
      lastTap = null
      options.onTap()
    }, DOUBLE_TAP_MS)
  }

  function onPointerUp(event: PointerEvent): void {
    if (press?.id === event.pointerId)
      clearHold()
    if (touches.delete(event.pointerId) && pinch) {
      endPinch(event)
      return
    }
    if (!press || event.pointerId !== press.id)
      return
    const { kind } = press
    press = null
    if (kind === 'press') {
      if (!suppressClick)
        tap(event)
      return
    }
    gesture.value = 'idle'
    const velocity = tracker.velocity(event.timeStamp)
    if (kind === 'pan')
      releaseView(velocity, lastPoint)
    else if (kind === 'swipe')
      releaseSwipe(velocity[0])
    else
      releaseDismiss(velocity)
  }

  function cancel(): boolean {
    clearHold()
    if (!busy())
      return false
    const kind = pinch ? 'pinch' : gestureOrigin ? 'gesture' : press?.kind
    const origin = pinch?.origin ?? gestureOrigin ?? press?.origin ?? null
    const stage = options.stage.value
    if (press && stage?.hasPointerCapture?.(press.id))
      stage.releasePointerCapture(press.id)
    press = null
    pinch = null
    gestureOrigin = null
    touches.clear()
    gesture.value = 'idle'
    if (kind === 'swipe')
      slide(0)
    else if (kind === 'dismiss')
      springDismissBack()
    else if (origin)
      aim(origin)
    return true
  }

  function endPress(): void {
    clearHold()
    if (press?.kind !== 'press')
      return
    press = null
    suppressClick = true
    clearTap()
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pinch || press?.id === event.pointerId)
      cancel()
    touches.delete(event.pointerId)
  }

  function onLostPointerCapture(event: PointerEvent): void {
    // Normally the pointerup has already ended the drag. Capture lost without one (the element
    // left the page, say) ends it where it is drawn. The event bubbles, and a touch captured by
    // the picture under it hands that capture over on its first move: only the stage's counts.
    if (event.target !== options.stage.value || !press || press.kind === 'press' || event.pointerId !== press.id)
      return
    const { kind } = press
    press = null
    gesture.value = 'idle'
    if (kind === 'pan')
      releaseView([0, 0], lastPoint)
    else if (kind === 'swipe')
      releaseSwipe(0)
    else
      springDismissBack()
  }

  function onClick(event: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false
      return
    }
    // A touch or a pen's taps are told apart in `tap`, which waits for a second one.
    if (pointerType !== 'mouse' || !options.active())
      return
    if (!options.isPicture(event.target)) {
      options.onBackdrop()
      return
    }
    // A double-click zooms once, about the pointer: its second click would take the first back.
    if (event.detail > 1)
      return
    const point = toLocal(event)
    zoomClick = { time: event.timeStamp, x: point.x, y: point.y }
    toggleZoom(point)
  }

  // -- Wheels ------------------------------------------------------------------------------

  let stream: WheelStream | null = null
  /** A trackpad pinch's view before resistance, which its small steps build on. */
  let wheelPinch: PreviewView | null = null
  let wheelPinchTimer: ReturnType<typeof setTimeout> | undefined

  function clearWheelPinch(): void {
    if (wheelPinchTimer !== undefined)
      clearTimeout(wheelPinchTimer)
    wheelPinchTimer = undefined
    wheelPinch = null
  }

  function followWheelPinch(factor: number, point: PreviewPoint): void {
    const base = wheelPinch ?? view.value
    if (!base)
      return
    stopView()
    const raw = scaleAbout(base, base.k * factor, point)
    wheelPinch = raw
    const k = resistScale(raw.k, minScale.value, maxScale.value)
    drawn.value = resistView(scaleAbout(raw, k, point), boundsAt(k), options.size())
    if (wheelPinchTimer !== undefined)
      clearTimeout(wheelPinchTimer)
    // No event says a pinch ended; its stream going quiet does.
    wheelPinchTimer = setTimeout(() => {
      wheelPinchTimer = undefined
      wheelPinch = null
      releaseView([0, 0], point)
    }, WHEEL_SETTLE_MS)
  }

  function notch(delta: number, point: PreviewPoint): void {
    if (delta === 0)
      return
    clearWheelPinch()
    zoomAbout(wheelZoomFactor(Math.sign(delta) * Math.max(Math.abs(delta), NOTCH_PX)), point)
  }

  /**
   * Pans a zoom still on its way by `delta`, as far as where it lands allows. The picture moves
   * with the pan now, and the zoom carries on to its scale.
   */
  function panMotion(vm: PreviewMotion, delta: { x: number, y: number }): void {
    const shift = (a: MotionAxis, d: number, [lo, hi]: [number, number]): void => {
      const target = Math.max(lo, Math.min(hi, a.target - d))
      a.value += target - a.target
      a.target = target
    }
    shift(vm.tx, delta.x, vm.bounds.tx)
    shift(vm.ty, delta.y, vm.bounds.ty)
    drawn.value = viewNow(vm)
  }

  function scroll(delta: { x: number, y: number }, current: WheelStream): void {
    // Stopping a zoom mid-way to pan would leave the picture at whatever scale it had reached.
    if (viewMotion?.k.mode === 'spring') {
      panMotion(viewMotion, delta)
      return
    }
    const shown = view.value
    if (zoomed.value && shown) {
      stopView()
      drawn.value = clampView({ k: shown.k, tx: shown.tx - delta.x, ty: shown.ty - delta.y }, boundsAt(shown.k))
      return
    }
    // At fit, a sideways swipe turns the page: once, however long its momentum runs on.
    if (current.turned || Math.abs(delta.x) <= Math.abs(delta.y))
      return
    current.swipe += delta.x
    if (Math.abs(current.swipe) < WHEEL_STEP_PX)
      return
    current.turned = true
    go(current.swipe > 0 ? 1 : -1)
  }

  function onWheel(event: WheelEvent, about?: PreviewPoint): void {
    // Nothing behind the preview scrolls or zooms while it is open.
    event.preventDefault()
    if (!options.active() || busy())
      return
    const delta = wheelPixels(event, options.size().height || 800)
    const point = about ?? toLocal(event)
    if (isZoomWheel(event)) {
      if (event.deltaMode === 0 && Math.abs(delta.y) < CONTINUOUS_WHEEL_PX)
        followWheelPinch(wheelZoomFactor(delta.y), point)
      else
        notch(delta.y, point)
      return
    }
    if (!stream || event.timeStamp - stream.last > WHEEL_GAP_MS)
      stream = { kind: isNotchWheel(event) ? 'zoom' : 'scroll', last: event.timeStamp, swipe: 0, turned: false }
    stream.last = event.timeStamp
    if (stream.kind === 'zoom')
      notch(delta.y, point)
    else
      scroll(delta, stream)
  }

  function onGestureStart(event: Event): void {
    event.preventDefault()
    // iOS reports a touch pinch here too; that one is the pointer handlers'.
    if (touches.size > 0 || !options.active() || busy())
      return
    clearWheelPinch()
    stopView()
    gestureOrigin = view.value
  }

  function onGestureChange(event: Event): void {
    event.preventDefault()
    const origin = gestureOrigin
    if (!origin)
      return
    const gestureEvent = event as SafariGestureEvent
    const point = toLocal(gestureEvent)
    lastPoint = point
    const k = resistScale(origin.k * gestureEvent.scale, minScale.value, maxScale.value)
    drawn.value = resistView(scaleAbout(origin, k, point), boundsAt(k), options.size())
  }

  function onGestureEnd(event: Event): void {
    event.preventDefault()
    if (!gestureOrigin)
      return
    gestureOrigin = null
    releaseView([0, 0], lastPoint)
  }

  // -- Keys --------------------------------------------------------------------------------

  function onKey(event: KeyboardEvent): boolean {
    // Leave ⌘/Ctrl + plus and minus to the browser's own zoom.
    if (!options.active() || event.ctrlKey || event.metaKey || event.altKey || busy())
      return false
    switch (event.key) {
      case '+':
      case '=':
        zoomIn()
        return true
      case '-':
      case '_':
        zoomOut()
        return true
      case '0':
        resetZoom()
        return true
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        // Shift + arrow extends a selection elsewhere; here it is left alone rather than paging.
        if (event.shiftKey)
          return false
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 1 : -1
        const from = goal()
        const size = options.size()
        // Zoomed, the arrows pan; whole, ← and → turn the page.
        if (zoomed.value && from)
          aim(horizontal ? { ...from, tx: from.tx + sign * size.width * KEY_PAN } : { ...from, ty: from.ty + sign * size.height * KEY_PAN })
        else if (horizontal)
          go(sign > 0 ? -1 : 1)
        return true
      }
      default:
        return false
    }
  }

  // -- Resets ------------------------------------------------------------------------------

  function resetView(): void {
    clearWheelPinch()
    viewMotion = null
    drawn.value = null
    angleMotion = null
    turns.value = 0
    angle.value = 0
    syncMoving()
  }

  function resetAll(): void {
    resetView()
    trackMotion = null
    trackStep = 0
    track.value = 0
    dismissMotion = null
    dismiss.value = { x: 0, y: 0 }
    press = null
    pinch = null
    gestureOrigin = null
    touches.clear()
    stream = null
    clearTap()
    clearHold()
    suppressClick = false
    gesture.value = 'idle'
    syncMoving()
    loop.stop()
  }

  // A zoomed view keeps what was in the middle of the old box in the middle of the new one, and
  // one pushed past the new limits comes back inside. A whole picture follows the fit by itself.
  watch(
    () => {
      const box = options.box()
      return [box.x + box.width / 2, box.y + box.height / 2, options.size().width, options.size().height] as const
    },
    ([cx, cy, width, height], [oldCx, oldCy, oldWidth, oldHeight]) => {
      const shown = drawn.value
      if (!shown || viewMotion || busy() || (cx === oldCx && cy === oldCy && width === oldWidth && height === oldHeight))
        return
      const moved = { k: shown.k, tx: shown.tx + cx - oldCx, ty: shown.ty + cy - oldCy }
      const k = clampScale(shown.k)
      const next = scaleAbout(moved, k, { x: cx, y: cy })
      drawn.value = k <= minScale.value * (1 + 1e-6) ? null : clampView(next, boundsAt(k))
    },
  )

  onBeforeUnmount(() => {
    loop.stop()
    clearWheelPinch()
    clearTap()
    clearHold()
  })

  return {
    view,
    turns,
    angle,
    track,
    dismiss,
    dismissProgress,
    gesture,
    moving,
    zoomed,
    fitting,
    atMinScale,
    atMaxScale,
    presets,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onClick,
    onWheel,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    onKey,
    zoomIn,
    zoomOut,
    zoomTo,
    resetZoom,
    rotate,
    lookAt,
    go,
    keepPage,
    cancel,
    endPress,
    resetView,
    resetAll,
  }
}
