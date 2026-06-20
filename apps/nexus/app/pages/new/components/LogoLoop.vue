<template>
  <div
    ref="containerRef"
    :class="rootClasses"
    :style="containerStyle"
    role="region"
    :aria-label="ariaLabel"
  >
    <template v-if="fadeOut">
      <template v-if="isVertical">
        <div aria-hidden="true" class="LogoLoop-Fade LogoLoop-Fade--top" />
        <div aria-hidden="true" class="LogoLoop-Fade LogoLoop-Fade--bottom" />
      </template>
      <template v-else>
        <div aria-hidden="true" class="LogoLoop-Fade LogoLoop-Fade--left" />
        <div aria-hidden="true" class="LogoLoop-Fade LogoLoop-Fade--right" />
      </template>
    </template>

    <div
      ref="trackRef"
      class="LogoLoop-Track"
      :class="{ 'LogoLoop-Track--vertical': isVertical }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <ul
        v-for="copyIndex in copyCount"
        :key="`copy-${copyIndex - 1}`"
        :ref="(el) => {
          if (copyIndex === 1)
            seqRef = el as HTMLUListElement | null
        }"
        class="LogoLoop-List"
        :class="{ 'LogoLoop-List--vertical': isVertical }"
        role="list"
        :aria-hidden="copyIndex > 1 ? true : undefined"
      >
        <li
          v-for="(item, itemIndex) in logos"
          :key="`${copyIndex - 1}-${itemIndex}`"
          class="LogoLoop-Item"
          :class="{ 'LogoLoop-Item--vertical': isVertical, 'LogoLoop-Item--hoverable': scaleOnHover }"
          role="listitem"
        >
          <a
            v-if="item.href"
            class="LogoLoop-Link"
            :href="item.href"
            :aria-label="getItemAriaLabel(item) || 'logo link'"
            target="_blank"
            rel="noreferrer noopener"
          >
            <span
              v-if="isNodeItem(item)"
              class="LogoLoop-Logo"
              v-html="item.node"
            />
            <img
              v-else
              class="LogoLoop-Logo LogoLoop-Image"
              :src="item.src"
              :srcset="item.srcSet"
              :sizes="item.sizes"
              :width="item.width"
              :height="item.height"
              :alt="item.alt ?? ''"
              :title="item.title"
              loading="lazy"
              decoding="async"
              draggable="false"
            >
          </a>
          <template v-else>
            <span
              v-if="isNodeItem(item)"
              class="LogoLoop-Logo"
              v-html="item.node"
            />
            <img
              v-else
              class="LogoLoop-Logo LogoLoop-Image"
              :src="item.src"
              :srcset="item.srcSet"
              :sizes="item.sizes"
              :width="item.width"
              :height="item.height"
              :alt="item.alt ?? ''"
              :title="item.title"
              loading="lazy"
              decoding="async"
              draggable="false"
            >
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export interface LogoItemNode {
  node: string
  href?: string
  title?: string
  ariaLabel?: string
}

export interface LogoItemImage {
  src: string
  alt?: string
  href?: string
  title?: string
  srcSet?: string
  sizes?: string
  width?: number
  height?: number
}

export type LogoItem = LogoItemNode | LogoItemImage

interface LogoLoopProps {
  logos: LogoItem[]
  speed?: number
  direction?: 'left' | 'right' | 'up' | 'down'
  width?: number | string
  logoHeight?: number
  gap?: number
  pauseOnHover?: boolean
  hoverSpeed?: number
  fadeOut?: boolean
  fadeOutColor?: string
  scaleOnHover?: boolean
  ariaLabel?: string
  className?: string
  style?: CSSProperties
}

const props = withDefaults(defineProps<LogoLoopProps>(), {
  speed: 120,
  direction: 'left',
  width: '100%',
  logoHeight: 28,
  gap: 32,
  pauseOnHover: undefined,
  hoverSpeed: undefined,
  fadeOut: false,
  fadeOutColor: undefined,
  scaleOnHover: false,
  ariaLabel: 'Partner logos',
  className: undefined,
  style: undefined,
})

