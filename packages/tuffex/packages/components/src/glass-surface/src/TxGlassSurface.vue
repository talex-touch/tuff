<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { GlassSurfaceProps } from '../index'

defineOptions({
  name: 'TxGlassSurface',
})

const props = withDefaults(defineProps<GlassSurfaceProps>(), {
  width: '200px',
  height: '200px',
  borderRadius: 20,
  borderWidth: 0.07,
  brightness: 70,
  opacity: 0.93,
  blur: 11,
  displace: 0.5,
  backgroundOpacity: 0,
  saturation: 1,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  xChannel: 'R',
  yChannel: 'G',
  mixBlendMode: 'difference',
})

const isDarkMode = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)
const feImageRef = ref<SVGImageElement | null>(null)
const redChannelRef = ref<SVGFEDisplacementMapElement | null>(null)
const greenChannelRef = ref<SVGFEDisplacementMapElement | null>(null)
const blueChannelRef = ref<SVGFEDisplacementMapElement | null>(null)
const gaussianBlurRef = ref<SVGFEGaussianBlurElement | null>(null)

function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15)
}

const uniqueId = generateUniqueId()
const filterId = `tx-glass-filter-${uniqueId}`
const redGradId = `tx-glass-red-grad-${uniqueId}`
const blueGradId = `tx-glass-blue-grad-${uniqueId}`

let resizeObserver: ResizeObserver | null = null
let cleanupDarkMode: (() => void) | undefined

function updateDarkMode() {
  if (typeof window === 'undefined') return

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDarkMode.value = mediaQuery.matches

  const handler = (e: MediaQueryListEvent) => {
    isDarkMode.value = e.matches
  }

  mediaQuery.addEventListener('change', handler)

  return () => mediaQuery.removeEventListener('change', handler)
}

function supportsSVGFilters() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)

  if (isWebkit || isFirefox) return false

  const div = document.createElement('div')
  div.style.backdropFilter = `url(#${filterId})`
  return div.style.backdropFilter !== ''
}

function supportsBackdropFilter() {
  if (typeof window === 'undefined') return false
  return CSS.supports('backdrop-filter', 'blur(10px)')
}

function generateDisplacementMap() {
  const rect = containerRef.value?.getBoundingClientRect()
  const actualWidth = rect?.width || 400
  const actualHeight = rect?.height || 200
  const edgeSize = Math.min(actualWidth, actualHeight) * (props.borderWidth * 0.5)

  const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${props.borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${props.borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${props.mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${props.borderRadius}" fill="hsl(0 0% ${props.brightness}% / ${props.opacity})" style="filter:blur(${props.blur}px)" />
      </svg>
    `

  return `data:image/svg+xml,${encodeURIComponent(svgContent)}`
}

function updateDisplacementMap() {
  if (feImageRef.value) {
    feImageRef.value.setAttribute('href', generateDisplacementMap())
  }
}

function updateFilterElements() {
  const elements = [
    { el: redChannelRef.value, offset: props.redOffset },
    { el: greenChannelRef.value, offset: props.greenOffset },
    { el: blueChannelRef.value, offset: props.blueOffset },
  ]

  for (const { el, offset } of elements) {
    if (el) {
      el.setAttribute('scale', (props.distortionScale + offset).toString())
      el.setAttribute('xChannelSelector', props.xChannel)
      el.setAttribute('yChannelSelector', props.yChannel)
    }
  }

  if (gaussianBlurRef.value) {
    gaussianBlurRef.value.setAttribute('stdDeviation', props.displace.toString())
  }
}

const containerStyles = computed(() => {
  const baseStyles: Record<string, string | number> = {
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
    height: typeof props.height === 'number' ? `${props.height}px` : props.height,
    borderRadius: `${props.borderRadius}px`,
  }

  const svgSupported = supportsSVGFilters()
  const backdropFilterSupported = supportsBackdropFilter()

  if (svgSupported) {
    return {
      ...baseStyles,
      background: isDarkMode.value
        ? `hsl(0 0% 0% / ${props.backgroundOpacity})`
        : `hsl(0 0% 100% / ${props.backgroundOpacity})`,
      backdropFilter: `url(#${filterId}) saturate(${props.saturation})`,
    }
  }

  if (isDarkMode.value) {
    if (!backdropFilterSupported) {
      return {
        ...baseStyles,
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }
    }

    return {
      ...baseStyles,
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
      WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    }
  }

  if (!backdropFilterSupported) {
    return {
      ...baseStyles,
      background: 'rgba(255, 255, 255, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
    }
  }

  return {
    ...baseStyles,
    background: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
    WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
  }
})

onMounted(() => {
  cleanupDarkMode = updateDarkMode()

  nextTick(() => {
    updateDisplacementMap()
    updateFilterElements()

    if (containerRef.value && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        setTimeout(updateDisplacementMap, 0)
      })
      resizeObserver.observe(containerRef.value)
    }
  })
})

watch(
  [
    () => props.width,
    () => props.height,
    () => props.borderRadius,
    () => props.borderWidth,
    () => props.brightness,
    () => props.opacity,
    () => props.blur,
    () => props.displace,
    () => props.distortionScale,
    () => props.redOffset,
    () => props.greenOffset,
    () => props.blueOffset,
    () => props.xChannel,
    () => props.yChannel,
    () => props.mixBlendMode,
  ],
  () => {
    updateDisplacementMap()
    updateFilterElements()
  },
)
</script>

<template>
  <div ref="containerRef" class="tx-glass-surface" :style="containerStyles">
    <svg class="tx-glass-surface__svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter :id="filterId" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
          <feImage
            ref="feImageRef"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
          />

          <feDisplacementMap ref="redChannelRef" in="SourceGraphic" in2="map" result="dispRed" />
          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="red"
          />

          <feDisplacementMap ref="greenChannelRef" in="SourceGraphic" in2="map" result="dispGreen" />
          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="green"
          />

          <feDisplacementMap ref="blueChannelRef" in="SourceGraphic" in2="map" result="dispBlue" />
          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="blue"
          />

          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="output" />
          <feGaussianBlur ref="gaussianBlurRef" in="output" stdDeviation="0.7" />
        </filter>
      </defs>
    </svg>

    <div class="tx-glass-surface__content">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-glass-surface {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: opacity 260ms ease-out;
}

.tx-glass-surface__svg {
  width: 100%;
  height: 100%;
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0;
  z-index: -1;
}

.tx-glass-surface__content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  position: relative;
  z-index: 1;
}
</style>
