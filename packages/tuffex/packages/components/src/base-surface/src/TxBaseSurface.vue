<script setup lang="ts">
import type { BaseSurfaceMode, BaseSurfaceProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import TxGlassSurface from '../../glass-surface/src/TxGlassSurface.vue'

defineOptions({
  name: 'TxBaseSurface',
})

const props = withDefaults(defineProps<BaseSurfaceProps>(), {
  mode: 'pure',
  opacity: 0.75,
  blur: 10,
  saturation: 1.8,
  brightness: 1.1,
  backgroundOpacity: 0,
  borderWidth: 0.07,
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  xChannel: 'R',
  yChannel: 'G',
  mixBlendMode: 'difference',
  moving: false,
  fallbackMode: 'mask',
  settleDelay: 150,
  autoDetect: false,
  transitionDuration: 260,
  fake: false,
  fakeIndex: 0,
  tag: 'div',
})

const rootRef = ref<HTMLElement | null>(null)

// --- 运动降级状态 ---
const autoMoving = ref(false)
const settling = ref(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined

const isMoving = computed(() => props.moving || autoMoving.value)

/** 需要降级的模式（blur / glass / refraction 在运动中降级） */
const needsFallback = computed(() =>
  props.mode === 'blur' || props.mode === 'glass' || props.mode === 'refraction',
)

/** 实际渲染模式 */
const activeMode = computed<BaseSurfaceMode>(() => {
  if (needsFallback.value && isMoving.value) {
    return props.fallbackMode
  }
  return props.mode
})

/** 是否使用 GlassSurface 渲染（glass / refraction 且非降级状态） */
const useGlassSurface = computed(() =>
  activeMode.value === 'glass' || activeMode.value === 'refraction',
)

/** 传给 GlassSurface 的 props */
const glassSurfaceProps = computed(() => {
  const base = {
    width: '100%' as string | number,
    height: '100%' as string | number,
    borderRadius: typeof props.radius === 'number' ? props.radius : 0,
    blur: props.blur,
    saturation: props.saturation,
    brightness: props.mode === 'glass' ? 70 : (props.brightness ?? 70),
    opacity: props.mode === 'glass' ? 0.93 : (props.opacity ?? 0.93),
    backgroundOpacity: props.backgroundOpacity,
    borderWidth: props.borderWidth,
  }

  if (props.mode === 'refraction') {
    return {
      ...base,
      displace: props.displace,
      distortionScale: props.distortionScale,
      redOffset: props.redOffset,
      greenOffset: props.greenOffset,
      blueOffset: props.blueOffset,
      xChannel: props.xChannel,
      yChannel: props.yChannel,
      mixBlendMode: props.mixBlendMode,
    }
  }

  // glass 模式用温和的默认值
  return {
    ...base,
    displace: 0.5,
    distortionScale: -180,
    redOffset: 0,
    greenOffset: 10,
    blueOffset: 20,
    xChannel: 'R' as const,
    yChannel: 'G' as const,
    mixBlendMode: 'difference',
  }
})

// --- CSS 变量 ---
const cssVars = computed(() => {
  const vars: Record<string, string> = {
    '--tx-surface-transition': `${props.transitionDuration}ms`,
  }

  if (props.radius != null) {
    vars['--tx-surface-radius'] = typeof props.radius === 'number' ? `${props.radius}px` : props.radius
  }

  if (props.color) {
    vars['--tx-surface-color'] = props.color
  }

  // mask 模式透明度
  if (props.mode === 'mask' || props.fallbackMode === 'mask') {
    vars['--tx-surface-opacity'] = `${Math.round(props.opacity * 100)}%`
  }

  // blur 参数
  if (props.mode === 'blur') {
    vars['--tx-surface-blur'] = `${props.blur}px`
  }

  // fake 模式变量
  if (props.fake) {
    vars['--tx-surface-fake-index'] = String(props.fakeIndex)

    const mode = activeMode.value
    if (mode === 'pure') {
      vars['--tx-surface-fake-bg'] = props.color || 'var(--tx-fill-color-lighter, #fafafa)'
      vars['--tx-surface-fake-opacity'] = '1'
    }
    else if (mode === 'mask') {
      vars['--tx-surface-fake-bg'] = props.color || 'var(--tx-fill-color-lighter, #fafafa)'
      vars['--tx-surface-fake-opacity'] = String(props.opacity)
    }
  }

  return vars
})

const rootClasses = computed(() => {
  const classes: string[] = ['tx-base-surface']

  // glass/refraction 降级时用 fallback class，否则不加模式 class（由 GlassSurface 渲染）
  if (useGlassSurface.value) {
    classes.push('tx-base-surface--glass-wrap')
  }
  else {
    classes.push(`tx-base-surface--${activeMode.value}`)
  }

  if (props.fake) {
    classes.push('tx-base-surface--fake')
  }

  if (settling.value) {
    classes.push('tx-base-surface--settling')
  }

  return classes
})

// --- 自动检测 transform 运动 ---
let mutationObserver: MutationObserver | null = null
let observedElements: HTMLElement[] = []

function startSettleTimer() {
  clearTimeout(settleTimer)
  settling.value = true
  settleTimer = setTimeout(() => {
    settling.value = false
  }, props.transitionDuration + 50)
}

function onTransformStart() {
  autoMoving.value = true
  clearTimeout(settleTimer)
  settling.value = false
}

function onTransformEnd() {
  autoMoving.value = false
  startSettleTimer()
}

function handleTransitionStart(e: TransitionEvent) {
  if (e.propertyName === 'transform' || e.propertyName === 'translate') {
    onTransformStart()
  }
}

function handleTransitionEnd(e: TransitionEvent) {
  if (e.propertyName === 'transform' || e.propertyName === 'translate') {
    onTransformEnd()
  }
}

function hasTransformChanged(el: HTMLElement) {
  const transform = el.style.transform || el.style.getPropertyValue('transform')
  return transform && transform !== 'none' && transform !== ''
}

function setupAutoDetect() {
  if (!props.autoDetect || !hasWindow() || !rootRef.value) return

  const el = rootRef.value
  const targets: HTMLElement[] = []
  let current: HTMLElement | null = el
  while (current) {
    targets.push(current)
    current = current.parentElement
  }
  observedElements = targets

  for (const target of targets) {
    target.addEventListener('transitionstart', handleTransitionStart as EventListener)
    target.addEventListener('transitionend', handleTransitionEnd as EventListener)
    target.addEventListener('transitioncancel', handleTransitionEnd as EventListener)
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target as HTMLElement
        if (hasTransformChanged(target)) {
          onTransformStart()
        }
        else if (autoMoving.value) {
          onTransformEnd()
        }
      }
    }
  })

  for (const target of targets) {
    mutationObserver.observe(target, { attributes: true, attributeFilter: ['style'] })
  }
}