const ANIMATION_CONFIG = {
  SMOOTH_TAU: 0.25,
  MIN_COPIES: 2,
  COPY_HEADROOM: 2,
} as const

const containerRef = ref<HTMLDivElement | null>(null)
const trackRef = ref<HTMLDivElement | null>(null)
const seqRef = ref<HTMLUListElement | null>(null)
const seqWidth = ref(0)
const seqHeight = ref(0)
const copyCount = ref<number>(ANIMATION_CONFIG.MIN_COPIES)
const isHovered = ref(false)

let rafRef: number | null = null
let lastTimestampRef: number | null = null
let resizeObserver: ResizeObserver | null = null
let cleanupResize: (() => void) | undefined
let cleanupImages: (() => void) | undefined
let cleanupAnimation: (() => void) | undefined
const offsetRef = ref(0)
const velocityRef = ref(0)

const isVertical = computed(() => props.direction === 'up' || props.direction === 'down')

const effectiveHoverSpeed = computed<number | undefined>(() => {
  if (props.hoverSpeed !== undefined)
    return props.hoverSpeed
  if (props.pauseOnHover === true)
    return 0
  if (props.pauseOnHover === false)
    return undefined
  return 0
})

const targetVelocity = computed(() => {
  const magnitude = Math.abs(props.speed)
  const directionMultiplier = isVertical.value
    ? props.direction === 'up' ? 1 : -1
    : props.direction === 'left' ? 1 : -1
  const speedMultiplier = props.speed < 0 ? -1 : 1

  return magnitude * directionMultiplier * speedMultiplier
})

const rootClasses = computed(() => [
  'LogoLoop',
  isVertical.value ? 'LogoLoop--vertical' : 'LogoLoop--horizontal',
  props.scaleOnHover ? 'LogoLoop--scale' : '',
  props.className,
].filter(Boolean))

const containerStyle = computed(() => {
  const width = typeof props.width === 'number' ? `${props.width}px` : props.width

  return {
    ...(isVertical.value ? width !== '100%' && width ? { width } : {} : { width: width ?? '100%' }),
    '--logoloop-gap': `${props.gap}px`,
    '--logoloop-logo-height': `${props.logoHeight}px`,
    '--logoloop-fade-color': props.fadeOutColor,
    ...(props.style ?? {}),
  } as CSSProperties
})

function isNodeItem(item: LogoItem): item is LogoItemNode {
  return 'node' in item
}

function getItemAriaLabel(item: LogoItem): string | undefined {
  return isNodeItem(item) ? item.ariaLabel ?? item.title : item.alt ?? item.title
}

function handleMouseEnter() {
  if (effectiveHoverSpeed.value !== undefined)
    isHovered.value = true
}

function handleMouseLeave() {
  if (effectiveHoverSpeed.value !== undefined)
    isHovered.value = false
}

async function updateDimensions() {
  await nextTick()

  const containerWidth = containerRef.value?.clientWidth ?? 0
  const sequenceRect = seqRef.value?.getBoundingClientRect?.()
  const sequenceWidth = sequenceRect?.width ?? 0
  const sequenceHeight = sequenceRect?.height ?? 0

  if (isVertical.value) {
    const parentHeight = containerRef.value?.parentElement?.clientHeight ?? 0
    if (containerRef.value && parentHeight > 0)
      containerRef.value.style.height = `${Math.ceil(parentHeight)}px`

    if (sequenceHeight > 0) {
      seqHeight.value = Math.ceil(sequenceHeight)
      const viewport = containerRef.value?.clientHeight ?? parentHeight ?? sequenceHeight
      const copiesNeeded = Math.ceil(viewport / sequenceHeight) + ANIMATION_CONFIG.COPY_HEADROOM
      copyCount.value = Math.max(ANIMATION_CONFIG.MIN_COPIES, copiesNeeded)
    }
  }
  else if (sequenceWidth > 0) {
    seqWidth.value = Math.ceil(sequenceWidth)
    const copiesNeeded = Math.ceil(containerWidth / sequenceWidth) + ANIMATION_CONFIG.COPY_HEADROOM
    copyCount.value = Math.max(ANIMATION_CONFIG.MIN_COPIES, copiesNeeded)
  }
}

