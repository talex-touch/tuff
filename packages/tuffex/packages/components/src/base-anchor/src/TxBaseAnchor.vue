<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { TxCardProps } from '../../card/src/types'
import type { LiquidMetrics } from './base-anchor-liquid'
import type { BaseAnchorClassValue, BaseAnchorProps, BaseAnchorVirtualReference } from './types'
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'
import TxCard from '../../card/src/TxCard.vue'
import { beadPinchRatio, beadSpanAt, createLiquidMetrics, geometryAt, itemOpacityAt, LIQUID_DEFAULTS } from './base-anchor-liquid'
import { useBaseAnchorMotion } from './base-anchor-motion'

defineOptions({ name: 'TxBaseAnchor', inheritAttrs: false })

const props = withDefaults(defineProps<BaseAnchorProps>(), {
  modelValue: undefined,
  disabled: false,
  eager: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  maxHeight: 420,
  unlimitedHeight: false,
  matchReferenceWidth: false,
  virtualReference: undefined,
  animation: () => ({}),
  duration: 432,
  ease: 'back.out(2)',
  useCard: true,
  panelVariant: 'plain',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 10,
  showArrow: false,
  arrowSize: 10,
  keepAliveContent: false,
  surfaceMotionAdaptation: 'auto',
  closeOnClickOutside: true,
  closeOnEsc: true,
  toggleOnReferenceClick: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()
const attrs = useAttrs()

const internalOpen = ref(false)
const isUnlimitedHeight = computed(() => props.unlimitedHeight || props.maxHeight <= 0)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v: boolean) => {
    if (props.disabled && v)
      return

    const current = typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value
    if (current === v)
      return

    internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open')
    else
      emit('close')
  },
})

/* ─── refs ─── */
const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const clipRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const arrowRef = ref<HTMLElement | null>(null)
const outlineW = ref(0)
const outlineH = ref(0)

/* ─── liquid stage ─── */
const liquidStageRef = ref<HTMLElement | null>(null)
const liquidPanelShapeRef = ref<SVGRectElement | null>(null)
const liquidShadowRef = ref<HTMLElement | null>(null)
const liquidRegion = ref({ x: 0, y: 0, w: 0, h: 0 })
const liquidTrigger = ref({ x: 0, y: 0, w: 0, h: 0, r: 0 })
const liquidPanelWidth = ref(0)
const liquidOutlineColor = ref<string>(LIQUID_DEFAULTS.outlineColor)
const liquidSurfaceColor = ref('#fafafa')

// Per-frame writes go straight to the DOM; keeping these out of reactivity avoids
// a re-render on every animation frame.
let liquidMetrics: LiquidMetrics | null = null
let liquidItems: Array<{ el: HTMLElement, hold: number }> = []
let liquidProgress = 0
let liquidVelocity = 0
let liquidSignature = ''
let motionQuery: MediaQueryList | null = null
let reducedMotion = false

const uid = getCurrentInstance()?.uid ?? 0
const liquidShapesId = `tx-ba-liquid-shapes-${uid}`
const liquidGooId = `tx-ba-liquid-goo-${uid}`
const liquidOutlineId = `tx-ba-liquid-outline-${uid}`
const liquidMaskId = `tx-ba-liquid-mask-${uid}`

const zIndex = ref(getZIndex())
const mounted = ref(false)
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const cleanupResizeObserver = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)
const panelSurfaceMoving = ref(false)
interface RectSnapshot { x: number, y: number, width: number, height: number }
let lastReferenceRect: RectSnapshot | null = null
let panelSurfaceMoveTimer: ReturnType<typeof setTimeout> | null = null
let resizeUpdateFrame: number | null = null

let runId = 0

/* ─── floating-ui ─── */
const floatingReference = computed(() => props.virtualReference ?? referenceRef.value)

const { floatingStyles, middlewareData, placement, update } = useFloating(floatingReference as any, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  transform: false,
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        const baseW = rects.reference.width
        const minW = Math.max(0, props.minWidth ?? 0)

        const style = elements.floating.style
        style.width = ''
        style.minWidth = ''

        if (props.width > 0) {
          style.width = `${props.width}px`
        }
        else if (props.matchReferenceWidth) {
          style.width = `${Math.max(baseW, minW)}px`
        }
        else if (minW > 0) {
          style.minWidth = `${minW}px`
        }

        style.maxWidth = `${props.maxWidth}px`
        if (isUnlimitedHeight.value) {
          elements.floating.style.setProperty('--tx-ba-max-height', 'none')
          return
        }
        const maxH = Math.max(0, Math.min(availableHeight, props.maxHeight))
        elements.floating.style.setProperty('--tx-ba-max-height', `${maxH}px`)
      },
    }),
    arrow({ element: arrowRef, padding: 6 }),
  ],
})

