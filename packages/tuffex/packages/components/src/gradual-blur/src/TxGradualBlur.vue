<script setup lang="ts">
import type { CSSProperties, StyleValue } from 'vue'
import type { GradualBlurProps } from './types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'

defineOptions({
  name: 'TxGradualBlur',
})

const props = withDefaults(defineProps<GradualBlurProps>(), {
  position: 'bottom',
  strength: 2,
  height: '6rem',
  width: undefined,
  divCount: 5,
  exponential: false,
  zIndex: 1000,
  animated: false,
  duration: '0.3s',
  easing: 'ease-out',
  opacity: 1,
  curve: 'linear',
  responsive: false,
  target: 'parent',
  className: '',
  style: () => ({}),
})

const DEFAULT_CONFIG: Required<Pick<GradualBlurProps, | 'position'
  | 'strength'
  | 'height'
  | 'divCount'
  | 'exponential'
  | 'zIndex'
  | 'animated'
  | 'duration'
  | 'easing'
  | 'opacity'
  | 'curve'
  | 'responsive'
  | 'target'
  | 'className'
  | 'style'>> = {
  position: 'bottom',
  strength: 2,
  height: '6rem',
  divCount: 5,
  exponential: false,
  zIndex: 1000,
  animated: false,
  duration: '0.3s',
  easing: 'ease-out',
  opacity: 1,
  curve: 'linear',
  responsive: false,
  target: 'parent',
  className: '',
  style: {},
}

const PRESETS: Record<NonNullable<GradualBlurProps['preset']>, Partial<GradualBlurProps>> = {
  'top': { position: 'top', height: '6rem' },
  'bottom': { position: 'bottom', height: '6rem' },
  'left': { position: 'left', height: '6rem' },
  'right': { position: 'right', height: '6rem' },

  'subtle': { height: '4rem', strength: 1, opacity: 0.8, divCount: 3 },
  'intense': { height: '10rem', strength: 4, divCount: 8, exponential: true },

  'smooth': { height: '8rem', curve: 'bezier', divCount: 10 },
  'sharp': { height: '5rem', curve: 'linear', divCount: 4 },

  'header': { position: 'top', height: '8rem', curve: 'ease-out' },
  'footer': { position: 'bottom', height: '8rem', curve: 'ease-out' },
  'sidebar': { position: 'left', height: '6rem', strength: 2.5 },

  'page-header': {
    position: 'top',
    height: '10rem',
    target: 'page',
    strength: 3,
  },
  'page-footer': {
    position: 'bottom',
    height: '10rem',
    target: 'page',
    strength: 3,
  },
}

const CURVE_FUNCTIONS: Record<NonNullable<GradualBlurProps['curve']>, (p: number) => number> = {
  'linear': p => p,
  'bezier': p => p * p * (3 - 2 * p),
  'ease-in': p => p * p,
  'ease-out': p => 1 - (1 - p) ** 2,
  'ease-in-out': p => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
}

const containerRef = ref<HTMLDivElement | null>(null)
const isHovered = ref(false)
const isVisible = ref(true)
const responsiveHeight = ref(props.height)
const responsiveWidth = ref(props.width)

const config = computed(() => {
  const presetConfig = props.preset ? (PRESETS[props.preset] || {}) : {}
  return {
    ...DEFAULT_CONFIG,
    ...presetConfig,
    ...props,
  } as Required<GradualBlurProps>
})

function getGradientDirection(position: GradualBlurProps['position']): string {
  const directions: Record<NonNullable<GradualBlurProps['position']>, string> = {
    top: 'to top',
    bottom: 'to bottom',
    left: 'to left',
    right: 'to right',
  }
  return directions[position || 'bottom'] || 'to bottom'
}

function debounce<T extends (...a: any[]) => void>(fn: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    if (timeout)
      clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), wait)
  }
}

function updateResponsiveDimensions() {
  if (!config.value.responsive)
    return
  if (!hasWindow())
    return

  const width = window.innerWidth
  const currentConfig = config.value

  let newHeight = currentConfig.height
  if (width <= 480 && currentConfig.mobileHeight) {
    newHeight = currentConfig.mobileHeight
  }
  else if (width <= 768 && currentConfig.tabletHeight) {
    newHeight = currentConfig.tabletHeight
  }
  else if (width <= 1024 && currentConfig.desktopHeight) {
    newHeight = currentConfig.desktopHeight
  }
  responsiveHeight.value = newHeight

  let newWidth = currentConfig.width
  if (width <= 480 && currentConfig.mobileWidth) {
    newWidth = currentConfig.mobileWidth
  }
  else if (width <= 768 && currentConfig.tabletWidth) {
    newWidth = currentConfig.tabletWidth
  }
  else if (width <= 1024 && currentConfig.desktopWidth) {
    newWidth = currentConfig.desktopWidth
  }
  responsiveWidth.value = newWidth
}

let intersectionObserver: IntersectionObserver | null = null

function setupIntersectionObserver() {
  if (config.value.animated !== 'scroll')
    return
  if (!containerRef.value)
    return
  if (typeof IntersectionObserver === 'undefined')
    return

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (!entry)
        return
      isVisible.value = entry.isIntersecting
    },
    { threshold: 0.1 },
  )

  intersectionObserver.observe(containerRef.value)
}