function setupResizeObserver() {
  if (!window.ResizeObserver) {
    window.addEventListener('resize', updateDimensions)
    void updateDimensions()
    return () => window.removeEventListener('resize', updateDimensions)
  }

  resizeObserver = new ResizeObserver(updateDimensions)
  if (containerRef.value)
    resizeObserver.observe(containerRef.value)
  if (seqRef.value)
    resizeObserver.observe(seqRef.value)
  void updateDimensions()

  return () => {
    resizeObserver?.disconnect()
    resizeObserver = null
  }
}

function setupImageLoader() {
  const images = seqRef.value?.querySelectorAll('img') ?? []

  if (images.length === 0) {
    void updateDimensions()
    return () => {}
  }

  let remaining = images.length
  const handleLoad = () => {
    remaining -= 1
    if (remaining === 0)
      void updateDimensions()
  }

  images.forEach((img) => {
    const htmlImg = img as HTMLImageElement
    if (htmlImg.complete) {
      handleLoad()
    }
    else {
      htmlImg.addEventListener('load', handleLoad, { once: true })
      htmlImg.addEventListener('error', handleLoad, { once: true })
    }
  })

  return () => {
    images.forEach((img) => {
      img.removeEventListener('load', handleLoad)
      img.removeEventListener('error', handleLoad)
    })
  }
}

function startAnimationLoop() {
  const track = trackRef.value
  if (!track)
    return () => {}

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const seqSize = isVertical.value ? seqHeight.value : seqWidth.value

  if (seqSize > 0) {
    offsetRef.value = ((offsetRef.value % seqSize) + seqSize) % seqSize
    track.style.transform = isVertical.value
      ? `translate3d(0, ${-offsetRef.value}px, 0)`
      : `translate3d(${-offsetRef.value}px, 0, 0)`
  }

  if (prefersReduced) {
    track.style.transform = 'translate3d(0, 0, 0)'
    return () => {
      lastTimestampRef = null
    }
  }

  const animate = (timestamp: number) => {
    if (lastTimestampRef === null)
      lastTimestampRef = timestamp

    const deltaTime = Math.max(0, timestamp - lastTimestampRef) / 1000
    lastTimestampRef = timestamp

    const target = isHovered.value && effectiveHoverSpeed.value !== undefined
      ? effectiveHoverSpeed.value
      : targetVelocity.value
    const easingFactor = 1 - Math.exp(-deltaTime / ANIMATION_CONFIG.SMOOTH_TAU)
    velocityRef.value += (target - velocityRef.value) * easingFactor

    const currentSeqSize = isVertical.value ? seqHeight.value : seqWidth.value
    if (currentSeqSize > 0) {
      offsetRef.value = ((offsetRef.value + velocityRef.value * deltaTime) % currentSeqSize + currentSeqSize) % currentSeqSize
      track.style.transform = isVertical.value
        ? `translate3d(0, ${-offsetRef.value}px, 0)`
        : `translate3d(${-offsetRef.value}px, 0, 0)`
    }

    rafRef = requestAnimationFrame(animate)
  }

  rafRef = requestAnimationFrame(animate)

  return () => {
    if (rafRef !== null) {
      cancelAnimationFrame(rafRef)
      rafRef = null
    }
    lastTimestampRef = null
  }
}

function cleanup() {
  cleanupResize?.()
  cleanupImages?.()
  cleanupAnimation?.()
}

