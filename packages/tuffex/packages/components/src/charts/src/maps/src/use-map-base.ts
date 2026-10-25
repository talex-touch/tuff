import type { GeoProjection } from 'd3-geo'
import type { ComputedRef, Ref } from 'vue'
import type { ViewMotion } from '../../../../../../utils/pan-zoom'
import type { RoamBounds, RoamBox, RoamState } from './roam'
import type { MapBaseProps, MapLabels } from './types'
import { geoPath } from 'd3-geo'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useId, watch } from 'vue'
import { drawnScale } from '../../../../../../utils/drawn-scale'
import { createFrameLoop } from '../../../../../../utils/frame-loop'
import {
  createVelocityTracker,
  isZoomWheel,
  wheelPixels,
  wheelZoomFactor,
} from '../../../../../../utils/gesture'
import {
  releaseAxis,
  restingAxis,
  restingView,
  springView,
  stepView,
  viewGoal,
  viewNow,
} from '../../../../../../utils/pan-zoom'
import { useReducedMotion } from '../../../../../../utils/use-reduced-motion'
import { easings, STATE_DURATION, tween } from '../../core/animate'
import { placeTooltip } from '../../tooltip'
import {
  boundingWindowFeature,
  DEFAULT_BOUNDING_COORDS,
  fitProjectionToWindow,
  MAX_ZOOM_FACTOR,
  projectedAspect,
  resolveProjection,
} from './projection'
import {
  clampRoam,
  clampScale,
  initialRoam,
  panBy,
  resistRoam,
  roamBounds,
  scaleAboutPoint,
} from './roam'
import { MAP_DEFAULT_LABELS } from './types'