const side = computed(() => (placement.value?.split('-')[0] ?? 'bottom') as 'top' | 'bottom' | 'left' | 'right')
const floatingClass = computed<BaseAnchorClassValue | undefined>(
  () => (attrs as Record<string, unknown>).class as BaseAnchorClassValue | undefined,
)
const floatingStyle = computed<StyleValue | undefined>(() => (attrs as Record<string, unknown>).style as StyleValue | undefined)
const floatingAttrs = computed(() => {
  const source = attrs as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === 'class' || key === 'style')
      continue
    next[key] = value
  }
  return next
})

const panelCardProps = computed<Partial<TxCardProps>>(() => {
  const shouldFallbackSurface = props.surfaceMotionAdaptation === 'auto'
    ? panelSurfaceMoving.value
    : props.surfaceMotionAdaptation === 'manual'
      ? props.panelCard?.surfaceMoving
      : false
  const refractionSurfaceDefaults = props.panelBackground === 'refraction'
    ? {
        glassOverlayOpacity: 0.15,
        maskOpacity: 0.78,
      }
    : undefined
  return {
    ...(refractionSurfaceDefaults ?? {}),
    ...(props.panelCard ?? {}),
    variant: props.panelVariant,
    background: props.panelBackground,
    shadow: props.panelShadow,
    radius: props.panelRadius,
    padding: props.panelPadding,
    surfaceMoving: shouldFallbackSurface,
  }
})

const arrowStyle = computed<Record<string, string>>(() => {
  if (!props.showArrow || !arrowRef.value)
    return { display: 'none' }

  const data = (middlewareData.value as any)?.arrow
  if (!data || (data.x == null && data.y == null))
    return { display: 'none' }

  const base: Record<string, string> = {
    'display': 'block',
    'position': 'absolute',
    '--tx-ba-arrow-size': `${props.arrowSize ?? 10}px`,
  }

  if (data.x != null)
    base.left = `${data.x}px`
  if (data.y != null)
    base.top = `${data.y}px`

  const staticSideMap = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  } as const

  const staticSide = staticSideMap[side.value] ?? 'top'
  const half = Math.round((props.arrowSize ?? 10) / 2)
  base[staticSide] = `-${half}px`
  return base
})

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function syncOutlineSize() {
  const el = contentRef.value
  if (!el) {
    outlineW.value = 0
    outlineH.value = 0
    return
  }
  outlineW.value = Math.max(0, el.offsetWidth)
  outlineH.value = Math.max(0, el.offsetHeight)
}

/**
 * `useFloating().update()` returns `void`, so `await update()` guarantees nothing: positioning
 * — and in particular the `size` middleware that writes `elements.floating.style.width` — lands
 * asynchronously afterwards. A `syncOutlineSize()` called right after `update()` can therefore
 * read a stale width. Re-measure once the frame has landed; `outlineW/outlineH` are reactive, so
 * the outline self-corrects without delaying the open animation.
 */
function scheduleOutlineRemeasure() {
  if (!hasWindow() || typeof window.requestAnimationFrame !== 'function')
    return
  window.requestAnimationFrame(() => syncOutlineSize())
}

function scheduleResizeUpdate() {
  if (!hasWindow())
    return
  if (resizeUpdateFrame != null)
    window.cancelAnimationFrame(resizeUpdateFrame)
  resizeUpdateFrame = window.requestAnimationFrame(() => {
    resizeUpdateFrame = null
    syncOutlineSize()
    void update()
    refreshLiquidStage()
  })
}

function setupResizeObserver() {
  cleanupResizeObserver.value?.()
  cleanupResizeObserver.value = null
  if (!hasWindow() || typeof ResizeObserver === 'undefined')
    return

  const observer = new ResizeObserver(() => {
    scheduleResizeUpdate()
  })
  if (contentRef.value)
    observer.observe(contentRef.value)
  if (referenceRef.value)
    observer.observe(referenceRef.value)

  cleanupResizeObserver.value = () => {
    observer.disconnect()
    if (resizeUpdateFrame != null) {
      window.cancelAnimationFrame(resizeUpdateFrame)
      resizeUpdateFrame = null
    }
  }
}

