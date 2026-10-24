<script setup lang="ts">
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { ImagePreviewItem } from './types'
import type { PreviewSize } from './zoom'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { usePressScrub } from '../../../../utils/press-scrub'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'

// Internal: the strip along the bottom of TxImagePreview, a thumbnail for each picture, the
// current one opened out to its shape, or a dot for each. It follows a page as it turns, and a
// drag across it scrubs through. Not exported — the preview owns the pages it shows and turns.
defineOptions({ name: 'TxImagePreviewStrip' })

const props = defineProps<{
  kind: 'thumbnails' | 'dots'
  items: ImagePreviewItem[]
  current: number
  /** Where the pages are, in pictures, while nobody scrubs: the current one, less the share of a page a slide has gone. */
  position: number
  /** The pictures' own sizes, once loaded: a thumbnail opens out to its picture's shape. */
  sizes: ReadonlyMap<string, PreviewSize>
  failed: (url: string) => boolean
  label: string
  formatter: (current: number, total: number, name?: string) => string
  /** The controls' surface. */
  material: { mode?: BaseSurfaceMode, color?: string, opacity?: number, blur?: number }
}>()

const emit = defineEmits<{
  /** Shows picture `at` at once, with no slide. */
  show: [at: number]
  /** Slides the neighbour on that side in. */
  step: [direction: 1 | -1]
}>()

const THUMB_HEIGHT = 42
const THUMB_NARROW = 30
const THUMB_GAP = 4
const THUMB_MAX_ASPECT = 2.4
/** Thumbnails drawn either side of the current one; the strip's edges fade before the last. */
const THUMB_WINDOW = 12
/** A drag this far (px) across the thumbnails moves one picture. */
const THUMB_PITCH = THUMB_NARROW + THUMB_GAP
const DOT_WINDOW = 9
/** A drag this far (px) along the dots moves one picture. */
const DOT_PITCH = 14
/** A jump to a picture further off settles over this long (ms). */
const JUMP_MS = 320

const reduced = useReducedMotion()

const stripRef = ref<HTMLElement | null>(null)
const thumbShapes = shallowRef(new Map<string, PreviewSize>())
const thumbFailed = shallowRef(new Set<string>())
const jumping = ref(false)
let jumpTimer: ReturnType<typeof setTimeout> | undefined
const scrubF = ref(0)
let scrubOrigin = { x: 0, f: 0, index: 0 }

const count = computed(() => props.items.length)

/** The strip settles on its new place with the host's bounce. */
function jump(): void {
  if (reduced.value)
    return
  jumping.value = true
  if (jumpTimer !== undefined)
    clearTimeout(jumpTimer)
  jumpTimer = setTimeout(() => {
    jumpTimer = undefined
    jumping.value = false
  }, JUMP_MS)
}

const scrub = usePressScrub(stripRef, {
  read: (event) => {
    const dx = event.clientX - scrubOrigin.x
    // The thumbnails are dragged like film, the dots like a slider's knob.
    const moved = props.kind === 'dots' ? dx / DOT_PITCH : -dx / THUMB_PITCH
    const f = Math.min(Math.max(scrubOrigin.f + moved, 0), count.value - 1)
    scrubF.value = f
    const at = Math.round(f)
    if (at !== props.current)
      emit('show', at)
  },
  cancel: () => {
    if (scrubOrigin.index !== props.current)
      emit('show', scrubOrigin.index)
  },
  end: jump,
})
const scrubbing = scrub.dragging

/** Where the strip is, in pictures. */
const stripF = computed(() => (scrubbing.value ? scrubF.value : props.position))

function onPointerDown(event: PointerEvent): void {
  scrubOrigin = { x: event.clientX, f: stripF.value, index: props.current }
  scrubF.value = stripF.value
  scrub.pointerdown(event)
}

/** A neighbour slides in; a picture further off shows at once, the strip settling after it. */
function jumpTo(at: number): void {
  if (at === props.current || at < 0 || at >= count.value)
    return
  if (Math.abs(at - props.current) === 1 && !reduced.value) {
    emit('step', at > props.current ? 1 : -1)
    return
  }
  jump()
  emit('show', at)
}

function thumbSrc(item: ImagePreviewItem): string {
  return item.thumbnail || item.url
}

