<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { usePreferredReducedMotion } from '@vueuse/core'
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TuffShowcaseSearch from './TuffShowcaseSearch.vue'
import TuffShowcaseTimelineButton from './TuffShowcaseTimelineButton.vue'

interface ShowcaseSlideScenario {
  id: string
  label: string
  focus: string
  query: string
  summary: string
  insight: string
  references?: string[]
  results?: Array<{
    id: string
    title: string
    subtitle: string
    icon?: string
    source?: string
    quickKey?: string
    active?: boolean
  }>
  media?: {
    src: string
    poster?: string
    alt: string
  }
}

interface ShowcaseSlide {
  id: string
  label: string
  caption?: string
  scenario?: ShowcaseSlideScenario | null
}

const { t } = useI18n()

const DEFAULT_ROTATION_DURATION = 5000
const INCOMING_DELAY = 0.02

const slides = computed<ShowcaseSlide[]>(() => [
  {
    id: 'case-01',
    label: t('landing.os.aiSpotlight.corebox.slides.search.label'),
    caption: '',
    scenario: {
      id: 'corebox-search',
      label: t('landing.os.aiSpotlight.corebox.slides.search.label'),
      focus: t('landing.os.aiSpotlight.corebox.slides.search.focus'),
      query: t('landing.os.aiSpotlight.corebox.slides.search.query'),
      summary: '',
      insight: '',
      references: [],
      media: {
        src: '/shots/SearchApp.mp4',
        alt: t('landing.os.aiSpotlight.corebox.slides.search.alt'),
      },
      results: [],
    },
  },
  {
    id: 'case-02',
    label: t('landing.os.aiSpotlight.corebox.slides.file.label'),
    caption: '',
    scenario: {
      id: 'corebox-files',
      label: t('landing.os.aiSpotlight.corebox.slides.file.label'),
      focus: t('landing.os.aiSpotlight.corebox.slides.file.focus'),
      query: t('landing.os.aiSpotlight.corebox.slides.file.query'),
      summary: '',
      insight: '',
      references: [],
      media: {
        src: '/shots/SearchFileImmediately.mp4',
        poster: '/shots/SearchFileImmediately.jpg',
        alt: t('landing.os.aiSpotlight.corebox.slides.file.alt'),
      },
      results: [],
    },
  },
  {
    id: 'case-03',
    label: t('landing.os.aiSpotlight.corebox.slides.tool.label'),
    caption: '',
    scenario: {
      id: 'corebox-tools',
      label: t('landing.os.aiSpotlight.corebox.slides.tool.label'),
      focus: t('landing.os.aiSpotlight.corebox.slides.tool.focus'),
      query: t('landing.os.aiSpotlight.corebox.slides.tool.query'),
      summary: '',
      insight: '',
      references: [],
      media: {
        src: '/shots/PluginTranslate.mp4',
        alt: t('landing.os.aiSpotlight.corebox.slides.tool.alt'),
      },
      results: [],
    },
  },
])

const currentIndex = ref(0)
const progress = ref(0)
const isPointerInside = ref(false)
const isAnimating = ref(false)
const mediaEnabled = ref(false)

const viewportRef = ref<HTMLElement | null>(null)
const renderedSlides = ref<ShowcaseSlide[]>([])
const outgoingSlideId = ref<string | null>(null)
const incomingSlideId = ref<string | null>(null)
const slideDurations = ref<number[]>([])

const prefersReducedMotionSetting = usePreferredReducedMotion()
const prefersReducedMotion = computed(() => prefersReducedMotionSetting.value === 'reduce')

type FrameHandle = number | ReturnType<typeof setTimeout>

let rotationTimeout: ReturnType<typeof setTimeout> | null = null
let progressRaf: FrameHandle | null = null
let deadline = 0
let remainingTime = DEFAULT_ROTATION_DURATION
let currentDuration = DEFAULT_ROTATION_DURATION
let transitionTimeline: gsap.core.Timeline | null = null
let revealTween: gsap.core.Tween | null = null
let queuedIndex: number | null = null
let queuedResume = false
let mediaObserver: IntersectionObserver | null = null

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function')
    return performance.now()
  return Date.now()
}

