<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TuffShowcaseSearch from './TuffShowcaseSearch.vue'

interface ShowcaseSlideScenario {
  id: string
  label: string
  focus: string
  query: string
  summary: string
  insight: string
  references?: string[]
  results: Array<{
    id: string
    title: string
    description: string
    badge?: string
    confidence?: string
    category?: string
  }>
}

interface ShowcaseSlide {
  id: string
  label: string
  caption?: string
  scenario?: ShowcaseSlideScenario | null
}

const ROTATION_DURATION = 5000

const slides: ShowcaseSlide[] = [
  { id: 'case-01', label: 'Search', caption: '', scenario: null },
  { id: 'case-02', label: 'AI Power', caption: '', scenario: null },
  { id: 'case-03', label: 'Contextual', caption: '', scenario: null },
]

const rotationDuration = ROTATION_DURATION
const currentIndex = ref(0)
const prefersReducedMotionSetting = usePreferredReducedMotion()
const prefersReducedMotion = computed(() => prefersReducedMotionSetting.value === 'reduce')
const motionDirection = ref<'next' | 'prev'>('next')
const progress = ref(0)
const isPointerInside = ref(false)

type FrameHandle = number | ReturnType<typeof setTimeout>

let rotationTimeout: ReturnType<typeof setTimeout> | null = null
let progressRaf: FrameHandle | null = null
let deadline = 0
let remainingTime = rotationDuration

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function')
    return performance.now()
  return Date.now()
}

function scheduleFrame(cb: FrameRequestCallback): FrameHandle {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
    return window.requestAnimationFrame(cb)
  return setTimeout(() => cb(now()), 16)
}

function cancelFrame(handle: FrameHandle) {
  if (
    typeof window !== 'undefined'
    && typeof window.cancelAnimationFrame === 'function'
    && typeof handle === 'number'
  ) {
    window.cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>)
}

const activeSlide = computed(() => slides[currentIndex.value] ?? null)
const motionTransitionName = computed(() =>
  motionDirection.value === 'next' ? 'carousel-next' : 'carousel-prev',
)
function setCurrentIndex(index: number, direction?: 'next' | 'prev') {
  if (!slides.length)
    return

  const total = slides.length
  const normalized = (index + total) % total

  if (direction) {
    motionDirection.value = direction
  }
  else if (normalized !== currentIndex.value) {
    const forwardDistance = (normalized - currentIndex.value + total) % total
    const backwardDistance = (currentIndex.value - normalized + total) % total
    motionDirection.value = forwardDistance <= backwardDistance ? 'next' : 'prev'
  }

  currentIndex.value = normalized
}

function nextSlide() {
  setCurrentIndex(currentIndex.value + 1, 'next')
}

function clearTimers() {
  if (rotationTimeout !== null) {
    clearTimeout(rotationTimeout)
    rotationTimeout = null
  }

  if (progressRaf !== null) {
    cancelFrame(progressRaf)
    progressRaf = null
  }
}

function updateProgress() {
  if (rotationTimeout === null) {
    progressRaf = null
    return
  }

  const current = now()
  const timeLeft = Math.max(deadline - current, 0)
  const total = rotationDuration || 1
  const nextProgress = Math.min(Math.max(1 - (timeLeft / total), 0), 1)
  progress.value = nextProgress

  if (timeLeft <= 0) {
    progressRaf = null
    return
  }

  progressRaf = scheduleFrame(updateProgress)
}

function handleAutoplayTick() {
  clearTimers()
  progress.value = 1
  remainingTime = rotationDuration
  nextSlide()
  startRotation({ resetElapsed: true })
}

interface StartRotationOptions {
  resetElapsed?: boolean
}

function startRotation(options: StartRotationOptions = {}) {
  const { resetElapsed = false } = options

  if (slides.length <= 1 || prefersReducedMotion.value || isPointerInside.value)
    return

  clearTimers()

  remainingTime = resetElapsed
    ? rotationDuration
    : Math.min(Math.max(remainingTime, 0), rotationDuration)

  if (remainingTime <= 0)
    remainingTime = rotationDuration

  const current = now()
  deadline = current + remainingTime
  progress.value = resetElapsed
    ? 0
    : Math.min(Math.max(1 - (remainingTime / rotationDuration), 0), 1)

  rotationTimeout = setTimeout(handleAutoplayTick, remainingTime)
  progressRaf = scheduleFrame(updateProgress)
}

function pauseRotation() {
  if (rotationTimeout === null)
    return

  const current = now()
  remainingTime = Math.max(deadline - current, 0)
  clearTimers()
}

function stopRotation() {
  clearTimers()
  remainingTime = rotationDuration
  progress.value = 0
  deadline = 0
}

function handleSelect(index: number) {
  if (index === currentIndex.value || !slides.length)
    return

  stopRotation()
  setCurrentIndex(index)
  if (!isPointerInside.value)
    startRotation({ resetElapsed: true })
}

function handleMouseEnter() {
  isPointerInside.value = true
  pauseRotation()
}

function handleMouseLeave() {
  isPointerInside.value = false
  startRotation()
}

onMounted(() => {
  if (!prefersReducedMotion.value)
    startRotation({ resetElapsed: true })
})

onBeforeUnmount(() => {
  stopRotation()
})

watch(prefersReducedMotion, (enabled) => {
  if (enabled) {
    stopRotation()
  }
  else {
    startRotation({ resetElapsed: true })
  }
})
</script>

