<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

// Back to top for the docs. It floats 24px off the bottom of the viewport — in
// the middle of the right gutter beside the docs frame (840 + 230 + 240 + 4rem
// = 1374px) on wide screens, in the corner otherwise — and once the footer
// rises to it, it docks on the footer's top edge, centred on that line, and
// rides up with it. A ring around it fills with how far down the page is read.

const visible = ref(false)
const progress = ref(0)
/** How far the button has been lifted to sit on the footer's top edge, in px (≤ 0). */
const dockY = ref(0)
const docked = ref(false)
const prefersReducedMotion = ref(false)
const visibilityThreshold = 240

const RING_RADIUS = 19
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const ringOffset = computed(() => RING_LENGTH * (1 - progress.value))

const FLOAT_BOTTOM = 24
const BUTTON_SIZE = 42

let frame = 0

function measure() {
  frame = 0
  const max = document.documentElement.scrollHeight - window.innerHeight
  visible.value = window.scrollY > visibilityThreshold
  progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0

  // Where the centre rests while floating, and where the footer's edge is now.
  const size = window.innerWidth <= 640 ? 40 : BUTTON_SIZE
  const bottom = window.innerWidth <= 640 ? 16 : FLOAT_BOTTOM
  const restCentre = window.innerHeight - bottom - size / 2
  const footer = document.querySelector<HTMLElement>('.docs-layout-footer')
  const line = footer ? footer.getBoundingClientRect().top : Number.POSITIVE_INFINITY
  docked.value = line <= restCentre
  dockY.value = docked.value ? Math.round(line - restCentre) : 0
}

function onScroll() {
  if (!frame)
    frame = requestAnimationFrame(measure)
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion.value ? 'auto' : 'smooth' })
}

// The page keeps growing after the last scroll (the footer and comments mount
// lazily), which moves the footer without a scroll event; re-measure on that.
let resizeObserver: ResizeObserver | null = null

let motionQuery: MediaQueryList | null = null
let motionListener: ((event: MediaQueryListEvent) => void) | null = null

onMounted(() => {
  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onScroll)
    resizeObserver.observe(document.body)
  }

  if ('matchMedia' in window) {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.value = motionQuery.matches
    motionListener = (event) => {
      prefersReducedMotion.value = event.matches
    }
    if (motionQuery.addEventListener)
      motionQuery.addEventListener('change', motionListener)
    else if (motionQuery.addListener)
      motionQuery.addListener(motionListener)
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (frame)
    cancelAnimationFrame(frame)
  if (motionQuery && motionListener) {
    if (motionQuery.removeEventListener)
      motionQuery.removeEventListener('change', motionListener)
    else if (motionQuery.removeListener)
      motionQuery.removeListener(motionListener)
  }
})
</script>

<template>
  <Transition name="back-to-top">
    <button
      v-show="visible"
      type="button"
      class="back-to-top"
      :class="{ 'is-docked': docked }"
      :style="{ translate: `0 ${dockY}px` }"
      aria-label="Back to top"
      @click="scrollToTop"
    >
      <svg class="back-to-top__ring" viewBox="0 0 42 42" aria-hidden="true">
        <circle class="back-to-top__track" cx="21" cy="21" :r="RING_RADIUS" />
        <circle
          class="back-to-top__progress"
          cx="21"
          cy="21"
          :r="RING_RADIUS"
          :stroke-dasharray="RING_LENGTH"
          :stroke-dashoffset="ringOffset"
        />
      </svg>
      <svg class="back-to-top__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M10 15.5V4.5M5.5 9 10 4.5 14.5 9" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: rgba(15, 23, 42, 0.72);
  cursor: pointer;
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.26),
    0 14px 30px rgba(15, 23, 42, 0.12);
  transition:
    background-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease;
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
}

/* Middle of the right gutter once there is a gutter to sit in. The lift onto
   the footer line is `translate`, kept apart from the enter/leave `transform`. */
@media (min-width: 1520px) {
  .back-to-top {
    right: calc((100vw - 1374px) / 4 - 21px);
  }
}

.back-to-top:hover,
.back-to-top:focus-visible {
  color: rgba(37, 99, 235, 0.95);
  outline: none;
}

.back-to-top:focus-visible {
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.26),
    0 0 0 3px rgba(64, 158, 255, 0.45);
}

.back-to-top__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.back-to-top__track,
.back-to-top__progress {
  fill: none;
  stroke-width: 1.5;
}

.back-to-top__track {
  stroke: rgba(148, 163, 184, 0.22);
}

.back-to-top__progress {
  stroke: currentColor;
  stroke-linecap: round;
  transition: stroke-dashoffset 120ms linear;
}


.back-to-top__icon {
  position: relative;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 260ms cubic-bezier(0.23, 1, 0.32, 1);
}

.back-to-top:hover .back-to-top__icon {
  transform: translateY(-2px);
}

.back-to-top:active .back-to-top__icon {
  transform: translateY(-4px);
}

/* In: out of a blur, a little small, settling on a soft overshoot.
   Out: shrinks back into the blur, quicker than it came. */
.back-to-top-enter-active {
  transition:
    opacity 260ms ease,
    transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 360ms ease;
}

.back-to-top-leave-active {
  transition:
    opacity 200ms ease,
    transform 240ms cubic-bezier(0.4, 0, 1, 1),
    filter 200ms ease;
}

.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.6);
  filter: blur(6px);
}

@media (max-width: 640px) {
  .back-to-top {
    right: 16px;
    bottom: 16px;
    width: 40px;
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .back-to-top,
  .back-to-top-enter-active,
  .back-to-top-leave-active,
  .back-to-top__icon,
  .back-to-top__progress {
    transition: none;
  }
}

/* The dark rules were written as ::global(), which Vue does not recognise, so
   the light glass showed on dark pages. :global() has to wrap the whole
   selector: Vue keeps only what is inside it and drops anything after. */
:global(.dark .back-to-top),
:global([data-theme='dark'] .back-to-top) {
  background: rgba(20, 22, 28, 0.72);
  color: rgba(246, 247, 244, 0.78);
  box-shadow:
    inset 0 0 0 1px rgba(246, 247, 244, 0.12),
    0 14px 34px rgba(0, 0, 0, 0.5);
}

:global(.dark .back-to-top:hover),
:global([data-theme='dark'] .back-to-top:hover) {
  background: rgba(32, 35, 44, 0.86);
  color: #fff;
}

:global(.dark .back-to-top__track),
:global([data-theme='dark'] .back-to-top__track) {
  stroke: rgba(246, 247, 244, 0.12);
}
</style>