function scheduleFrame(cb: FrameRequestCallback): FrameHandle {
  if (hasWindow() && window.requestAnimationFrame)
    return window.requestAnimationFrame(cb)
  return setTimeout(() => cb(now()), 16)
}

function cancelFrame(handle: FrameHandle) {
  if (hasWindow()
    && window.cancelAnimationFrame
    && typeof handle === 'number') {
    window.cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>)
}

function activateMedia() {
  if (mediaEnabled.value)
    return

  mediaEnabled.value = true
  mediaObserver?.disconnect()
  mediaObserver = null

  nextTick(() => {
    if (!prefersReducedMotion.value)
      startRotation({ resetElapsed: true })
    playInitialReveal()
  })
}

function handleMediaDuration(slideId: string, durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    return

  const index = slides.value.findIndex(slide => slide.id === slideId)
  if (index < 0)
    return

  const durations = [...slideDurations.value]
  durations[index] = durationMs
  slideDurations.value = durations

  if (index === currentIndex.value && mediaEnabled.value && !prefersReducedMotion.value)
    startRotation({ resetElapsed: true })
}

function normalizeIndex(index: number) {
  const total = slides.value.length
  if (!total)
    return 0
  return (index + total) % total
}

function resolveDirection(targetIndex: number): 'next' | 'prev' {
  const total = slides.value.length
  if (total <= 1)
    return 'next'

  const normalized = normalizeIndex(targetIndex)
  const forwardDistance = (normalized - currentIndex.value + total) % total
  const backwardDistance = (currentIndex.value - normalized + total) % total
  return forwardDistance <= backwardDistance ? 'next' : 'prev'
}

function getActiveDuration() {
  return slideDurations.value[currentIndex.value] ?? DEFAULT_ROTATION_DURATION
}

const activeSlide = computed(() => slides.value[currentIndex.value] ?? null)

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
  const total = currentDuration || 1
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
  transitionTo(currentIndex.value + 1, 'next', { resume: true })
}

interface StartRotationOptions {
  resetElapsed?: boolean
}

function startRotation(options: StartRotationOptions = {}) {
  const { resetElapsed = false } = options

  if (!mediaEnabled.value || slides.value.length <= 1 || prefersReducedMotion.value || isPointerInside.value || isAnimating.value)
    return

  clearTimers()

  currentDuration = getActiveDuration()
  remainingTime = resetElapsed
    ? currentDuration
    : Math.min(Math.max(remainingTime, 0), currentDuration)

  if (remainingTime <= 0)
    remainingTime = currentDuration

  const current = now()
  deadline = current + remainingTime
  progress.value = resetElapsed
    ? 0
    : Math.min(Math.max(1 - (remainingTime / currentDuration), 0), 1)

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
  remainingTime = getActiveDuration()
  progress.value = 0
  deadline = 0
}

function syncRenderedSlides() {
  const list = slides.value
  if (!list.length) {
    renderedSlides.value = []
    return
  }

  if (isAnimating.value)
    return

  const active = list[normalizeIndex(currentIndex.value)] ?? list[0]
  renderedSlides.value = active ? [active] : []
}

