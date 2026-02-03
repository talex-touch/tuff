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
        src: '/shots/SearchApp.gif',
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
        src: '/shots/PluginTranslate.gif',
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

const durationCache = new Map<string, number>()
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'm4v'])

function getMediaExtension(src: string): string | null {
  const cleanSrc = src.split('?')[0]?.split('#')[0]
  const match = cleanSrc?.match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : null
}

function isVideoSource(src: string): boolean {
  const extension = getMediaExtension(src)
  return extension ? VIDEO_EXTENSIONS.has(extension) : false
}

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

function parseGifDuration(bytes: Uint8Array) {
  if (bytes.length < 16)
    return 0
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46)
    return 0

  let offset = 6
  if (offset + 7 > bytes.length)
    return 0

  const packed = bytes[offset + 4]
  const hasGct = (packed & 0x80) === 0x80
  const gctSize = 3 * (1 << ((packed & 0x07) + 1))
  offset += 7

  if (hasGct)
    offset += gctSize

  let duration = 0

  while (offset < bytes.length) {
    const blockId = bytes[offset]
    if (blockId === 0x21) {
      const label = bytes[offset + 1]
      if (label === 0xF9) {
        const blockSize = bytes[offset + 2]
        if (blockSize === 4 && offset + 7 < bytes.length) {
          const delay = bytes[offset + 4] | (bytes[offset + 5] << 8)
          if (delay > 0)
            duration += delay * 10
        }
        offset += 3 + blockSize + 1
      }
      else {
        offset += 2
        while (offset < bytes.length) {
          const size = bytes[offset]
          offset += 1
          if (size === 0)
            break
          offset += size
        }
      }
    }
    else if (blockId === 0x2C) {
      if (offset + 9 >= bytes.length)
        break
      const packedField = bytes[offset + 9]
      const hasLct = (packedField & 0x80) === 0x80
      const lctSize = 3 * (1 << ((packedField & 0x07) + 1))
      offset += 10

      if (hasLct)
        offset += lctSize

      if (offset >= bytes.length)
        break

      offset += 1
      while (offset < bytes.length) {
        const size = bytes[offset]
        offset += 1
        if (size === 0)
          break
        offset += size
      }
    }
    else if (blockId === 0x3B) {
      break
    }
    else {
      offset += 1
    }
  }

  return duration
}

async function resolveGifDuration(src: string) {
  if (durationCache.has(src))
    return durationCache.get(src) ?? DEFAULT_ROTATION_DURATION

  const response = await fetch(src)
  const buffer = await response.arrayBuffer()
  const duration = parseGifDuration(new Uint8Array(buffer))
  const normalized = duration > 0 ? duration : DEFAULT_ROTATION_DURATION
  durationCache.set(src, normalized)
  return normalized
}

function resolveVideoDuration(src: string): Promise<number> {
  if (!hasWindow())
    return Promise.resolve(DEFAULT_ROTATION_DURATION)

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoaded)
      video.removeEventListener('error', handleError)
      video.src = ''
    }

    const handleLoaded = () => {
      const duration = Number.isFinite(video.duration)
        ? video.duration * 1000
        : DEFAULT_ROTATION_DURATION
      cleanup()
      resolve(duration)
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Failed to load video metadata.'))
    }

    video.preload = 'metadata'
    video.addEventListener('loadedmetadata', handleLoaded, { once: true })
    video.addEventListener('error', handleError, { once: true })
    video.src = src
    video.load()
  })
}

async function resolveMediaDuration(src: string) {
  if (durationCache.has(src))
    return durationCache.get(src) ?? DEFAULT_ROTATION_DURATION

  if (isVideoSource(src)) {
    const duration = await resolveVideoDuration(src)
    durationCache.set(src, duration)
    return duration
  }

  return resolveGifDuration(src)
}

async function loadSlideDurations(list: ShowcaseSlide[]) {
  if (!hasWindow())
    return

  const durations = await Promise.all(list.map(async (slide) => {
    const src = slide.scenario?.media?.src
    if (!src)
      return DEFAULT_ROTATION_DURATION

    try {
      return await resolveMediaDuration(src)
    }
    catch {
      return DEFAULT_ROTATION_DURATION
    }
  }))

  slideDurations.value = durations
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

  if (slides.value.length <= 1 || prefersReducedMotion.value || isPointerInside.value || isAnimating.value)
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
  void loadSlideDurations(list)
}, { immediate: true })

onMounted(() => {
  if (!prefersReducedMotion.value)
    startRotation({ resetElapsed: true })

  nextTick(() => {
    playInitialReveal()
  })
})

onBeforeUnmount(() => {
  stopRotation()
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
        active
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
</style>