const outlinePath = computed(() => {
  if (!props.useCard)
    return ''

  const w = outlineW.value
  const h = outlineH.value
  if (!w || !h)
    return ''

  const r = Math.min(Math.max(0, props.panelRadius ?? 18), w / 2, h / 2)
  const borderInset = 0.5
  const left = borderInset
  const top = borderInset
  const right = w - borderInset
  const bottom = h - borderInset
  const radius = Math.max(0, r - borderInset)

  const topStart = left + radius
  const topEnd = right - radius
  const rightStart = top + radius
  const rightEnd = bottom - radius
  const bottomStart = left + radius
  const leftStart = top + radius
  const leftEnd = bottom - radius

  return [
    `M ${fmt(topStart)} ${fmt(top)}`,
    `L ${fmt(topEnd)} ${fmt(top)}`,
    `Q ${fmt(right)} ${fmt(top)} ${fmt(right)} ${fmt(rightStart)}`,
    `L ${fmt(right)} ${fmt(rightEnd)}`,
    `Q ${fmt(right)} ${fmt(bottom)} ${fmt(topEnd)} ${fmt(bottom)}`,
    `L ${fmt(bottomStart)} ${fmt(bottom)}`,
    `Q ${fmt(left)} ${fmt(bottom)} ${fmt(left)} ${fmt(leftEnd)}`,
    `L ${fmt(left)} ${fmt(leftStart)}`,
    `Q ${fmt(left)} ${fmt(top)} ${fmt(topStart)} ${fmt(top)}`,
  ].join(' ')
})

function clearPanelSurfaceMoveTimer() {
  if (panelSurfaceMoveTimer == null)
    return
  clearTimeout(panelSurfaceMoveTimer)
  panelSurfaceMoveTimer = null
}

function setPanelSurfaceMoving(value: boolean) {
  if (!props.useCard) {
    panelSurfaceMoving.value = false
    clearPanelSurfaceMoveTimer()
    return
  }
  panelSurfaceMoving.value = value
  if (!value)
    clearPanelSurfaceMoveTimer()
}

function pulsePanelSurfaceMoving(duration = 96) {
  if (!props.useCard)
    return
  panelSurfaceMoving.value = true
  clearPanelSurfaceMoveTimer()
  panelSurfaceMoveTimer = setTimeout(() => {
    panelSurfaceMoving.value = false
    panelSurfaceMoveTimer = null
  }, Math.max(40, duration))
}

const {
  animateClose,
  animateOpen,
  bouncePad,
  clearTimeline,
  hasActiveTimeline,
  resolvedAnimation,
  settleOpenVisualStateForFollow,
  usesBeadMotion,
  usesLiquidMotion: motionUsesLiquid,
} = useBaseAnchorMotion({
  clipRef,
  contentRef,
  arrowRef,
  side,
  arrowSize: computed(() => props.arrowSize ?? 10),
  showArrow: computed(() => props.showArrow),
  animation: computed(() => props.animation),
  duration: computed(() => props.duration),
  ease: computed(() => props.ease),
  panelBackground: computed(() => props.panelBackground),
  useCard: computed(() => props.useCard),
  keepAliveContent: computed(() => props.keepAliveContent),
  isUnlimitedHeight,
  isOpen: open,
  isCurrentRun: currentRunId => currentRunId === runId,
  setMounted: value => (mounted.value = value),
  setPanelSurfaceMoving,
  pulsePanelSurfaceMoving,
  prepareLiquid,
  applyLiquidFrame,
  settleLiquid,
})

/* ─── liquid drop ─── */

/** The panel height cannot be measured when it is unbounded, so the drop cannot run. */
const usesLiquidMotion = computed(() => motionUsesLiquid.value && !isUnlimitedHeight.value)

const liquidGoo = computed(() => {
  const animation = resolvedAnimation.value
  return {
    blur: animation.gooBlur,
    // Blur, then slam the alpha through a hard threshold. Everything above the
    // knee becomes opaque, so two nearby shapes read as one body of water.
    matrix: `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${animation.gooThreshold} ${animation.gooThresholdOffset}`,
  }
})

const liquidViewBox = computed(() => {
  const region = liquidRegion.value
  return `${region.x} ${region.y} ${region.w} ${region.h}`
})

const liquidStageStyle = computed<Record<string, string>>(() => {
  const region = liquidRegion.value
  return {
    left: `${region.x}px`,
    top: `${region.y}px`,
    width: `${region.w}px`,
    height: `${region.h}px`,
  }
})

const liquidShadowStyle = computed<Record<string, string>>(() => ({
  borderRadius: `${props.panelRadius}px`,
}))