/** The width of a picture's thumbnail opened out to its shape. */
function thumbWide(item: ImagePreviewItem): number {
  const size = props.sizes.get(item.url)
    ?? (item.width && item.height ? { width: item.width, height: item.height } : thumbShapes.value.get(thumbSrc(item)))
  const aspect = size && size.width > 0 && size.height > 0 ? size.width / size.height : 1
  return Math.min(THUMB_HEIGHT * THUMB_MAX_ASPECT, Math.max(THUMB_NARROW, THUMB_HEIGHT * aspect))
}

function onThumbLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  const src = image.getAttribute('src')
  if (!src || thumbShapes.value.has(src) || !(image.naturalWidth > 0 && image.naturalHeight > 0))
    return
  thumbShapes.value = new Map(thumbShapes.value).set(src, { width: image.naturalWidth, height: image.naturalHeight })
}

function onThumbError(event: Event): void {
  const src = (event.target as HTMLImageElement).getAttribute('src')
  if (src && !thumbFailed.value.has(src))
    thumbFailed.value = new Set(thumbFailed.value).add(src)
}

const cells = computed(() => {
  if (props.kind !== 'thumbnails')
    return []
  const f = stripF.value
  const n = count.value
  const centre = Math.round(f)
  const first = Math.max(0, centre - THUMB_WINDOW)
  const last = Math.min(n - 1, centre + THUMB_WINDOW)
  // Each opens out as the strip nears it, all the way at its own place.
  const near = (i: number): number => Math.max(0, 1 - Math.abs(i - f))
  const widths: number[] = []
  for (let i = first; i <= last; i++)
    widths[i] = THUMB_NARROW + (thumbWide(props.items[i]!) - THUMB_NARROW) * near(i)
  // Laid out from the cell at or before `f`, then shifted so the point `f` has reached between
  // it and the next sits in the middle.
  const base = Math.min(Math.max(Math.floor(f), first), last)
  const lefts: number[] = []
  lefts[base] = -widths[base]! / 2
  for (let i = base + 1; i <= last; i++)
    lefts[i] = lefts[i - 1]! + widths[i - 1]! + THUMB_GAP
  for (let i = base - 1; i >= first; i--)
    lefts[i] = lefts[i + 1]! - THUMB_GAP - widths[i]!
  const middle = (i: number): number => lefts[i]! + widths[i]! / 2
  const anchor = base < last ? middle(base) + (middle(base + 1) - middle(base)) * (f - base) : middle(base)
  const list = []
  for (let i = first; i <= last; i++) {
    const item = props.items[i]!
    const src = thumbSrc(item)
    list.push({
      index: i,
      src,
      failed: thumbFailed.value.has(src) || (src === item.url && props.failed(item.url)),
      current: i === props.current,
      label: props.formatter(i + 1, n, item.name),
      style: {
        width: `${widths[i]}px`,
        transform: `translate3d(${lefts[i]! - anchor}px, 0, 0)`,
        opacity: `${0.6 + 0.4 * near(i)}`,
      },
    })
  }
  return list
})

const dots = computed(() => {
  if (props.kind !== 'dots')
    return []
  const f = stripF.value
  const n = count.value
  const start = n <= DOT_WINDOW ? 0 : Math.min(Math.max(Math.round(f) - Math.floor(DOT_WINDOW / 2), 0), n - DOT_WINDOW)
  const end = Math.min(n, start + DOT_WINDOW)
  const list = []
  for (let i = start; i < end; i++) {
    const near = Math.max(0, 1 - Math.abs(i - f))
    // The two dots at an edge with more beyond it shrink, as a page control's do.
    let scale = 1
    if (start > 0 && i <= start + 1)
      scale = i === start ? 0.5 : 0.75
    if (end < n && i >= end - 2)
      scale = Math.min(scale, i === end - 1 ? 0.5 : 0.75)
    list.push({
      index: i,
      current: i === props.current,
      label: props.formatter(i + 1, n, props.items[i]?.name),
      mark: {
        width: `${6 + 12 * near}px`,
        opacity: `${0.45 + 0.55 * near}`,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
      },
    })
  }
  return list
})

// Focus in the strip follows the current picture, so the arrow keys never strand it.
watch(() => props.current, () => {
  const strip = stripRef.value
  if (strip && hasDocument() && strip.contains(document.activeElement))
    nextTick(() => strip.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true }))
})

onBeforeUnmount(() => {
  if (jumpTimer !== undefined)
    clearTimeout(jumpTimer)
})
</script>