function playSlideTransition(
  outgoingEl: HTMLElement,
  incomingEl: HTMLElement,
  direction: 'next' | 'prev',
  onComplete: () => void,
) {
  transitionTimeline?.kill()

  const isNext = direction === 'next'
  const outgoingFinalX = isNext ? -220 : 220
  const incomingStartX = isNext ? 220 : -220
  const outgoingOrigin = isNext ? 'left center' : 'right center'
  const incomingOrigin = isNext ? 'right center' : 'left center'

  transitionTimeline = gsap.timeline({
    onComplete: () => {
      gsap.set([outgoingEl, incomingEl], { clearProps: 'transform,opacity,willChange' })
      onComplete()
    },
  })

  transitionTimeline
    .set([outgoingEl, incomingEl], { willChange: 'transform, opacity, filter' })
    .set(outgoingEl, {
      transformOrigin: outgoingOrigin,
      zIndex: 1,
      pointerEvents: 'none',
    })
    .set(incomingEl, {
      transformOrigin: incomingOrigin,
      zIndex: 2,
      opacity: 0,
      pointerEvents: 'none',
    })
    .fromTo(outgoingEl, {
      filter: 'blur(0px)',
      rotateY: 0,
      z: 0,
    }, {
      duration: 0.6,
      xPercent: outgoingFinalX,
      scaleX: 0.02,
      scaleY: 0.78,
      rotateY: isNext ? 42 : -42,
      z: -180,
      opacity: 0,
      filter: 'blur(14px)',
      ease: 'power3.in',
    })
    .fromTo(incomingEl, {
      opacity: 0.2,
      xPercent: incomingStartX,
      scaleX: 0.02,
      scaleY: 0.78,
      filter: 'blur(12px)',
    }, {
      duration: 0.7,
      opacity: 1,
      xPercent: 0,
      scaleX: 1,
      scaleY: 1,
      filter: 'blur(0px)',
      ease: 'power3.out',
    }, INCOMING_DELAY)
}

async function transitionTo(
  targetIndex: number,
  direction?: 'next' | 'prev',
  options: { resume?: boolean } = {},
) {
  if (!slides.value.length)
    return

  const normalized = normalizeIndex(targetIndex)
  if (normalized === currentIndex.value)
    return

  if (isAnimating.value) {
    queuedIndex = normalized
    queuedResume = options.resume ?? false
    return
  }

  const resolvedDirection = direction ?? resolveDirection(normalized)

  const outgoingSlide = slides.value[currentIndex.value]
  const incomingSlide = slides.value[normalized]

  if (!outgoingSlide || !incomingSlide) {
    currentIndex.value = normalized
    syncRenderedSlides()
    if (options.resume)
      startRotation({ resetElapsed: true })
    return
  }

  if (!hasWindow() || prefersReducedMotion.value) {
    currentIndex.value = normalized
    renderedSlides.value = [incomingSlide]
    outgoingSlideId.value = null
    incomingSlideId.value = null
    if (options.resume)
      startRotation({ resetElapsed: true })
    return
  }

  isAnimating.value = true
  outgoingSlideId.value = outgoingSlide.id
  incomingSlideId.value = incomingSlide.id
  renderedSlides.value = outgoingSlide.id === incomingSlide.id
    ? [incomingSlide]
    : [outgoingSlide, incomingSlide]

  await nextTick()

  const viewport = viewportRef.value
  const outgoingEl = viewport?.querySelector<HTMLElement>(`[data-slide-id="${outgoingSlide.id}"]`)
  const incomingEl = viewport?.querySelector<HTMLElement>(`[data-slide-id="${incomingSlide.id}"]`)

  if (!outgoingEl || !incomingEl) {
    currentIndex.value = normalized
    renderedSlides.value = [incomingSlide]
    isAnimating.value = false
    outgoingSlideId.value = null
    incomingSlideId.value = null
    if (options.resume)
      startRotation({ resetElapsed: true })
    return
  }

  playSlideTransition(outgoingEl, incomingEl, resolvedDirection, () => {
    isAnimating.value = false
    outgoingSlideId.value = null
    incomingSlideId.value = null
    currentIndex.value = normalized
    renderedSlides.value = [incomingSlide]
    progress.value = 0

    if (queuedIndex !== null && queuedIndex !== normalized) {
      const nextIndex = queuedIndex
      const nextResume = queuedResume
      queuedIndex = null
      queuedResume = false
      transitionTo(nextIndex, undefined, { resume: nextResume })
      return
    }

    if (options.resume)
      startRotation({ resetElapsed: true })
  })
}