export interface MapBase {
  container: Ref<HTMLElement | null>
  width: ComputedRef<number>
  height: ComputedRef<number>
  rootStyle: ComputedRef<{ height?: string, aspectRatio?: string }>
  ready: ComputedRef<boolean>
  /** Projection fitted to the display window (pre-roam). */
  projection: ComputedRef<GeoProjection | null>
  /** Single path for the whole land base. */
  landPath: ComputedRef<string>
  /** Path for one feature (choropleth fills regions individually). */
  featurePath: (feature: unknown) => string
  project: (lng: number, lat: number) => [number, number] | null
  /** `transform` attribute for the roamed <g>. */
  transform: ComputedRef<string>
  /** Divide radii/strokes by this so they stay constant-size under zoom. */
  scaleFactor: ComputedRef<number>
  pointer: { x: number, y: number }
  tooltipStyle: (el: HTMLElement | null) => Record<string, string>
  /** A pan or pinch is moving the map (the pointer has travelled past the slop). */
  dragging: Ref<boolean>
  labels: ComputedRef<MapLabels>
  /** `id` of the visually hidden instructions element. */
  instructionsId: string | undefined
  /** Focus, role and name for the root while the map roams. */
  rootAttrs: ComputedRef<Record<string, string | number>>
  onWheel: (event: WheelEvent) => void
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  onLostPointerCapture: (event: PointerEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
  onDblClick: (event: MouseEvent) => void
  /** Bind with `.capture`: swallows the click a pan ends in. */
  onClickCapture: (event: MouseEvent) => void
}

export interface MapBaseOptions {
  /**
   * Rows (in pixels) the caller reserves *inside* the container for content it
   * renders below the map — the choropleth's colour legend. The plot height
   * shrinks by this much, so the projection can never draw land under that
   * content; without it an absolutely positioned legend overlaps the map.
   */
  heightInset?: () => number
  /** A pan or pinch took over the pointer: drop hover state and the tooltip. */
  onDragStart?: () => void
}

/**
 * Emphasis state shared by both map series.
 *
 * kumo's maps inherit ECharts' `emphasis`/`blur` behaviour: exactly one hovered
 * element carries the emphasis style while the rest blur, and the switch is
 * driven by ECharts' `stateAnimation` (300ms, `cubicOut`). `progress` is the
 * blend from base (0) to emphasised (1) so callers interpolate whatever style
 * values their series emphasises.
 *
 * `duration` defaults to that 300ms. Pass 0 where the emphasis only dims or
 * recolours: TuffEx switches those on the frame the pointer arrives and keeps
 * easing for geometry alone.
 */
export interface MapEmphasis<K> {
  /** Key of the element carrying emphasis; retained while it fades out. */
  activeKey: Ref<K | null>
  /** Emphasis blend of `activeKey`, 0 → 1 (ECharts `stateAnimation`). */
  progress: Ref<number>
  /** Emphasise `key` (ECharts `emphasis`). */
  enter: (key: K) => void
  /** Release emphasis, fading back out (ECharts `blur`). */
  leave: () => void
}

export function useMapEmphasis<K>(duration: number = STATE_DURATION): MapEmphasis<K> {
  const activeKey = shallowRef<K | null>(null)
  const progress = ref(0)
  let cancel: (() => void) | null = null

  function animateTo(target: number, onDone?: () => void): void {
    cancel?.()
    cancel = null
    const from = progress.value
    if (from === target) {
      onDone?.()
      return
    }
    cancel = tween({
      // ECharts `stateAnimation`: { duration: 300, easing: 'cubicOut' }.
      duration,
      easing: easings.cubicOut,
      onUpdate: (value) => {
        progress.value = from + (target - from) * value
      },
      onComplete: () => {
        // ECharts assigns the target props outright; easing(1) alone can land
        // a float epsilon away (e.g. 0.44999999999999996).
        progress.value = target
        onDone?.()
      },
    })
  }

  function enter(key: K): void {
    if (activeKey.value !== key) {
      // A different element takes over: restart its emphasis from the base
      // style rather than inheriting the outgoing element's blend.
      cancel?.()
      cancel = null
      activeKey.value = key
      progress.value = 0
    }
    animateTo(1)
  }

  function leave(): void {
    animateTo(0, () => {
      activeKey.value = null
    })
  }

  onBeforeUnmount(() => cancel?.())

  return { activeKey, progress, enter, leave }
}

export function useMapBase(props: MapBaseProps, options: MapBaseOptions = {}): MapBase {
  const container = ref<HTMLElement | null>(null)
  const measuredWidth = ref(0)
  const measuredHeight = ref(0)

  /** Rows the caller keeps for itself below the plot (legend band). */
  function reservedRows(): number {
    return Math.max(0, options.heightInset?.() ?? 0)
  }

  let observer: ResizeObserver | null = null
  onMounted(() => {
    if (!container.value)
      return
    measuredWidth.value = container.value.clientWidth
    measuredHeight.value = container.value.clientHeight
    observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect)
        return
      measuredWidth.value = rect.width
      measuredHeight.value = rect.height
    })
    observer.observe(container.value)
  })
  onBeforeUnmount(() => observer?.disconnect())

  const width = computed(() => props.width ?? measuredWidth.value)

  const aspect = computed(() => {
    if (props.aspectRatio !== undefined)
      return String(props.aspectRatio)
    return String(projectedAspect(resolveProjection(props.projection), DEFAULT_BOUNDING_COORDS))
  })

  const height = computed(() => {
    // `rootStyle` keeps the caller's full box; the plot is what is left after
    // the rows the caller reserves, so the fitted projection matches the SVG's
    // own box exactly instead of being letterboxed into a shorter one.
    const inset = reservedRows()
    if (props.height !== undefined)
      return Math.max(0, props.height - inset)
    // Aspect-driven: prefer measured height, else derive from width.
    if (measuredHeight.value > 0)
      return Math.max(0, measuredHeight.value - inset)
    const ratio = Number(aspect.value)
    return Number.isFinite(ratio) && ratio > 0 ? width.value / ratio : 0
  })

  const rootStyle = computed<{ height?: string, aspectRatio?: string }>(() =>
    props.height !== undefined
      ? { height: `${props.height}px` }
      : { aspectRatio: aspect.value },
  )

  const ready = computed(() => width.value > 0 && height.value > 0)

  const projection = computed<GeoProjection | null>(() => {
    if (!ready.value)
      return null
    // fitExtent mutates the instance — idempotent for a given size, and the
    // reason the `projection` prop asks for a stable reference.
    return fitProjectionToWindow(
      resolveProjection(props.projection),
      width.value,
      height.value,
    )
  })

  const pathGenerator = computed(() => {
    const fitted = projection.value
    return fitted ? geoPath(fitted) : null
  })

  const landPath = computed(() => {
    const generator = pathGenerator.value
    if (!generator)
      return ''
    return generator(props.geoJson as never) ?? ''
  })

  function featurePath(feature: unknown): string {
    return pathGenerator.value?.(feature as never) ?? ''
  }

  function project(lng: number, lat: number): [number, number] | null {
    return projection.value?.([lng, lat]) ?? null
  }

  // ── Roam ──────────────────────────────────────────────────────────────────
  // Drag pans 1:1 from the press and resists past the map's edge; a flick
  // coasts to a stop and a spring brings an overshoot back inside. ⌘/Ctrl +
  // wheel and pinches zoom around the pointer; a plain wheel is the page's.
  // Double-click and 0 spring back to the fitted view; the keys pan and zoom.

  const reduced = useReducedMotion()
  const zoom = computed(() => props.zoom ?? 1.25)

  /** The view `zoom` and `center` ask for. */
  const home = computed<RoamState>(() => {
    const projectedCenter = props.center
      ? project(props.center[0], props.center[1]) ?? undefined
      : undefined
    return initialRoam(zoom.value, width.value, height.value, projectedCenter)
  })

  /** The view as drawn; `null` follows `home`, through resizes. */
  const drawn = shallowRef<RoamState | null>(null)
  const roamState = computed(() => drawn.value ?? home.value)

  const transform = computed(() => {
    const { k, tx, ty } = roamState.value
    return `translate(${tx}, ${ty}) scale(${k})`
  })

  const scaleFactor = computed(() => roamState.value.k)

  /** The displayed window as fitted: what a pan keeps in view. */
  const box = computed<RoamBox>(() => {
    const fitted = projection.value
    if (!fitted)
      return { x0: 0, y0: 0, x1: width.value, y1: height.value }
    const [[x0, y0], [x1, y1]] = geoPath(fitted).bounds(
      boundingWindowFeature(DEFAULT_BOUNDING_COORDS) as never,
    )
    return { x0, y0, x1, y1 }
  })

  function boundsAt(k: number): RoamBounds {
    return roamBounds(k, box.value, width.value, height.value, home.value)
  }

  function zoomAbout(state: RoamState, factor: number, point: { x: number, y: number }): RoamState {
    return scaleAboutPoint(state, clampScale(state.k * factor, zoom.value, MAX_ZOOM_FACTOR), point)
  }

  // ── Motion ──

  interface Motion extends ViewMotion { home: boolean }

  let motion: Motion | null = null
  const loop = createFrameLoop((dt) => {
    const m = motion
    if (!m)
      return false
    if (stepView(m, dt)) {
      motion = null
      drawn.value = m.home ? null : viewNow(m)
      return false
    }
    drawn.value = viewNow(m)
    return true
  })

  function canAnimate(): boolean {
    return !reduced.value && typeof requestAnimationFrame !== 'undefined'
  }

  function stopMotion(): void {
    loop.stop()
    motion = null
  }

  function run(next: Motion): void {
    motion = next
    loop.start()
  }

  /** Where the view is heading: a key press or notch builds on the last one. */
  function goal(): RoamState {
    return motion ? viewGoal(motion) : roamState.value
  }

  /** Springs to `target`, keeping any velocity in flight. `toHome` follows `home` once there. */
  function springTo(target: RoamState, toHome = false): void {
    if (!canAnimate()) {
      stopMotion()
      drawn.value = toHome ? null : target
      return
    }
    const from = roamState.value
    const next = motion ?? { ...restingView(from, boundsAt(from.k)), home: false }
    springView(next, target)
    next.home = toHome
    run(next)
  }

  function reset(): void {
    springTo(home.value, true)
  }

  /** A pan let go with `velocity` (px/s): glide on, or spring back inside. */
  function release(velocity: [number, number]): void {
    // Two samples with one timestamp read as 0 / 0; that is no momentum.
    const [vx, vy] = velocity.map(v => (Number.isFinite(v) ? v : 0))
    const from = roamState.value
    const bounds = boundsAt(from.k)
    const tx = releaseAxis(from.tx, vx ?? 0, bounds.tx)
    const ty = releaseAxis(from.ty, vy ?? 0, bounds.ty)
    if (tx.mode === 'rest' && ty.mode === 'rest')
      return
    if (!canAnimate()) {
      // No glide; a map pulled past its edge goes straight back inside.
      drawn.value = clampRoam(from, bounds)
      return
    }
    run({ k: restingAxis(from.k), tx, ty, bounds, home: false })
  }

  // ── Pointer gestures ──

  /** A press moving further than this (px) pans instead of clicking. */
  const DRAG_SLOP_PX = 4

  interface Drag { id: number, x: number, y: number, origin: RoamState, active: boolean }
  interface Pinch { distance: number, middle: { x: number, y: number }, origin: RoamState }

  const pointer = reactive({ x: 0, y: 0 })
  const dragging = ref(false)
  const touches = new Map<number, { x: number, y: number }>()
  const tracker = createVelocityTracker()
  let drag: Drag | null = null
  let pinch: Pinch | null = null
  /** The pointer sequence moved the map, so its click is not a click. */
  let suppressClick = false

  function toLocal(event: { clientX: number, clientY: number }): { x: number, y: number } {
    const el = container.value
    if (!el)
      return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    // Under a scaling transform or CSS zoom the map is drawn at another size than it is laid
    // out: read the point in its own, unscaled pixels.
    const scale = drawnScale(el, rect)
    return { x: (event.clientX - rect.left) / scale.x, y: (event.clientY - rect.top) / scale.y }
  }

  function beginGesture(): void {
    dragging.value = true
    suppressClick = true
    options.onDragStart?.()
  }

  function startPinch(): void {
    const [a, b] = [...touches.values()]
    if (!a || !b)
      return
    // A second finger turns a pan, or a press still deciding, into a pinch.
    if (!dragging.value)
      beginGesture()
    drag = null
    stopMotion()
    pinch = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      origin: roamState.value,
    }
  }

  function movePinch(): void {
    const [a, b] = [...touches.values()]
    if (!pinch || !a || !b)
      return
    const { origin } = pinch
    const k = clampScale(
      origin.k * Math.hypot(b.x - a.x, b.y - a.y) / pinch.distance,
      zoom.value,
      MAX_ZOOM_FACTOR,
    )
    // The map point under the first midpoint stays under the fingers.
    const ratio = k / origin.k
    const raw: RoamState = {
      k,
      tx: (a.x + b.x) / 2 - (pinch.middle.x - origin.tx) * ratio,
      ty: (a.y + b.y) / 2 - (pinch.middle.y - origin.ty) * ratio,
    }
    drawn.value = resistRoam(raw, boundsAt(k), width.value, height.value)
  }

  function onPointerDown(event: PointerEvent): void {
    if (!props.roam)
      return
    const touch = event.pointerType === 'touch'
    // ⌃-click is the secondary click on macOS: its release goes to the context menu, not to the map.
    if (!touch && (event.button !== 0 || event.isPrimary === false || event.ctrlKey))
      return
    const local = toLocal(event)
    if (touch) {
      touches.set(event.pointerId, local)
      if (touches.size === 2)
        startPinch()
      if (touches.size > 1)
        return
    }
    // Grabbing a moving map stops it where it is drawn, and that press only stops it.
    suppressClick = motion !== null
    stopMotion()
    const origin = roamState.value
    drag = { id: event.pointerId, x: local.x, y: local.y, origin, active: false }
    tracker.reset(event.timeStamp, origin.tx, origin.ty)
  }

  function onPointerMove(event: PointerEvent): void {
    const local = toLocal(event)
    pointer.x = local.x
    pointer.y = local.y
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, local)
      if (pinch) {
        movePinch()
        return
      }
    }
    if (!drag || event.pointerId !== drag.id)
      return
    // A mouse let go where the page never heard of it (a menu, outside the window) says nothing:
    // moving on without the button is hover, so the press ends here.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      onPointerUp(event)
      return
    }
    const dx = local.x - drag.x
    const dy = local.y - drag.y
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_SLOP_PX)
        return
      drag.active = true
      beginGesture()
      // Captured only now: a press that never moves keeps its click on the
      // region or bubble under it. jsdom has no pointer-capture API.
      container.value?.setPointerCapture?.(event.pointerId)
    }
    // 1:1 from the press, so the slop is not lost.
    const raw = panBy(drag.origin, dx, dy)
    const shown = resistRoam(raw, boundsAt(raw.k), width.value, height.value)
    drawn.value = shown
    tracker.push(event.timeStamp, shown.tx, shown.ty)
  }

  function endPinch(event: PointerEvent): void {
    pinch = null
    const remaining = [...touches.entries()][0]
    if (remaining) {
      // The finger still down carries on panning from here.
      const origin = roamState.value
      drag = { id: remaining[0], x: remaining[1].x, y: remaining[1].y, origin, active: true }
      tracker.reset(event.timeStamp, origin.tx, origin.ty)
      return
    }
    dragging.value = false
    release([0, 0])
  }

  function onPointerUp(event: PointerEvent): void {
    if (touches.delete(event.pointerId) && pinch) {
      endPinch(event)
      return
    }
    if (!drag || event.pointerId !== drag.id)
      return
    const { active } = drag
    drag = null
    if (!active)
      return
    dragging.value = false
    release(tracker.velocity(event.timeStamp))
  }

  /** Escape or a cancelled pointer: the map goes back to where the gesture took it from. */
  function cancelGesture(pointerId?: number): void {
    const origin = pinch?.origin ?? (drag?.active ? drag.origin : null)
    if (pointerId !== undefined && drag?.active)
      container.value?.releasePointerCapture?.(pointerId)
    drag = null
    pinch = null
    touches.clear()
    dragging.value = false
    if (origin)
      springTo(origin)
  }

  function onPointerCancel(event: PointerEvent): void {
    if (pinch || drag?.id === event.pointerId)
      cancelGesture()
    touches.delete(event.pointerId)
  }

  function onLostPointerCapture(event: PointerEvent): void {
    // Normally the pointerup already ended the pan. Capture lost without one
    // (the element left the page, say) ends it where it is drawn. The event
    // bubbles, and a touch that the region under it captured implicitly hands
    // that capture to the map on the first move: only the map's own counts.
    if (event.target !== container.value || !drag?.active || event.pointerId !== drag.id)
      return
    drag = null
    dragging.value = false
    release([0, 0])
  }

  function onClickCapture(event: MouseEvent): void {
    if (!props.roam || !suppressClick)
      return
    // A pan never lands as a click on the region or bubble it started on.
    event.stopPropagation()
    event.preventDefault()
  }

  function onDblClick(event: MouseEvent): void {
    if (!props.roam || suppressClick)
      return
    event.preventDefault()
    reset()
  }

  // ── Wheel and keys ──

  /** A wheel event under this (px) is a trackpad stream, which follows on the frame; bigger ones are notches and spring. */
  const CONTINUOUS_WHEEL_PX = 50
  /** One key press pans this share of the map's size. */
  const KEY_PAN = 0.1

  function onWheel(event: WheelEvent): void {
    // A plain wheel belongs to the page: the map never traps scrolling.
    if (!props.roam || !isZoomWheel(event))
      return
    event.preventDefault()
    if (drag?.active || pinch)
      return
    const delta = wheelPixels(event, height.value || 800).y
    const point = toLocal(event)
    if (Math.abs(delta) < CONTINUOUS_WHEEL_PX) {
      stopMotion()
      const next = zoomAbout(roamState.value, wheelZoomFactor(delta), point)
      drawn.value = clampRoam(next, boundsAt(next.k))
      return
    }
    const next = zoomAbout(goal(), wheelZoomFactor(delta), point)
    springTo(clampRoam(next, boundsAt(next.k)))
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!props.roam)
      return
    if (event.key === 'Escape') {
      if (drag?.active || pinch) {
        event.preventDefault()
        cancelGesture(drag?.id)
      }
      return
    }
    // Leave ⌘/Ctrl + plus/minus to the browser's own zoom.
    if (event.ctrlKey || event.metaKey || event.altKey || drag?.active || pinch)
      return
    const from = goal()
    const middle = { x: width.value / 2, y: height.value / 2 }
    const stepX = width.value * KEY_PAN
    const stepY = height.value * KEY_PAN
    let next: RoamState
    switch (event.key) {
      case 'ArrowLeft': next = panBy(from, stepX, 0); break
      case 'ArrowRight': next = panBy(from, -stepX, 0); break
      case 'ArrowUp': next = panBy(from, 0, stepY); break
      case 'ArrowDown': next = panBy(from, 0, -stepY); break
      case '+':
      case '=': next = zoomAbout(from, Math.SQRT2, middle); break
      case '-':
      case '_': next = zoomAbout(from, Math.SQRT1_2, middle); break
      case '0':
        event.preventDefault()
        reset()
        return
      default:
        return
    }
    event.preventDefault()
    springTo(clampRoam(next, boundsAt(next.k)))
  }

  // A new `zoom`, `center`, map or projection starts over from its fitted view.
  // Separate sources, so a fresh `[lng, lat]` array with the same numbers is no change.
  watch(
    [() => props.roam, zoom, () => props.center?.[0], () => props.center?.[1], () => props.geoJson, () => props.projection],
    () => {
      cancelGesture()
      stopMotion()
      suppressClick = false
      drawn.value = null
    },
  )

  // A view the user left is in the pixels of the size it was made at: a resized
  // container scales it, and one pushed past the new edge comes back inside.
  watch([width, height], ([w, h], [oldW, oldH]) => {
    const view = drawn.value
    if (!view || !w || !h)
      return
    stopMotion()
    const scaled = { k: view.k, tx: oldW ? view.tx * w / oldW : view.tx, ty: oldH ? view.ty * h / oldH : view.ty }
    drawn.value = clampRoam(scaled, boundsAt(view.k))
  })
  onBeforeUnmount(stopMotion)

  const labels = computed<MapLabels>(() => ({ ...MAP_DEFAULT_LABELS, ...props.labels }))
  const instructionsId = useId()
  const rootAttrs = computed<Record<string, string | number>>(() => {
    if (!props.roam)
      return {}
    const attrs: Record<string, string | number> = { 'tabindex': 0, 'role': 'application', 'aria-label': labels.value.map }
    if (instructionsId)
      attrs['aria-describedby'] = instructionsId
    return attrs
  })

  function tooltipStyle(el: HTMLElement | null): Record<string, string> {
    const placement = placeTooltip({
      pointerX: pointer.x,
      pointerY: pointer.y,
      tooltipWidth: el?.offsetWidth ?? 0,
      tooltipHeight: el?.offsetHeight ?? 0,
      containerWidth: width.value,
      containerHeight: height.value,
      offset: 12,
      follow: 'both',
    })
    return { left: `${placement.left}px`, top: `${placement.top}px` }
  }

  return {
    container,
    width,
    height,
    rootStyle,
    ready,
    projection,
    landPath,
    featurePath,
    project,
    transform,
    scaleFactor,
    pointer,
    tooltipStyle,
    dragging,
    labels,
    instructionsId,
    rootAttrs,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onKeyDown,
    onDblClick,
    onClickCapture,
  }
}