onMounted(async () => {
  await nextTick()
  window.setTimeout(() => {
    cleanupResize = setupResizeObserver()
    cleanupImages = setupImageLoader()
    cleanupAnimation = startAnimationLoop()
  }, 10)
})

onUnmounted(() => {
  cleanup()
})

watch(
  [() => props.logos, () => props.gap, () => props.logoHeight, () => props.direction],
  async () => {
    await nextTick()
    cleanupImages?.()
    cleanupImages = setupImageLoader()
    cleanupAnimation?.()
    cleanupAnimation = startAnimationLoop()
  },
  { deep: true },
)

watch([() => props.speed, () => props.direction, () => props.hoverSpeed, () => props.pauseOnHover], () => {
  cleanupAnimation?.()
  cleanupAnimation = startAnimationLoop()
})
</script>

<style scoped>
.LogoLoop {
  position: relative;
  overflow-x: hidden;
  --logoloop-fade-color: var(--logoloop-fade-color, #050608);
}

.LogoLoop--vertical {
  display: inline-block;
  height: 100%;
  overflow: hidden;
}

.LogoLoop--scale {
  padding-block: calc(var(--logoloop-logo-height) * 0.12);
}

.LogoLoop-Fade {
  position: absolute;
  z-index: 10;
  pointer-events: none;
}

.LogoLoop-Fade--left,
.LogoLoop-Fade--right {
  top: 0;
  bottom: 0;
  width: clamp(24px, 10%, 120px);
}

.LogoLoop-Fade--left {
  left: 0;
  background: linear-gradient(to right, var(--logoloop-fade-color), rgba(0, 0, 0, 0));
}

.LogoLoop-Fade--right {
  right: 0;
  background: linear-gradient(to left, var(--logoloop-fade-color), rgba(0, 0, 0, 0));
}

.LogoLoop-Fade--top,
.LogoLoop-Fade--bottom {
  right: 0;
  left: 0;
  height: clamp(24px, 8%, 120px);
}

.LogoLoop-Fade--top {
  top: 0;
  background: linear-gradient(to bottom, var(--logoloop-fade-color), rgba(0, 0, 0, 0));
}

.LogoLoop-Fade--bottom {
  bottom: 0;
  background: linear-gradient(to top, var(--logoloop-fade-color), rgba(0, 0, 0, 0));
}

.LogoLoop-Track {
  position: relative;
  z-index: 0;
  display: flex;
  width: max-content;
  user-select: none;
  will-change: transform;
}

.LogoLoop-Track--vertical {
  width: 100%;
  height: max-content;
  flex-direction: column;
}

.LogoLoop-List {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

.LogoLoop-List--vertical {
  flex-direction: column;
}

.LogoLoop-Item {
  flex: none;
  margin-right: var(--logoloop-gap);
  color: currentColor;
  font-size: var(--logoloop-logo-height);
  line-height: 1;
}

.LogoLoop-Item--vertical {
  margin-right: 0;
  margin-bottom: var(--logoloop-gap);
}

.LogoLoop-Link,
.LogoLoop-Logo {
  display: inline-flex;
  align-items: center;
  color: inherit;
  text-decoration: none;
}

.LogoLoop-Link {
  border-radius: 12px;
  transition: opacity 180ms linear;
}

.LogoLoop-Link:hover {
  opacity: 0.84;
}

.LogoLoop-Link:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}

.LogoLoop-Logo {
  transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
}

.LogoLoop-Item--hoverable:hover .LogoLoop-Logo {
  transform: scale(1.14);
}

.LogoLoop-Image {
  display: block;
  width: auto;
  height: var(--logoloop-logo-height);
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}

@media (prefers-reduced-motion: reduce) {
  .LogoLoop-Track {
    transform: none !important;
  }

  .LogoLoop-Link,
  .LogoLoop-Logo {
    transition: none;
  }
}
</style>