const blurDivs = computed(() => {
  const divs: Array<{ style: CSSProperties }> = []

  const count = Math.max(1, Math.floor(config.value.divCount))
  const increment = 100 / count

  const currentStrength = (isHovered.value && config.value.hoverIntensity)
    ? config.value.strength * config.value.hoverIntensity
    : config.value.strength

  const curveFunc = CURVE_FUNCTIONS[config.value.curve] || CURVE_FUNCTIONS.linear

  for (let i = 1; i <= count; i++) {
    let progress = i / count
    progress = curveFunc(progress)

    const blurValue = config.value.exponential
      ? 2 ** (progress * 4) * 0.0625 * currentStrength
      : 0.0625 * (progress * count + 1) * currentStrength

    const p1 = Math.round((increment * i - increment) * 10) / 10
    const p2 = Math.round(increment * i * 10) / 10
    const p3 = Math.round((increment * i + increment) * 10) / 10
    const p4 = Math.round((increment * i + increment * 2) * 10) / 10

    let gradient = `transparent ${p1}%, black ${p2}%`
    if (p3 <= 100)
      gradient += `, black ${p3}%`
    if (p4 <= 100)
      gradient += `, transparent ${p4}%`

    const direction = getGradientDirection(config.value.position)

    const divStyle: CSSProperties = {
      maskImage: `linear-gradient(${direction}, ${gradient})`,
      WebkitMaskImage: `linear-gradient(${direction}, ${gradient})`,
      backdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
      WebkitBackdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
      opacity: config.value.opacity,
      transition: config.value.animated && config.value.animated !== 'scroll'
        ? `backdrop-filter ${config.value.duration} ${config.value.easing}`
        : undefined,
    }

    divs.push({ style: divStyle })
  }

  return divs
})

const containerStyle = computed((): StyleValue => {
  const isVertical = ['top', 'bottom'].includes(config.value.position)
  const isHorizontal = ['left', 'right'].includes(config.value.position)
  const isPageTarget = config.value.target === 'page'

  const baseStyle: CSSProperties = {
    position: isPageTarget ? 'fixed' : 'absolute',
    pointerEvents: config.value.hoverIntensity ? 'auto' : 'none',
    opacity: isVisible.value ? 1 : 0,
    transition: config.value.animated
      ? `opacity ${config.value.duration} ${config.value.easing}`
      : undefined,
    zIndex: isPageTarget ? config.value.zIndex + 100 : config.value.zIndex,
    willChange: config.value.gpuOptimized ? 'backdrop-filter, opacity' : undefined,
    transform: config.value.gpuOptimized ? 'translateZ(0)' : undefined,
    ...config.value.style,
  }

  if (isVertical) {
    baseStyle.height = responsiveHeight.value
    baseStyle.width = responsiveWidth.value || '100%'
    baseStyle[config.value.position] = '0'
    baseStyle.left = '0'
    baseStyle.right = '0'
  }
  else if (isHorizontal) {
    baseStyle.width = responsiveWidth.value || responsiveHeight.value
    baseStyle.height = '100%'
    baseStyle[config.value.position] = '0'
    baseStyle.top = '0'
    baseStyle.bottom = '0'
  }

  return baseStyle
})

const debouncedResize = debounce(updateResponsiveDimensions, 100)

onMounted(() => {
  if (config.value.responsive) {
    updateResponsiveDimensions()
    window.addEventListener('resize', debouncedResize)
  }

  if (config.value.animated === 'scroll') {
    isVisible.value = false
    setupIntersectionObserver()
  }
})

onUnmounted(() => {
  if (config.value.responsive) {
    window.removeEventListener('resize', debouncedResize)
  }

  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
})

watch(
  () => isVisible.value,
  (newVisible) => {
    if (!newVisible)
      return
    if (config.value.animated !== 'scroll')
      return
    if (!props.onAnimationComplete)
      return

    const timeout = setTimeout(() => {
      props.onAnimationComplete?.()
    }, Number.parseFloat(config.value.duration) * 1000)

    return () => clearTimeout(timeout)
  },
)
</script>

<template>
  <div
    ref="containerRef"
    class="tx-gradual-blur" :class="[
      config.target === 'page' ? 'tx-gradual-blur--page' : 'tx-gradual-blur--parent',
      config.className,
    ]"
    :style="containerStyle"
    @mouseenter="config.hoverIntensity ? (isHovered = true) : undefined"
    @mouseleave="config.hoverIntensity ? (isHovered = false) : undefined"
  >
    <div class="tx-gradual-blur__inner">
      <div
        v-for="(div, index) in blurDivs"
        :key="index"
        class="tx-gradual-blur__layer"
        :style="div.style"
      />
    </div>

    <div v-if="$slots.default" class="tx-gradual-blur__slot">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-gradual-blur {
  position: absolute;
  inset: auto;
  pointer-events: none;
}

.tx-gradual-blur__inner {
  position: relative;
  width: 100%;
  height: 100%;
}

.tx-gradual-blur__layer {
  position: absolute;
  inset: 0;
}

.tx-gradual-blur__slot {
  position: relative;
}
</style>