const liquidPanelStyle = computed<Record<string, string>>(() => ({
  padding: `${props.panelPadding}px`,
  borderRadius: `${props.panelRadius}px`,
}))

/** `feFlood` takes no `var()`, so theme tokens have to be resolved to literals. */
function readColorToken(token: string, fallback: string): string {
  if (!hasWindow())
    return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}

function resolveTriggerRadius(override: number | undefined, triggerHeight: number): number {
  if (typeof override === 'number' && Number.isFinite(override))
    return Math.max(0, override)

  // The slot wrapper is a bare div; the radius lives on whatever the consumer rendered.
  const host = (referenceRef.value?.firstElementChild ?? referenceRef.value) as HTMLElement | null
  if (!host || !hasWindow())
    return 0

  const parsed = Number.parseFloat(window.getComputedStyle(host).borderTopLeftRadius)
  if (!Number.isFinite(parsed))
    return 0
  return Math.min(Math.max(0, parsed), triggerHeight / 2)
}

function measureLiquidItems(content: HTMLElement, selector: string, panelHeight: number) {
  const tagged = Array.from(content.querySelectorAll<HTMLElement>(selector))
  // Hold on the item's BOTTOM, not its mid-line: keyed to the mid-line an item
  // starts fading in while its lower half is still outside the silhouette.
  if (tagged.length)
    return tagged.map(el => ({ el, hold: el.offsetTop + el.offsetHeight }))

  // Without opted-in items there is nothing to stagger, so the panel body reveals
  // as a single unit — still keyed to growth, never to the clock.
  return [{ el: content, hold: panelHeight * 0.5 }]
}

function prefersReducedMotion(): boolean {
  return reducedMotion
}

/**
 * Re-derive the stage geometry from live layout.
 *
 * This has to be re-runnable on every frame rather than measured once up front:
 * `@floating-ui/vue`'s `update()` returns void, so there is no point at which the
 * panel is guaranteed to have been positioned and sized. Measuring once would
 * bake in the pre-positioned rect. The signature check keeps the common
 * unchanged case down to one rect read.
 */
function measureLiquid(): boolean {
  if (!hasWindow() || !usesLiquidMotion.value)
    return false

  const content = contentRef.value
  const floating = floatingRef.value
  if (!content || !floating)
    return false

  const referenceRect = readReferenceRect()
  if (!referenceRect)
    return false

  const panelWidth = Math.max(0, content.offsetWidth)
  const panelHeight = Math.max(0, content.offsetHeight)
  if (panelWidth <= 0 || panelHeight <= 0)
    return false

  const floatingRect = floating.getBoundingClientRect()
  const signature = [
    referenceRect.x,
    referenceRect.y,
    referenceRect.width,
    referenceRect.height,
    floatingRect.left,
    floatingRect.top,
    panelWidth,
    panelHeight,
  ].join(',')
  if (signature === liquidSignature && liquidMetrics)
    return true
  liquidSignature = signature

  const animation = resolvedAnimation.value
  // floating-ui positions the layer at the panel's top-left, so local (0, 0) is
  // exactly where the panel belongs — flip/shift relocations need no compensation.
  const triggerX = referenceRect.x - floatingRect.left
  const triggerY = referenceRect.y - floatingRect.top

  liquidTrigger.value = {
    x: triggerX,
    y: triggerY,
    w: referenceRect.width,
    h: referenceRect.height,
    r: resolveTriggerRadius(animation.triggerRadius, referenceRect.height),
  }
  liquidPanelWidth.value = panelWidth
  liquidOutlineColor.value = animation.outlineColor
    ?? readColorToken('--tx-border-color', LIQUID_DEFAULTS.outlineColor)
  liquidSurfaceColor.value = readColorToken('--tx-fill-color-lighter', '#fafafa')

  liquidMetrics = createLiquidMetrics({
    triggerTop: triggerY,
    triggerHeight: referenceRect.height,
    panelHeight,
    seedHeight: animation.seedHeight,
  })

  // The goo blur bleeds well past the shapes; a tight region would cut the neck off square.
  const pad = Math.ceil(animation.gooBlur * 3) + 2
  const minX = Math.min(0, triggerX) - pad
  const minY = Math.min(0, triggerY) - pad
  const maxX = Math.max(panelWidth, triggerX + referenceRect.width) + pad
  const maxY = Math.max(panelHeight, triggerY + referenceRect.height) + pad
  liquidRegion.value = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }

  return true
}

