<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prefersReducedMotion, useGalleryVisible } from './use-gallery-loop'

const props = defineProps<{
  /** Plugin names in the page's language, keyed by plugin id. */
  names: Record<string, string>
}>()

const chips = [
  { id: 'clipboard', icon: 'i-carbon-copy' },
  { id: 'browser', icon: 'i-carbon-earth' },
  { id: 'actions', icon: 'i-carbon-flash' },
  { id: 'windows', icon: 'i-carbon-window-base' },
  { id: 'scripts', icon: 'i-carbon-terminal' },
  { id: 'system', icon: 'i-carbon-settings' },
  { id: 'intelligence', icon: 'i-carbon-machine-learning-model' },
]

const trackRef = ref<HTMLElement | null>(null)
const paused = ref(false)
const visible = useGalleryVisible()

let frame = 0
let position = 0
let last = 0
let reduced = false
let viewportEl: HTMLElement | null = null
let segmentEl: HTMLElement | null = null

function stopLoop() {
  if (frame) {
    cancelAnimationFrame(frame)
    frame = 0
  }
}

function tick(now: number) {
  frame = 0
  if (!viewportEl || !segmentEl || !visible.value || paused.value || reduced)
    return

  const elapsed = Math.min(now - last, 100)
  last = now
  position += elapsed * 0.032
  const period = segmentEl.offsetWidth
  if (period > 0 && position >= period + 2)
    position -= period
  viewportEl.scrollLeft = position

  frame = requestAnimationFrame(tick)
}

function syncLoop() {
  if (!viewportEl || !segmentEl || reduced || paused.value || !visible.value) {
    stopLoop()
    return
  }
  if (!frame) {
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }
}

watch([visible, paused], syncLoop)

// Scrolls the mask's own viewport rather than translating the track: the
// component decides each edge's fade from the real `scrollLeft`, so a CSS
// marquee left the leading edge hard-cut forever. Two identical segments make
// the loop seamless, and wrapping to 2px instead of 0 keeps the leading fade
// from blinking off at the seam (the threshold is 1px).
onMounted(() => {
  const track = trackRef.value
  const viewport = track?.parentElement ?? null
  const segment = (track?.firstElementChild as HTMLElement | null) ?? null
  if (!track || !viewport || !segment)
    return

  viewportEl = viewport
  segmentEl = segment
  reduced = prefersReducedMotion()

  if (reduced) {
    viewport.scrollLeft = segment.offsetWidth / 2
    return
  }

  syncLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  viewportEl = null
  segmentEl = null
})
</script>

<template>
  <div
    class="docs-gallery__block docs-gallery__marquee"
    @pointerenter="paused = true"
    @pointerleave="paused = false"
  >
    <TxEdgeFadeMask axis="horizontal" :size="56">
      <div ref="trackRef" class="docs-gallery__marquee-track">
        <span
          v-for="copyIndex in 2"
          :key="copyIndex"
          class="docs-gallery__marquee-segment"
          :aria-hidden="copyIndex === 2 || undefined"
        >
          <span v-for="chip in chips" :key="chip.id" class="docs-gallery__marquee-chip">
            <span :class="chip.icon" aria-hidden="true" />
            {{ props.names[chip.id] }}
          </span>
        </span>
      </div>
    </TxEdgeFadeMask>
  </div>
</template>
