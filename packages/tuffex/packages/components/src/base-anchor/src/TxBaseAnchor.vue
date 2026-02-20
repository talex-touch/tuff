<script setup lang="ts">
import type { TxCardProps } from '../../card/src/types'
import type { BaseAnchorProps } from './types'
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import gsap from 'gsap'
import type { StyleValue } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'
import TxCard from '../../card/src/TxCard.vue'

defineOptions({ name: 'TxBaseAnchor', inheritAttrs: false })

const props = withDefaults(defineProps<BaseAnchorProps>(), {
  modelValue: undefined,
  disabled: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  maxHeight: 420,
  unlimitedHeight: false,
  matchReferenceWidth: false,
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

const zIndex = ref(getZIndex())
const mounted = ref(false)
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const cleanupResizeObserver = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)
const panelSurfaceMoving = ref(false)
const REFRACTION_CLOSE_PREPARE_MS = 180
interface RectSnapshot { x: number, y: number, width: number, height: number }
let lastReferenceRect: RectSnapshot | null = null
let panelSurfaceMoveTimer: ReturnType<typeof setTimeout> | null = null
let closePrepareTimer: ReturnType<typeof setTimeout> | null = null

let tl: gsap.core.Timeline | null = null
let runId = 0

/* ─── floating-ui ─── */
const { floatingStyles, middlewareData, placement, update } = useFloating(referenceRef, floatingRef, {
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
type ClassValue = string | Record<string, boolean> | Array<string | Record<string, boolean>>

const floatingClass = computed<ClassValue | undefined>(() => (attrs as Record<string, unknown>).class as ClassValue | undefined)
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
  const shouldFallbackSurface = panelSurfaceMoving.value
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

function setupResizeObserver() {
  cleanupResizeObserver.value?.()
  cleanupResizeObserver.value = null
  if (!hasWindow() || !contentRef.value || typeof ResizeObserver === 'undefined')
    return

  const observer = new ResizeObserver(() => {
    syncOutlineSize()
  })
  observer.observe(contentRef.value)
  cleanupResizeObserver.value = () => observer.disconnect()
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

/* ─── bounce padding on the far side ─── */
const bouncePad = computed(() => {
  const pad = '10px'
  switch (side.value) {
    case 'bottom': return { paddingBottom: pad }
    case 'top': return { paddingTop: pad }
    case 'left': return { paddingLeft: pad }
    case 'right': return { paddingRight: pad }
    default: return { paddingBottom: pad }
  }
})

/* ─── helpers ─── */
function getTranslate(): { x: number, y: number } {
  const d = 30
  switch (side.value) {
    case 'bottom': return { x: 0, y: -d }
    case 'top': return { x: 0, y: d }
    case 'left': return { x: d, y: 0 }
    case 'right': return { x: -d, y: 0 }
    default: return { x: 0, y: -d }
  }
}

function getClipPath(progress: number): string {
  const p = `${Math.max(0, (1 - progress) * 100)}%`
  switch (side.value) {
    case 'bottom': return `inset(0 0 ${p} 0)`
    case 'top': return `inset(${p} 0 0 0)`
    case 'left': return `inset(0 0 0 ${p})`
    case 'right': return `inset(0 ${p} 0 0)`
    default: return `inset(0 0 ${p} 0)`
  }
}

function getArrowInsetTranslate(): { x: number, y: number } {
  const d = Math.max(4, Math.round((props.arrowSize ?? 10) * 0.45))
  switch (side.value) {
    case 'bottom': return { x: 0, y: d }
    case 'top': return { x: 0, y: -d }
    case 'left': return { x: -d, y: 0 }
    case 'right': return { x: d, y: 0 }
    default: return { x: 0, y: d }
  }
}

function clearTimeline() {
  if (closePrepareTimer != null) {
    clearTimeout(closePrepareTimer)
    closePrepareTimer = null
  }
  if (tl) {
    tl.kill()
    tl = null
  }
}

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

function settleOpenVisualStateForFollow() {
  const clip = clipRef.value
  const content = contentRef.value
  const arrowEl = arrowRef.value
  if (!clip || !content || !hasWindow())
    return

  clearTimeline()
  if (props.panelBackground !== 'refraction') {
    pulsePanelSurfaceMoving(120)
  }

  clip.style.visibility = 'visible'
  clip.style.clipPath = 'none'
  clip.style.overflow = 'visible'
  clip.style.willChange = 'auto'

  gsap.set(content, { clearProps: 'transform' })
  content.style.willChange = 'auto'

  if (arrowEl)
    gsap.set(arrowEl, { clearProps: 'transform,opacity,willChange' })
}

function readReferenceRect(): RectSnapshot | null {
  const el = referenceRef.value
  if (!el)
    return null
  const rect = el.getBoundingClientRect()
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
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

/* ─── animate open ─── */
function animateOpen(currentRunId: number) {
  const clip = clipRef.value
  const content = contentRef.value
  const arrowEl = arrowRef.value
  if (isUnlimitedHeight.value) {
    clearTimeline()
    if (!clip || !content) {
      mounted.value = true
      setPanelSurfaceMoving(false)
      return
    }
    clip.style.visibility = 'visible'
    clip.style.clipPath = 'none'
    clip.style.overflow = 'visible'
    clip.style.willChange = 'auto'
    gsap.set(content, { clearProps: 'transform' })
    content.style.willChange = 'auto'
    if (arrowEl)
      gsap.set(arrowEl, { clearProps: 'transform,opacity,willChange' })
    setPanelSurfaceMoving(false)
    tl = null
    return
  }
  if (!clip || !content || !hasWindow()) {
    mounted.value = true
    setPanelSurfaceMoving(false)
    return
  }

  clearTimeline()
  setPanelSurfaceMoving(true)

  const durMs = Math.max(0, props.duration)
  if (durMs <= 0) {
    clip.style.visibility = 'visible'
    clip.style.clipPath = 'none'
    clip.style.overflow = 'visible'
    clip.style.willChange = 'auto'
    gsap.set(content, { clearProps: 'transform' })
    content.style.willChange = 'auto'
    if (props.showArrow && arrowEl) {
      gsap.set(arrowEl, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        clearProps: 'willChange',
      })
    }
    setPanelSurfaceMoving(false)
    tl = null
    return
  }

  const hiddenT = getTranslate()
  const dur = durMs / 1000

  // prepare
  clip.style.overflow = 'hidden'
  clip.style.visibility = 'visible'
  clip.style.clipPath = getClipPath(0)
  clip.style.willChange = 'clip-path'
  content.style.willChange = 'transform'
  gsap.set(content, { x: hiddenT.x, y: hiddenT.y })
  if (props.showArrow && arrowEl) {
    const insetT = getArrowInsetTranslate()
    gsap.set(arrowEl, {
      x: insetT.x,
      y: insetT.y,
      scale: 0.72,
      opacity: 0,
      willChange: 'transform,opacity',
    })
  }

  const clipState = { progress: 0 }
  const arrowEnterDur = Math.min(0.16, Math.max(0.09, dur * 0.28))

  tl = gsap.timeline({
    onComplete: () => {
      if (currentRunId !== runId)
        return
      clip.style.clipPath = 'none'
      clip.style.overflow = 'visible'
      // clear GPU layers for smooth scroll repositioning
      clip.style.willChange = 'auto'
      gsap.set(content, { clearProps: 'transform' })
      content.style.willChange = 'auto'
      if (arrowEl)
        gsap.set(arrowEl, { clearProps: 'willChange' })
      setPanelSurfaceMoving(false)
      tl = null
    },
  })

  tl.to(clipState, {
    progress: 1,
    duration: dur * 0.85,
    ease: 'power2.inOut',
    onUpdate() {
      clip.style.clipPath = getClipPath(clipState.progress)
    },
  }, 0)

  tl.to(content, {
    x: 0,
    y: 0,
    duration: dur,
    ease: props.ease,
  }, 0)

  if (props.showArrow && arrowEl) {
    tl.to(arrowEl, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      duration: arrowEnterDur,
      ease: 'power2.out',
    }, Math.max(0, dur - arrowEnterDur * 0.85))
  }
}

/* ─── animate close ─── */
function animateClose(currentRunId: number) {
  const clip = clipRef.value
  const content = contentRef.value
  const arrowEl = arrowRef.value
  if (isUnlimitedHeight.value) {
    clearTimeline()
    if (!clip || !content) {
      mounted.value = false
      setPanelSurfaceMoving(false)
      return
    }
    clip.style.visibility = 'hidden'
    clip.style.clipPath = 'none'
    clip.style.overflow = 'hidden'
    clip.style.willChange = 'auto'
    gsap.set(content, { clearProps: 'transform' })
    content.style.willChange = 'auto'
    if (arrowEl)
      gsap.set(arrowEl, { clearProps: 'transform,opacity,willChange' })
    if (!props.keepAliveContent)
      mounted.value = false
    setPanelSurfaceMoving(false)
    tl = null
    return
  }
  if (!clip || !content || !hasWindow()) {
    mounted.value = false
    setPanelSurfaceMoving(false)
    return
  }

  clearTimeline()
  setPanelSurfaceMoving(true)

  const durMs = Math.max(0, props.duration * 0.45)
  if (durMs <= 0) {
    clip.style.visibility = 'hidden'
    clip.style.clipPath = 'none'
    clip.style.overflow = 'hidden'
    clip.style.willChange = 'auto'
    gsap.set(content, { clearProps: 'transform' })
    content.style.willChange = 'auto'
    if (arrowEl)
      gsap.set(arrowEl, { clearProps: 'transform,opacity,willChange' })
    if (!props.keepAliveContent)
      mounted.value = false
    setPanelSurfaceMoving(false)
    tl = null
    return
  }

  const startCloseMotion = () => {
    if (currentRunId !== runId || open.value) {
      return
    }

    // restore GPU layers for animation
    clip.style.willChange = 'clip-path'
    content.style.willChange = 'transform'
    clip.style.overflow = 'hidden'
    clip.style.clipPath = getClipPath(1)

    const hiddenT = getTranslate()
    const dur = durMs / 1000
    const clipState = { progress: 1 }
    const hasArrow = !!(props.showArrow && arrowEl)
    const arrowInsetT = hasArrow ? getArrowInsetTranslate() : { x: 0, y: 0 }
    const arrowHideDur = hasArrow ? Math.min(0.11, Math.max(0.07, dur * 0.4)) : 0
    const motionStart = arrowHideDur

    tl = gsap.timeline({
      onComplete: () => {
        if (currentRunId !== runId)
          return
        clip.style.visibility = 'hidden'
        clip.style.clipPath = 'none'
        clip.style.willChange = 'auto'
        content.style.willChange = 'auto'
        if (arrowEl)
          gsap.set(arrowEl, { clearProps: 'transform,opacity,willChange' })
        if (!props.keepAliveContent)
          mounted.value = false
        setPanelSurfaceMoving(false)
        tl = null
      },
    })

    if (hasArrow && arrowEl) {
      gsap.set(arrowEl, { willChange: 'transform,opacity' })
      tl.to(arrowEl, {
        x: arrowInsetT.x,
        y: arrowInsetT.y,
        scale: 0.72,
        opacity: 0,
        duration: arrowHideDur,
        ease: 'power2.in',
      }, 0)
    }

    tl.to(content, {
      x: hiddenT.x,
      y: hiddenT.y,
      duration: dur,
      ease: 'power3.in',
    }, motionStart)

    tl.to(clipState, {
      progress: 0,
      duration: dur,
      ease: 'power3.in',
      onUpdate() {
        clip.style.clipPath = getClipPath(clipState.progress)
      },
    }, motionStart)
  }

  if (props.panelBackground === 'refraction') {
    closePrepareTimer = setTimeout(() => {
      closePrepareTimer = null
      startCloseMotion()
    }, REFRACTION_CLOSE_PREPARE_MS)
    return
  }

  startCloseMotion()
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
    await update()
    syncOutlineSize()
    setupResizeObserver()

    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(
        referenceRef.value,
        floatingRef.value,
        () => {
          const referenceMoved = hasReferenceMoved()
          update()
          if (referenceMoved && open.value && props.panelBackground !== 'refraction') {
            pulsePanelSurfaceMoving(120)
          }
          if (referenceMoved && tl && open.value)
            settleOpenVisualStateForFollow()
        },
        { animationFrame: true },
      )
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

  await nextTick()
  if (referenceRef.value) {
    await update()
    syncOutlineSize()
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
  clearTimeline()
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-base-anchor__reference"
    @click.capture="handleReferenceClick"
  >
    <slot name="reference" />
  </div>

  <Teleport to="body">
    <div
      v-if="mounted || open"
      ref="floatingRef"
      v-bind="floatingAttrs"
      class="tx-base-anchor"
      :class="[floatingClass, { 'is-open': open, 'is-unlimited-height': isUnlimitedHeight }]"
      :style="[floatingStyle, floatingStyles, { zIndex, '--tx-ba-max-height': isUnlimitedHeight ? 'none' : undefined }]"
    >
      <span
        v-if="props.showArrow"
        ref="arrowRef"
        class="tx-base-anchor__arrow"
        :data-side="side"
        :data-bg="props.panelBackground"
        :style="arrowStyle"
        aria-hidden="true"
      />

      <div
        ref="clipRef"
        class="tx-base-anchor__clip"
        :data-side="side"
        :style="bouncePad"
      >
        <div ref="contentRef" class="tx-base-anchor__content">
          <TxCard
            v-if="props.useCard"
            class="tx-base-anchor__card"
            v-bind="panelCardProps"
          >
            <slot :side="side" />
          </TxCard>
          <slot v-else :side="side" />
          <svg
            v-if="props.useCard && outlinePath"
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
</style>