function prepareLiquid(_direction: 'open' | 'close'): boolean {
  if (!measureLiquid())
    return false

  const content = contentRef.value!
  liquidItems = measureLiquidItems(content, resolvedAnimation.value.itemSelector, content.offsetHeight)
  // Zero the items before the first paint; the stage stays hidden until the first
  // frame has been written against settled layout.
  for (const item of liquidItems)
    item.el.style.opacity = '0'

  return !prefersReducedMotion()
}

function applyLiquidFrame(p: number, velocity = 0) {
  measureLiquid()
  const metrics = liquidMetrics
  if (!metrics)
    return

  liquidProgress = p
  liquidVelocity = velocity
  const geometry = geometryAt(p, metrics)

  // `bead` lets the sheet report its own speed: the faster the drop falls, the
  // harder surface tension draws its sides in. The pinch decays to 0 as the
  // motion settles, so `drip` is just this with the pinch pinned at zero.
  const animation = resolvedAnimation.value
  const span = usesBeadMotion.value
    ? beadSpanAt(liquidPanelWidth.value, animation.beadPinch, beadPinchRatio(velocity, animation.beadVelocityRef))
    : { x: 0, width: liquidPanelWidth.value }

  const shape = liquidPanelShapeRef.value
  if (shape) {
    shape.setAttribute('y', String(geometry.top))
    shape.setAttribute('height', String(geometry.height))
    shape.setAttribute('x', String(span.x))
    shape.setAttribute('width', String(span.width))
  }

  const shadow = liquidShadowRef.value
  if (shadow) {
    const trigger = liquidTrigger.value
    shadow.style.top = `${geometry.top - liquidRegion.value.y}px`
    shadow.style.height = `${geometry.height}px`
    shadow.style.left = `${span.x - liquidRegion.value.x}px`
    shadow.style.width = `${span.width}px`
    // No shadow while the drop is still part of the trigger body; it fades in
    // exactly as the panel clears it.
    const cleared = (geometry.top - (trigger.y + trigger.h)) / 6
    shadow.style.opacity = String(Math.min(1, Math.max(0, cleared)))
  }

  for (const item of liquidItems)
    item.el.style.opacity = String(itemOpacityAt(geometry.bottom, item.hold))

  const stage = liquidStageRef.value
  if (stage)
    stage.style.visibility = 'visible'
}

function settleLiquid(isOpen: boolean) {
  for (const item of liquidItems)
    item.el.style.opacity = ''
  liquidItems = []

  const stage = liquidStageRef.value
  if (stage)
    stage.style.visibility = isOpen ? 'visible' : 'hidden'

  if (!isOpen) {
    liquidMetrics = null
    liquidSignature = ''
  }
}

/** Keep the goo silhouette glued to the reference while the anchor sits open. */
function refreshLiquidStage() {
  if (!usesLiquidMotion.value || !liquidMetrics)
    return
  applyLiquidFrame(liquidProgress, liquidVelocity)
}

function handleMotionPreferenceChange(event: MediaQueryListEvent) {
  reducedMotion = event.matches
}

function setupMotionPreference() {
  if (!hasWindow() || typeof window.matchMedia !== 'function')
    return
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionQuery.matches
  motionQuery.addEventListener('change', handleMotionPreferenceChange)
}

function teardownMotionPreference() {
  motionQuery?.removeEventListener('change', handleMotionPreferenceChange)
  motionQuery = null
}