function playInitialReveal() {
  if (!hasWindow() || prefersReducedMotion.value || !viewportRef.value)
    return

  revealTween?.kill()
  revealTween = gsap.fromTo(
    viewportRef.value,
    { opacity: 0, scale: 1.06 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.7,
      ease: 'expo.out',
      clearProps: 'transform,opacity',
    },
  )
}

function handleSelect(index: number) {
  if (index === currentIndex.value || !slides.value.length)
    return

  stopRotation()
  if (isAnimating.value) {
    transitionTimeline?.kill()
    transitionTimeline = null
    queuedIndex = null
    queuedResume = false
    isAnimating.value = false
    outgoingSlideId.value = null
    incomingSlideId.value = null
    syncRenderedSlides()
  }
  transitionTo(index, undefined, { resume: false })
}

function handleMouseEnter() {
  isPointerInside.value = true
  pauseRotation()
}

function handleMouseLeave() {
  isPointerInside.value = false
  startRotation()
}

watch(slides, (list) => {
  if (!list.length) {
    renderedSlides.value = []
    slideDurations.value = []
    return
  }

  if (currentIndex.value >= list.length)
    currentIndex.value = 0

  syncRenderedSlides()
  slideDurations.value = list.map((_, index) => slideDurations.value[index] ?? DEFAULT_ROTATION_DURATION)
}, { immediate: true })

onMounted(() => {
  const target = viewportRef.value
  if (!target || !('IntersectionObserver' in window)) {
    activateMedia()
    return
  }

  mediaObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting))
      activateMedia()
  }, {
    rootMargin: '0px',
    threshold: 0.01,
  })
  mediaObserver.observe(target)
})

onBeforeUnmount(() => {
  stopRotation()
  mediaObserver?.disconnect()
  mediaObserver = null
  transitionTimeline?.kill()
  transitionTimeline = null
  revealTween?.kill()
  revealTween = null
})

watch(prefersReducedMotion, (enabled) => {
  if (enabled) {
    stopRotation()
    transitionTimeline?.kill()
    transitionTimeline = null
    queuedIndex = null
    queuedResume = false
    isAnimating.value = false
    outgoingSlideId.value = null
    incomingSlideId.value = null
    syncRenderedSlides()
    return
  }

  if (!isPointerInside.value)
    startRotation({ resetElapsed: true })

  nextTick(() => {
    playInitialReveal()
  })
})
</script>

<template>
  <div
    class="tuff-showcase-displayer"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div ref="viewportRef" class="tuff-showcase-displayer__viewport flex-1">
      <component
        :is="TuffShowcaseSearch"
        v-for="slide in renderedSlides"
        :key="slide.id"
        :scenario="slide.scenario"
        class="tuff-showcase-displayer__slide"
        :data-slide-id="slide.id"
        :data-slide-state="slide.id === outgoingSlideId ? 'outgoing' : slide.id === incomingSlideId ? 'incoming' : 'active'"
        :media-enabled="mediaEnabled"
        active
        @media-duration="handleMediaDuration(slide.id, $event)"
      />
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
          <TuffShowcaseTimelineButton
            :label="slide.label"
            :active="index === currentIndex"
            :progress="progress"
            @select="handleSelect(index)"
          />
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
  gap: clamp(0.75rem, 1.2vh, 1.2rem);
  width: min(100%, 880px);
  height: 100%;
}

.tuff-showcase-displayer__viewport {
  position: relative;
  z-index: 1;
  /* Fill as much of the section as possible: track the available height so the
     mock media grows on tall displays while still leaving room for the caption
     and the floating pill below. The card hugs this (no fixed aspect box). */
  min-height: clamp(240px, calc(93vh - 470px), 820px);
  display: grid;
  align-items: stretch;
  perspective: 1200px;
  transform-style: preserve-3d;
  backdrop-filter: blur(18px) saturate(180%);
}

.tuff-showcase-displayer__slide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  will-change: transform, opacity;
  backface-visibility: hidden;
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

}

@media (max-width: 520px) {
  .tuff-showcase-displayer__timeline {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

</style>
