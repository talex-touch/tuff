import type { GeoProjection } from 'd3-geo'
import type { ComputedRef, Ref } from 'vue'
import type { MapBaseProps } from './types'
import { geoPath } from 'd3-geo'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { placeTooltip } from '../../tooltip'
import {
  DEFAULT_BOUNDING_COORDS,
  fitProjectionToWindow,
  MAX_ZOOM_FACTOR,
  projectedAspect,
  resolveProjection,
} from './projection'
import { clampScale, initialRoam, panBy, scaleAboutPoint } from './roam'

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
  onWheel: (event: WheelEvent) => void
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
}

export function useMapBase(props: MapBaseProps): MapBase {
  const container = ref<HTMLElement | null>(null)
  const measuredWidth = ref(0)
  const measuredHeight = ref(0)

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
    if (props.height !== undefined)
      return props.height
    // Aspect-driven: prefer measured height, else derive from width.
    if (measuredHeight.value > 0)
      return measuredHeight.value
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

  const zoom = computed(() => props.zoom ?? 1.25)
  const userRoam = ref<{ k: number, tx: number, ty: number } | null>(null)

  const roamState = computed(() => {
    if (userRoam.value)
      return userRoam.value
    const projectedCenter = props.center
      ? project(props.center[0], props.center[1]) ?? undefined
      : undefined
    return initialRoam(zoom.value, width.value, height.value, projectedCenter)
  })

  const transform = computed(() => {
    const { k, tx, ty } = roamState.value
    return `translate(${tx}, ${ty}) scale(${k})`
  })

  const scaleFactor = computed(() => roamState.value.k)

  const pointer = reactive({ x: 0, y: 0 })
  let dragging: { x: number, y: number } | null = null

  function toLocal(event: { clientX: number, clientY: number }): { x: number, y: number } {
    const el = container.value
    if (!el)
      return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function onWheel(event: WheelEvent): void {
    if (!props.roam)
      return
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.002)
    const current = roamState.value
    const target = clampScale(current.k * factor, zoom.value, MAX_ZOOM_FACTOR)
    userRoam.value = scaleAboutPoint(current, target, toLocal(event))
  }

  function onPointerDown(event: PointerEvent): void {
    if (!props.roam || event.button !== 0)
      return
    dragging = toLocal(event)
    ;(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event: PointerEvent): void {
    const local = toLocal(event)
    pointer.x = local.x
    pointer.y = local.y
    if (!dragging)
      return
    userRoam.value = panBy(roamState.value, local.x - dragging.x, local.y - dragging.y)
    dragging = local
  }

  function onPointerUp(): void {
    dragging = null
  }

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
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