<template>
  <div
    class="tuff-showcase-displayer"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="tuff-showcase-displayer__viewport flex-1">
      <Transition
        v-if="activeSlide"
        :name="motionTransitionName"
        mode="out-in"
      >
        <component
          :is="TuffShowcaseSearch"
          :key="activeSlide.id"
          :scenario="activeSlide.scenario"
          active
        />
      </Transition>
    </div>

    <header
      v-if="activeSlide?.caption"
      class="tuff-showcase-displayer__caption"
    >
      <span class="tuff-showcase-displayer__caption-label">
        {{ activeSlide.label }}
      </span>
      <p>
        {{ activeSlide.caption }}
      </p>
    </header>

    <div class="tuff-showcase-displayer__controls">
      <ul class="tuff-showcase-displayer__timeline" aria-label="Showcase selection">
        <li
          v-for="(slide, index) in slides"
          :key="slide.id"
        >
          <button
            type="button"
            class="tuff-showcase-displayer__timeline-button"
            :class="{ 'is-active': index === currentIndex }"
            :style="{ '--showcase-progress': (index === currentIndex) ? `${progress * 100}%` : 0 }"
            :aria-pressed="index === currentIndex"
            @click="handleSelect(index)"
          >
            <span class="tuff-showcase-displayer__timeline-label">
              {{ slide.label }}
            </span>
            <div class="tuff-showcase-displayer__timeline-button-indicator" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.tuff-showcase-displayer {
  position: relative;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  width: min(100%, 880px);
  height: 100%;
}

.tuff-showcase-displayer__viewport {
  position: relative;
  z-index: 1;
  min-height: clamp(320px, 45vw, 480px);
  display: grid;
  align-items: stretch;

  backdrop-filter: blur(18px) saturate(180%);
}

.carousel-next-enter-active,
.carousel-next-leave-active,
.carousel-prev-enter-active,
.carousel-prev-leave-active {
  transition:
    opacity 520ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 520ms cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 520ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.carousel-next-enter-from {
  opacity: 0;
  transform: translate3d(64px, 0, 0) scale(0.98);
  filter: blur(18px);
}

.carousel-next-leave-to {
  opacity: 0;
  transform: translate3d(-64px, 0, 0) scale(0.985);
  filter: blur(14px);
}

.carousel-prev-enter-from {
  opacity: 0;
  transform: translate3d(-64px, 0, 0) scale(0.98);
  filter: blur(18px);
}

.carousel-prev-leave-to {
  opacity: 0;
  transform: translate3d(64px, 0, 0) scale(0.985);
  filter: blur(14px);
}

.tuff-showcase-displayer__caption {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding-inline: clamp(0.25rem, 1vw, 0.4rem);
  color: rgba(218, 225, 250, 0.78);
}

.tuff-showcase-displayer__caption-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 500;
  color: rgba(168, 176, 224, 0.65);
}

.tuff-showcase-displayer__caption p {
  margin: 0;
  font-size: clamp(0.84rem, 0.35vw + 0.76rem, 0.98rem);
  line-height: 1.55;
  color: rgba(210, 214, 238, 0.7);
}

.tuff-showcase-displayer__controls {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: clamp(0.85rem, 0.6vw + 0.65rem, 1.25rem);
}

.tuff-showcase-displayer__timeline {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.6rem, 0.9vw, 1.1rem);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tuff-showcase-displayer__timeline-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  background: #161616;
  border: none;
  color: #eee;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 500;
  cursor: pointer;
  transition: all cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tuff-showcase-displayer__timeline-button::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff6bcb, #ffa63f, #fffb7d, #38f9d7, #4776e6, #b967ff, #ff6bcb);
  opacity: 0;
  filter: blur(12px);
  transition: opacity 320ms ease;
}

.tuff-showcase-displayer__timeline-button-indicator {
  position: absolute;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  pointer-events: none;
}

.tuff-showcase-displayer__timeline-button-indicator::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.75;
  width: var(--showcase-progress, 0);
  background: #fff;
}

.tuff-showcase-displayer__timeline-button:hover,
.tuff-showcase-displayer__timeline-button:focus-visible {
  color: #ddd;
  background: #212121;
  outline: none;
  transform: translate3d(0, 1px, 0);
}

.tuff-showcase-displayer__timeline-button.is-active {
  color: #fff;
  background: #121212a0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.tuff-showcase-displayer__timeline-button.is-active::before {
  opacity: 0.5;
  animation: showcase-timeline-button-glow 2.5s ease-in-out both infinite;
}

@keyframes showcase-timeline-button-glow {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
  }
}

.tuff-showcase-displayer__timeline-label {
  white-space: nowrap;
}

@media (max-width: 820px) {
  .tuff-showcase-displayer {
    gap: 1.25rem;
  }

  .tuff-showcase-displayer__controls {
    flex-direction: column;
    align-items: stretch;
  }

  .tuff-showcase-displayer__timeline {
    justify-content: space-between;
    flex-wrap: wrap;
    row-gap: 0.65rem;
  }

  .tuff-showcase-displayer__timeline-button {
    width: 100%;
    text-align: center;
  }
}

@media (max-width: 520px) {
  .tuff-showcase-displayer__timeline {
    flex-direction: column;
    align-items: stretch;
  }

  .tuff-showcase-displayer__timeline-button {
    justify-content: center;
  }

  .tuff-showcase-displayer__timeline-label {
    white-space: normal;
  }
}
</style>