function normalizeRect(rect: DOMRect | ClientRect): RectSnapshot {
  const domRect = rect as DOMRect
  return {
    x: typeof domRect.x === 'number' ? domRect.x : rect.left,
    y: typeof domRect.y === 'number' ? domRect.y : rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function readReferenceRect(): RectSnapshot | null {
  const reference = floatingReference.value as HTMLElement | BaseAnchorVirtualReference | null
  if (!reference)
    return null
  const rect = reference.getBoundingClientRect()
  return normalizeRect(rect)
}

function hasReferenceMoved(): boolean {
  const current = readReferenceRect()
  if (!current)
    return false
  if (!lastReferenceRect) {
    lastReferenceRect = current
    return false
  }

  const moveThreshold = 1.5
  const moved = Math.abs(current.x - lastReferenceRect.x) > moveThreshold
    || Math.abs(current.y - lastReferenceRect.y) > moveThreshold
    || Math.abs(current.width - lastReferenceRect.width) > moveThreshold
    || Math.abs(current.height - lastReferenceRect.height) > moveThreshold

  lastReferenceRect = current
  return moved
}

/* ─── toggle / close ─── */
function toggle() {
  if (props.disabled)
    return
  if (!open.value)
    lastOpenedAt.value = performance.now()
  open.value = !open.value
}

function handleReferenceClick() {
  if (!props.toggleOnReferenceClick)
    return
  toggle()
}

function close() {
  open.value = false
}

defineExpose({
  close,
  toggle,
  updatePosition: update,
})

/* ─── outside click / esc ─── */
function isEventInside(e: Event, el: HTMLElement | null): boolean {
  if (!el)
    return false
  const anyE = e as any
  const path: EventTarget[] | undefined = typeof anyE.composedPath === 'function' ? anyE.composedPath() : undefined
  if (path && path.length)
    return path.includes(el)
  const t = (e.target ?? null) as Node | null
  return !!t && el.contains(t)
}

function handleOutside(e: Event) {
  if (!props.closeOnClickOutside)
    return
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
    close()
}

function handleEsc(e: KeyboardEvent) {
  if (!props.closeOnEsc)
    return
  if (e.key !== 'Escape')
    return
  if (!open.value)
    return
  close()
}

/* ─── watch open state ─── */
watch(
  open,
  async (v) => {
    runId++
    const currentRunId = runId

    if (!v) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      cleanupResizeObserver.value?.()
      cleanupResizeObserver.value = null
      lastReferenceRect = null
      animateClose(currentRunId)
      return
    }

    mounted.value = true
    zIndex.value = nextZIndex()
    lastOpenedAt.value = performance.now()

    await nextTick()
    update()
    syncOutlineSize()
    scheduleOutlineRemeasure()
    setupResizeObserver()

    const reference = floatingReference.value
    if (reference && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      if (props.virtualReference) {
        const updatePosition = () => {
          update()
          refreshLiquidStage()
        }
        window.addEventListener('resize', updatePosition, { passive: true })
        window.addEventListener('scroll', updatePosition, { passive: true, capture: true })
        cleanupAutoUpdate.value = () => {
          window.removeEventListener('resize', updatePosition)
          window.removeEventListener('scroll', updatePosition, { capture: true } as EventListenerOptions)
        }
      }
      else {
        cleanupAutoUpdate.value = autoUpdate(
          reference,
          floatingRef.value,
          () => {
            const referenceMoved = hasReferenceMoved()
            update()
            if (referenceMoved && open.value && props.panelBackground !== 'refraction') {
              pulsePanelSurfaceMoving(120)
            }
            if (referenceMoved && hasActiveTimeline() && open.value)
              settleOpenVisualStateForFollow()
            refreshLiquidStage()
          },
          { animationFrame: true },
        )
      }
    }

    await nextTick()
    lastReferenceRect = readReferenceRect()
    syncOutlineSize()
    animateOpen(currentRunId)
  },
  { flush: 'post' },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled)
      return
    open.value = false
  },
)

