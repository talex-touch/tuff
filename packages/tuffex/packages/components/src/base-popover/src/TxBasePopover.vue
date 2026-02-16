<script setup lang="ts">
import type { BasePopoverProps } from './types'
import { autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import gsap from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TxCard from '../../card/src/TxCard.vue'
import { hasWindow } from '../../../../utils/env'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({ name: 'TxBasePopover' })

const props = withDefaults(defineProps<BasePopoverProps>(), {
  modelValue: false,
  disabled: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  duration: 432,
  ease: 'back.out(2)',
  softEdge: 18,
  panelBackground: 'blur',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 10,
  closeOnClickOutside: true,
  closeOnEsc: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const open = computed({
  get: () => !!props.modelValue,
  set: (v) => {
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

const zIndex = ref(getZIndex())
const mounted = ref(false)
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)

let tl: gsap.core.Timeline | null = null
let runId = 0

/* ─── floating-ui ─── */
const { floatingStyles, placement, update } = useFloating(referenceRef, floatingRef, {
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
        const w = props.width > 0 ? props.width : Math.max(baseW, minW)
        const maxH = Math.min(availableHeight, 420)
        Object.assign(elements.floating.style, {
          width: `${w}px`,
          maxWidth: `${props.maxWidth}px`,
        })
        elements.floating.style.setProperty('--tx-bp-max-height', `${maxH}px`)
      },
    }),
  ],
})

const side = computed(() => (placement.value?.split('-')[0] ?? 'bottom') as 'top' | 'bottom' | 'left' | 'right')

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
    case 'left': return `inset(0 ${p} 0 0)`
    case 'right': return `inset(0 0 0 ${p})`
    default: return `inset(0 0 ${p} 0)`
  }
}

function clearTimeline() {
  if (tl) {
    tl.kill()
    tl = null
  }
}

/* ─── animate open ─── */
function animateOpen(currentRunId: number) {
  const clip = clipRef.value
  const content = contentRef.value
  if (!clip || !content || !hasWindow()) {
    mounted.value = true
    return
  }

  clearTimeline()

  const hiddenT = getTranslate()
  const dur = props.duration / 1000

  // prepare
  clip.style.overflow = 'hidden'
  clip.style.visibility = 'visible'
  clip.style.clipPath = getClipPath(0)
  clip.style.willChange = 'clip-path'
  content.style.willChange = 'transform'
  gsap.set(content, { x: hiddenT.x, y: hiddenT.y })

  const clipState = { progress: 0 }

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
}

/* ─── animate close ─── */
function animateClose(currentRunId: number) {
  const clip = clipRef.value
  const content = contentRef.value
  if (!clip || !content || !hasWindow()) {
    mounted.value = false
    return
  }

  clearTimeline()

  // restore GPU layers for animation
  clip.style.willChange = 'clip-path'
  content.style.willChange = 'transform'
  clip.style.overflow = 'hidden'
  clip.style.clipPath = getClipPath(1)

  const hiddenT = getTranslate()
  const dur = (props.duration * 0.45) / 1000
  const clipState = { progress: 1 }

  tl = gsap.timeline({
    onComplete: () => {
      if (currentRunId !== runId)
        return
      clip.style.visibility = 'hidden'
      clip.style.clipPath = 'none'
      clip.style.willChange = 'auto'
      content.style.willChange = 'auto'
      mounted.value = false
      tl = null
    },
  })

  tl.to(content, {
    x: hiddenT.x,
    y: hiddenT.y,
    duration: dur,
    ease: 'power3.in',
  }, 0)

  tl.to(clipState, {
    progress: 0,
    duration: dur,
    ease: 'power3.in',
    onUpdate() {
      clip.style.clipPath = getClipPath(clipState.progress)
    },
  }, 0)
}

/* ─── toggle / close ─── */
function toggle() {
  if (props.disabled)
    return
  if (!open.value)
    lastOpenedAt.value = performance.now()
  open.value = !open.value
}

function close() {
  open.value = false
}

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
      animateClose(currentRunId)
      return
    }

    mounted.value = true
    zIndex.value = nextZIndex()
    lastOpenedAt.value = performance.now()

    await nextTick()
    await update()

    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(referenceRef.value, floatingRef.value, () => update())
    }

    await nextTick()
    animateOpen(currentRunId)
  },
  { flush: 'post' },
)

/* ─── lifecycle ─── */
onMounted(async () => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)

  await nextTick()
  if (referenceRef.value)
    await update()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
  clearTimeline()
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-base-popover__reference"
    @click.capture="toggle"
  >
    <slot name="reference" />
  </div>

  <Teleport to="body">
    <div
      v-if="mounted || open"
      ref="floatingRef"
      class="tx-base-popover"
      :style="[floatingStyles, { zIndex }]"
    >
      <div
        ref="clipRef"
        class="tx-base-popover__clip"
        :data-side="side"
        :style="bouncePad"
      >
        <div ref="contentRef" class="tx-base-popover__content">
          <TxCard
            class="tx-base-popover__card"
            :background="panelBackground"
            :shadow="panelShadow"
            :radius="panelRadius"
            :padding="panelPadding"
          >
            <slot />
          </TxCard>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tx-base-popover__reference {
  display: inline-flex;
  align-items: center;
  width: fit-content;
}

.tx-base-popover {
  padding: 0;
  background: transparent;
  border: none;
  overflow: visible;
  pointer-events: none;
}

.tx-base-popover__clip {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  will-change: clip-path;
  visibility: hidden;
}

.tx-base-popover__content {
  will-change: transform;
}

.tx-base-popover__card {
  width: 100%;
  max-height: var(--tx-bp-max-height, 420px);
  overflow: auto;
}
</style>