function teardownAutoDetect() {
  for (const target of observedElements) {
    target.removeEventListener('transitionstart', handleTransitionStart as EventListener)
    target.removeEventListener('transitionend', handleTransitionEnd as EventListener)
    target.removeEventListener('transitioncancel', handleTransitionEnd as EventListener)
  }
  observedElements = []
  mutationObserver?.disconnect()
  mutationObserver = null
  clearTimeout(settleTimer)
}

watch(() => props.moving, (newVal, oldVal) => {
  if (oldVal && !newVal && needsFallback.value) {
    startSettleTimer()
  }
})

watch(() => props.autoDetect, (newVal) => {
  teardownAutoDetect()
  if (newVal) setupAutoDetect()
})

onMounted(() => {
  setupAutoDetect()
})

onBeforeUnmount(() => {
  teardownAutoDetect()
})
</script>

<template>
  <component :is="tag" ref="rootRef" :class="rootClasses" :style="cssVars">
    <!-- glass / refraction 模式：内嵌 GlassSurface -->
    <TxGlassSurface
      v-if="useGlassSurface"
      v-bind="glassSurfaceProps"
      class="tx-base-surface__glass"
    >
      <slot />
    </TxGlassSurface>

    <!-- pure / mask / blur / 降级态：直接渲染 slot -->
    <slot v-else />
  </component>
</template>

<style lang="scss" src="./style/index.scss" />