/* ─── lifecycle ─── */
onMounted(async () => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)
  setupMotionPreference()

  await nextTick()
  if (referenceRef.value) {
    update()
    syncOutlineSize()
    scheduleOutlineRemeasure()
    setupResizeObserver()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
  cleanupResizeObserver.value?.()
  cleanupResizeObserver.value = null
  setPanelSurfaceMoving(false)
  teardownMotionPreference()
  clearTimeline()
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-base-anchor__reference"
    :class="[props.referenceClass, { 'is-virtual-reference': !!props.virtualReference }]"
    @click.capture="handleReferenceClick"
  >
    <slot name="reference" />
  </div>

  <Teleport to="body">
    <div
      v-if="mounted || open || props.eager"
      ref="floatingRef"
      v-bind="floatingAttrs"
      class="tx-base-anchor"
      :class="[floatingClass, { 'is-open': open, 'is-unlimited-height': isUnlimitedHeight, 'is-liquid': usesLiquidMotion }]"
      :style="[floatingStyle, floatingStyles, { zIndex, '--tx-ba-max-height': isUnlimitedHeight ? 'none' : undefined }]"
    >
      <span
        v-if="props.showArrow && !usesLiquidMotion"
        ref="arrowRef"
        class="tx-base-anchor__arrow"
        :data-side="side"
        :data-bg="props.panelBackground"
        :style="arrowStyle"
        aria-hidden="true"
      />

      <!--
        The trigger body and the panel share one goo filter so they read as a
        single body of water: the panel is torn off through a neck that thins and
        pinches, never slid out from behind. The trigger's own fill and text stay
        opaque in the document, untouched — this only draws its silhouette.
      -->
      <div
        v-if="usesLiquidMotion"
        ref="liquidStageRef"
        class="tx-base-anchor__liquid"
        :style="liquidStageStyle"
        aria-hidden="true"
      >
        <!--
          The shadow rides a twin outside the filter: a box-shadow fed through
          the goo would threshold into a hard black slab.
        -->
        <div
          ref="liquidShadowRef"
          class="tx-base-anchor__liquid-shadow"
          :style="liquidShadowStyle"
        />

        <svg
          class="tx-base-anchor__liquid-goo"
          :viewBox="liquidViewBox"
          :width="liquidRegion.w"
          :height="liquidRegion.h"
        >
          <defs>
            <g :id="liquidShapesId">
              <!--
                Inflated by 1px: the real trigger sits opaque on top, so a ghost
                matching it exactly would hide the ring under its own body.
              -->
              <rect
                :x="liquidTrigger.x - 1"
                :y="liquidTrigger.y - 1"
                :width="liquidTrigger.w + 2"
                :height="liquidTrigger.h + 2"
                :rx="liquidTrigger.r + 1"
                :ry="liquidTrigger.r + 1"
              />
              <rect
                ref="liquidPanelShapeRef"
                :rx="props.panelRadius"
                :ry="props.panelRadius"
              />
            </g>

            <!--
              The goo layer is teleported to <body>, so it paints over the
              trigger whenever an ancestor stacking context (isolation, z-index,
              transform) keeps the trigger from being raised above it. Punching
              the trigger's interior out of the FILL makes the trigger's own
              opaque fill and text show through regardless of stacking. The
              outline `use` is left unmasked so the derived ring still wraps it.
            -->
            <mask
              :id="liquidMaskId"
              maskUnits="userSpaceOnUse"
              :x="liquidRegion.x"
              :y="liquidRegion.y"
              :width="liquidRegion.w"
              :height="liquidRegion.h"
            >
              <rect
                :x="liquidRegion.x"
                :y="liquidRegion.y"
                :width="liquidRegion.w"
                :height="liquidRegion.h"
                fill="#fff"
              />
              <rect
                :x="liquidTrigger.x"
                :y="liquidTrigger.y"
                :width="liquidTrigger.w"
                :height="liquidTrigger.h"
                :rx="liquidTrigger.r"
                :ry="liquidTrigger.r"
                fill="#000"
              />
            </mask>

            <filter
              :id="liquidGooId"
              filterUnits="userSpaceOnUse"
              :x="liquidRegion.x"
              :y="liquidRegion.y"
              :width="liquidRegion.w"
              :height="liquidRegion.h"
              color-interpolation-filters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" :stdDeviation="liquidGoo.blur" result="blur" />
              <feColorMatrix in="blur" type="matrix" :values="liquidGoo.matrix" result="goo" />
              <!-- Flood the surface colour rather than keeping the blurred RGB, which haloes at the edges. -->
              <feFlood :flood-color="liquidSurfaceColor" result="paint" />
              <feComposite in="paint" in2="goo" operator="in" />
            </filter>

            <!--
              The outline is derived from the MERGED silhouette: erode the
              thresholded shape by 1px and flood the difference, so one continuous
              ring wraps the trigger, stretches down the neck, and closes around
              the panel. It is never drawn on either element.
            -->
            <filter
              :id="liquidOutlineId"
              filterUnits="userSpaceOnUse"
              :x="liquidRegion.x"
              :y="liquidRegion.y"
              :width="liquidRegion.w"
              :height="liquidRegion.h"
              color-interpolation-filters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" :stdDeviation="liquidGoo.blur" result="blur" />
              <feColorMatrix in="blur" type="matrix" :values="liquidGoo.matrix" result="goo" />
              <feMorphology in="goo" operator="erode" radius="1" result="eroded" />
              <feComposite in="goo" in2="eroded" operator="out" result="ring" />
              <feFlood :flood-color="liquidOutlineColor" result="ink" />
              <feComposite in="ink" in2="ring" operator="in" />
            </filter>
          </defs>

          <use :href="`#${liquidShapesId}`" :filter="`url(#${liquidGooId})`" :mask="`url(#${liquidMaskId})`" />
          <use :href="`#${liquidShapesId}`" :filter="`url(#${liquidOutlineId})`" />
        </svg>
      </div>

      <div
        ref="clipRef"
        class="tx-base-anchor__clip"
        :data-side="side"
        :style="bouncePad"
      >
        <div ref="contentRef" class="tx-base-anchor__content">
          <!-- liquid paints its own surface through the goo, so the card would double it up. -->
          <div
            v-if="usesLiquidMotion"
            class="tx-base-anchor__liquid-panel"
            :style="liquidPanelStyle"
          >
            <slot :side="side" />
          </div>
          <TxCard
            v-else-if="props.useCard"
            class="tx-base-anchor__card"
            v-bind="panelCardProps"
          >
            <slot :side="side" />
          </TxCard>
          <slot v-else :side="side" />
          <svg
            v-if="props.useCard && outlinePath && !usesLiquidMotion"
            class="tx-base-anchor__outline"
            :viewBox="`0 0 ${outlineW} ${outlineH}`"
            aria-hidden="true"
          >
            <path class="tx-base-anchor__outline-path" :d="outlinePath" />
          </svg>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tx-base-anchor__reference {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: fit-content;
}

.tx-base-anchor__reference.is-full-width {
  display: flex;
  width: 100%;
}

.tx-base-anchor__reference.is-virtual-reference {
  position: fixed;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.tx-base-anchor {
  padding: 0;
  background: transparent;
  border: none;
  overflow: visible;
  pointer-events: none;
}

.tx-base-anchor__clip {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  will-change: clip-path;
  visibility: hidden;
  z-index: 2;
}

.tx-base-anchor__arrow {
  position: absolute;
  width: var(--tx-ba-arrow-size, 10px);
  height: var(--tx-ba-arrow-size, 10px);
  pointer-events: none;
  background: transparent;
  overflow: hidden;
  z-index: 4;
}

.tx-base-anchor:not(.is-open) .tx-base-anchor__arrow {
  opacity: 0;
  visibility: hidden;
}

.tx-base-anchor__arrow[data-side='bottom'] {
  clip-path: inset(0 0 50% 0);
}

.tx-base-anchor__arrow[data-side='top'] {
  clip-path: inset(50% 0 0 0);
}

.tx-base-anchor__arrow[data-side='left'] {
  clip-path: inset(0 0 0 50%);
}

.tx-base-anchor__arrow[data-side='right'] {
  clip-path: inset(0 50% 0 0);
}

.tx-base-anchor__arrow::before,
.tx-base-anchor__arrow::after {
  content: '';
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-sizing: border-box;
}

.tx-base-anchor__arrow::before {
  background: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
}

.tx-base-anchor__arrow::after {
  inset: 1px;
  background: var(--tx-bg-color-overlay, #fff);
}

.tx-base-anchor__arrow[data-bg='mask']::after {
  background: var(--tx-card-fake-background, var(--tx-bg-color-overlay, #fff));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-base-anchor__arrow[data-bg='blur']::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-base-anchor__arrow[data-bg='glass']::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
}

.tx-base-anchor__arrow[data-bg='refraction']::after {
  background: color-mix(in srgb, var(--tx-surface-refraction-mask-color, var(--tx-bg-color-overlay, #fff)) 22%, transparent);
  backdrop-filter: blur(18px) saturate(162%) contrast(1.06) brightness(1.02);
  -webkit-backdrop-filter: blur(18px) saturate(162%) contrast(1.06) brightness(1.02);
}

.tx-base-anchor__arrow[data-bg='pure']::after {
  background: var(--tx-fill-color-lighter, var(--tx-bg-color-overlay, #fff));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-base-anchor__outline-path {
  fill: none;
  stroke: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 88%, transparent);
  stroke-width: 1;
  stroke-linecap: butt;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
  vector-effect: non-scaling-stroke;
}

.tx-base-anchor__content {
  position: relative;
  will-change: transform;
  max-height: var(--tx-ba-max-height, 420px);
}

.tx-base-anchor__card {
  width: 100%;
  max-height: var(--tx-ba-max-height, 420px);
  overflow: auto;
}

.tx-base-anchor__outline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

.tx-base-anchor.is-unlimited-height .tx-base-anchor__content,
.tx-base-anchor.is-unlimited-height .tx-base-anchor__card {
  max-height: none;
}

/* ─── liquid drop ─── */

.tx-base-anchor__liquid {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  visibility: hidden;
}

.tx-base-anchor__liquid-goo {
  position: absolute;
  inset: 0;
  overflow: visible;
}

.tx-base-anchor__liquid-shadow {
  position: absolute;
  opacity: 0;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
}

.tx-base-anchor__liquid-panel {
  position: relative;
  width: 100%;
  max-height: var(--tx-ba-max-height, 420px);
  overflow: auto;
  box-sizing: border-box;
}

/* The goo blur has to bleed past the panel box; clipping it cuts the neck off square. */
.tx-base-anchor.is-liquid .tx-base-anchor__clip {
  overflow: visible;
}
</style>
