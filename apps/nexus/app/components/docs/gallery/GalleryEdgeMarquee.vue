<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from './use-gallery-loop'

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
let frame = 0
let onScreen = true
let observer: IntersectionObserver | null = null

// Scrolls the mask's own viewport rather than translating the track: the
// component decides each edge's fade from the real `scrollLeft`, so a CSS
// marquee left the leading edge hard-cut forever. Two identical segments make
// the loop seamless, and wrapping to 2px instead of 0 keeps the leading fade
// from blinking off at the seam (the threshold is 1px).
onMounted(() => {
  const track = trackRef.value
  const viewport = track?.parentElement
  const segment = track?.firstElementChild as HTMLElement | null
  if (!track || !viewport || !segment)
    return

  if (prefersReducedMotion()) {
    viewport.scrollLeft = segment.offsetWidth / 2
    return
  }

  observer = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true
  })
  observer.observe(viewport)

  // Accumulated here, not read back from `scrollLeft`, which rounds.
  let position = 0
  let last = performance.now()
  const tick = (now: number) => {
    const elapsed = now - last
    last = now
    if (onScreen && !paused.value) {
      position += elapsed * 0.032
      const period = segment.offsetWidth
      if (position >= period + 2)
        position -= period
      viewport.scrollLeft = position
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
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
