<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { EdgeFadeMaskProps } from './types'
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, watch } from 'vue'

defineOptions({
  name: 'TxEdgeFadeMask',
})

const props = withDefaults(defineProps<EdgeFadeMaskProps>(), {
  as: 'div',
  axis: 'vertical',
  size: 24,
  threshold: 1,
  disabled: false,
  observeResize: true,
})

const viewportRef = ref<HTMLElement | null>(null)
const canScroll = ref(false)
const showLeadingFade = ref(false)
const showTrailingFade = ref(false)

function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

function updateFadeState() {
  const element = viewportRef.value
  if (!element || props.disabled) {
    canScroll.value = false
    showLeadingFade.value = false
    showTrailingFade.value = false
    return
  }

  const threshold = Math.max(0, props.threshold)

  if (props.axis === 'horizontal') {
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
    const current = Math.max(0, element.scrollLeft)
    const scrollable = maxScroll > threshold

    canScroll.value = scrollable
    showLeadingFade.value = scrollable && current > threshold
    showTrailingFade.value = scrollable && current < maxScroll - threshold
    return
  }

  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
  const current = Math.max(0, element.scrollTop)
  const scrollable = maxScroll > threshold

  canScroll.value = scrollable
  showLeadingFade.value = scrollable && current > threshold
  showTrailingFade.value = scrollable && current < maxScroll - threshold
}

const maskStyle = computed<CSSProperties>(() => {
  if (props.disabled || !canScroll.value)
    return {}

  const size = toCssUnit(props.size)
  const direction = props.axis === 'horizontal' ? 'to right' : 'to bottom'
  const leading = showLeadingFade.value ? 'transparent' : 'black'
  const trailing = showTrailingFade.value ? 'transparent' : 'black'
  const maskImage = `linear-gradient(${direction}, ${leading} 0, black ${size}, black calc(100% - ${size}), ${trailing} 100%)`

  return {
    WebkitMaskImage: maskImage,
    maskImage,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  }
})

const rootClass = computed(() => ({
  'tx-edge-fade-mask--vertical': props.axis === 'vertical',
  'tx-edge-fade-mask--horizontal': props.axis === 'horizontal',
}))

let resizeObserver: ResizeObserver | null = null

function teardownResizeObserver() {
  if (!resizeObserver)
    return
  resizeObserver.disconnect()
  resizeObserver = null
}

function setupResizeObserver() {
  if (!props.observeResize)
    return
  if (typeof ResizeObserver === 'undefined')
    return

  const element = viewportRef.value
  if (!element)
    return

  resizeObserver = new ResizeObserver(() => {
    updateFadeState()
  })

  resizeObserver.observe(element)
  const firstChild = element.firstElementChild
  if (firstChild)
    resizeObserver.observe(firstChild)
}

function handleScroll() {
  updateFadeState()
}

watch(
  () => [props.axis, props.disabled, props.threshold] as const,
  () => {
    void nextTick(() => {
      updateFadeState()
    })
  },
)

watch(
  () => props.observeResize,
  () => {
    teardownResizeObserver()
    setupResizeObserver()
    updateFadeState()
  },
)

onMounted(() => {
  const element = viewportRef.value
  if (!element)
    return

  element.addEventListener('scroll', handleScroll, { passive: true })
  setupResizeObserver()
  void nextTick(() => {
    updateFadeState()
  })
})

onUnmounted(() => {
  const element = viewportRef.value
  if (element)
    element.removeEventListener('scroll', handleScroll)
  teardownResizeObserver()
})

onUpdated(() => {
  updateFadeState()
})
</script>

<template>
  <component :is="as" class="tx-edge-fade-mask" :class="rootClass">
    <div ref="viewportRef" class="tx-edge-fade-mask__viewport" :style="maskStyle">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.tx-edge-fade-mask {
  position: relative;
  display: block;
  min-width: 0;
  min-height: 0;
}

.tx-edge-fade-mask__viewport {
  width: 100%;
  height: 100%;
  -webkit-overflow-scrolling: touch;
}

.tx-edge-fade-mask--vertical .tx-edge-fade-mask__viewport {
  overflow-y: auto;
  overflow-x: hidden;
}

.tx-edge-fade-mask--horizontal .tx-edge-fade-mask__viewport {
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