<template>
  <div
    v-if="kind === 'thumbnails'"
    ref="stripRef"
    class="tx-image-preview__strip tx-image-preview__chrome"
    :class="{ 'is-scrubbing': scrubbing }"
    role="group"
    :aria-label="label"
    @pointerdown="onPointerDown"
    @pointermove="scrub.pointermove"
    @pointerup="scrub.pointerup"
    @pointercancel="scrub.pointercancel"
    @lostpointercapture="scrub.lostpointercapture"
    @dragstart.prevent
  >
    <!-- is-jumping goes on each cell, not on the strip: Vue sets a parent's class after its
         children's styles, and a new tabindex on the focused cell makes the browser compute
         styles in between, so the cells would land before the strip's transition arrived. -->
    <button
      v-for="cell in cells"
      :key="cell.index"
      type="button"
      class="tx-image-preview__cell"
      :class="{ 'is-current': cell.current, 'is-jumping': jumping }"
      :style="cell.style"
      :tabindex="cell.current ? 0 : -1"
      :aria-label="cell.label"
      :aria-current="cell.current ? 'true' : undefined"
      @click="jumpTo(cell.index)"
    >
      <span v-if="cell.failed" class="tx-image-preview__cell-failed" aria-hidden="true" />
      <img v-else :src="cell.src" alt="" draggable="false" loading="lazy" decoding="async" @load="onThumbLoad" @error="onThumbError">
    </button>
  </div>

  <div
    v-else
    ref="stripRef"
    class="tx-image-preview__dots tx-image-preview__chrome"
    :class="{ 'is-scrubbing': scrubbing }"
    role="group"
    :aria-label="label"
    @pointerdown="onPointerDown"
    @pointermove="scrub.pointermove"
    @pointerup="scrub.pointerup"
    @pointercancel="scrub.pointercancel"
    @lostpointercapture="scrub.lostpointercapture"
  >
    <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" fake v-bind="material" />
    <button
      v-for="dot in dots"
      :key="dot.index"
      type="button"
      class="tx-image-preview__dot"
      :tabindex="dot.current ? 0 : -1"
      :aria-label="dot.label"
      :aria-current="dot.current ? 'true' : undefined"
      @click="jumpTo(dot.index)"
    >
      <span class="tx-image-preview__dot-mark tx-image-preview__part" :class="{ 'is-jumping': jumping }" :style="dot.mark" />
    </button>
  </div>
</template>

<style lang="scss">
@use './preview-shared' as *;

// The thumbnails have no material behind them, so the strip fades as a whole.

.tx-image-preview__strip {
  position: absolute;
  bottom: calc(78px + env(safe-area-inset-bottom));
  left: 50%;
  width: min(calc(100% - 32px), 760px);
  height: 50px;
  overflow: hidden;
  opacity: var(--tx-image-preview-chrome, 1);
  transform: translateX(-50%);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
}

.tx-image-preview__cell {
  position: absolute;
  top: 4px;
  left: 50%;
  box-sizing: border-box;
  height: 42px;
  padding: 0;
  overflow: hidden;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    -webkit-user-drag: none;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-image-preview-ink);
    outline-offset: 2px;
  }
}

.tx-image-preview__cell-failed {
  display: block;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.12);
}

.tx-image-preview__cell.is-jumping {
  transition:
    transform 0.32s var(--tx-image-preview-bounce-ease),
    width 0.32s var(--tx-image-preview-bounce-ease),
    opacity 0.32s ease;
}

.tx-image-preview__dots {
  position: absolute;
  bottom: calc(82px + env(safe-area-inset-bottom));
  left: 50%;
  isolation: isolate;
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
  transform: translateX(-50%);
}

.tx-image-preview__dot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 4px;
  border: none;
  border-radius: 999px;
  background: none;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--tx-image-preview-ink);
    outline-offset: -2px;
  }
}

.tx-image-preview__dot-mark {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--tx-image-preview-ink);
}

.tx-image-preview__dot-mark.is-jumping {
  transition:
    width 0.32s var(--tx-image-preview-bounce-ease),
    transform 0.32s var(--tx-image-preview-bounce-ease);
}

@media #{$tx-image-preview-phone} {
  .tx-image-preview__strip {
    bottom: calc(62px + env(safe-area-inset-bottom));
  }

  .tx-image-preview__dots {
    bottom: calc(66px + env(safe-area-inset-bottom));
  }

  .tx-image-preview:not(.has-actions) .tx-image-preview__strip {
    bottom: calc(8px + env(safe-area-inset-bottom));
  }

  .tx-image-preview:not(.has-actions) .tx-image-preview__dots {
    bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
</style>
