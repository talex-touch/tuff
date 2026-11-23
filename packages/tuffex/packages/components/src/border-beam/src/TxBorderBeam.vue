<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { BorderBeamProps } from './types'
import { computed, h, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useId, watch, watchEffect } from 'vue'
import { registerPulseInstance } from './pulse-driver'
import { generateBeamCSS, getPulseDriverConfig, sizePresets, sizeThemePresets } from './styles'

// Vue templates reject a literal <style> tag, so the per-instance stylesheet
// is rendered through a tiny functional component instead.
const InstanceStyle = Object.assign(
  (styleProps: { css: string }) => h('style', styleProps.css),
  { props: ['css'] },
)

// Vue port of the `border-beam` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// The CSS engine (styles.ts) and the shared ~30fps pulse driver are verbatim
// upstream; this SFC only mirrors the wrapper behavior: fade lifecycle,
// offscreen pause, radius auto-detection and pulse glow scaling.

defineOptions({
  name: 'TxBorderBeam',
})

const props = withDefaults(defineProps<BorderBeamProps>(), {
  size: 'md',
  colorVariant: 'colorful',
  theme: 'dark',
  staticColors: false,
  duration: undefined,
  active: true,
  borderRadius: undefined,
  brightness: undefined,
  saturation: undefined,
  hueRange: 30,
  strength: 1,
})

const emit = defineEmits<{
  /** Fired when the fade-in animation completes. */
  (e: 'activate'): void
  /** Fired when the fade-out animation completes. */
  (e: 'deactivate'): void
}>()

// The id lands inside CSS custom property names, so it must stay
// [a-zA-Z0-9_-] only. Vue's useId is SSR-stable.
const id = `tx-beam-${useId().replace(/[^a-z0-9_-]/gi, '-')}`

const rootEl = ref<HTMLDivElement | null>(null)

const systemTheme = ref<'dark' | 'light'>('dark')
const isActive = ref(props.active)
const isFading = ref(false)
const isVisible = ref(true)
const isDocumentHidden = ref(typeof document !== 'undefined' ? Boolean(document.hidden) : false)
const isWindowFocused = ref(
  typeof document !== 'undefined' && typeof document.hasFocus === 'function'
    ? document.hasFocus()
    : true,
)
const isActivated = ref(true)
const isReducedMotion = ref(
  typeof window !== 'undefined'
    ? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    : false,
)
const isLowBatteryMotion = ref(
  typeof document !== 'undefined'
    ? document.documentElement?.getAttribute('data-low-battery-motion') === '1'
    : false,
)
const detectedRadius = ref<number | null>(null)
const pulseGlowScale = ref({ x: 1, y: 1 })

function readLowBatteryMotion(): boolean {
  return typeof document !== 'undefined'
    ? document.documentElement?.getAttribute('data-low-battery-motion') === '1'
    : false
}

function readReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    : false
}

function syncEnvironmentState(): void {
  isDocumentHidden.value = typeof document !== 'undefined' ? Boolean(document.hidden) : false
  if (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && !document.hasFocus()) {
    isWindowFocused.value = false
  }
  isLowBatteryMotion.value = readLowBatteryMotion()
  isReducedMotion.value = readReducedMotion()
}

watch([() => props.active, isActive, isFading], ([active]) => {
  if (active && !isActive.value && !isFading.value)
    isActive.value = true
  else if (!active && isActive.value && !isFading.value)
    isFading.value = true
})

/** First slot element — skips the injected <style> and the bloom layer. */
function firstContentChild(): HTMLElement | null {
  const el = rootEl.value
  if (!el)
    return null
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement && child.tagName !== 'STYLE' && !child.hasAttribute('data-beam-bloom'))
      return child
  }
  return null
}

// Auto-detect the slot content's border radius when no explicit value is given.
function detectRadius(): void {
  if (props.borderRadius != null)
    return
  const child = firstContentChild()
  if (!child)
    return
  const raw = Number.parseFloat(getComputedStyle(child).borderTopLeftRadius)
  if (!Number.isNaN(raw) && raw > 0)
    detectedRadius.value = raw
}

// Pulse Outside glow geometry is authored in fixed pixels for a reference
// element (~350x140). Measure the actual wrapped element and scale the glow
// per-axis so the halo grows/shrinks to fit any component it's applied to.
let glowObserver: ResizeObserver | null = null

function measureGlow(): void {
  if (props.size !== 'pulse-outside') {
    pulseGlowScale.value = { x: 1, y: 1 }
    return
  }
  const child = firstContentChild()
  if (!child)
    return
  const rect = child.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return
  const clamp = (value: number): number => Math.max(0.35, Math.min(4, value))
  const x = +clamp(rect.width / 350).toFixed(3)
  const y = +clamp(rect.height / 140).toFixed(3)
  if (pulseGlowScale.value.x !== x || pulseGlowScale.value.y !== y)
    pulseGlowScale.value = { x, y }
}

function syncGlowObserver(): void {
  glowObserver?.disconnect()
  glowObserver = null
  measureGlow()
  if (props.size !== 'pulse-outside' || typeof ResizeObserver === 'undefined')
    return
  const child = firstContentChild()
  if (!child)
    return
  glowObserver = new ResizeObserver(measureGlow)
  glowObserver.observe(child)
}

watch(() => props.borderRadius, detectRadius)
watch(() => props.size, syncGlowObserver)

const unmountCleanups: Array<() => void> = []

onActivated(() => {
  isActivated.value = true
  syncEnvironmentState()
})

onDeactivated(() => {
  isActivated.value = false
})

onMounted(() => {
  isDocumentHidden.value = typeof document !== 'undefined' ? Boolean(document.hidden) : false
  isWindowFocused.value =
    typeof document !== 'undefined' && typeof document.hasFocus === 'function'
      ? document.hasFocus()
      : true
  isLowBatteryMotion.value = readLowBatteryMotion()
  isReducedMotion.value = readReducedMotion()

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.value = mq.matches ? 'dark' : 'light'
    const onChange = (e: MediaQueryListEvent): void => {
      systemTheme.value = e.matches ? 'dark' : 'light'
    }
    mq.addEventListener?.('change', onChange)
    unmountCleanups.push(() => mq.removeEventListener?.('change', onChange))

    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    isReducedMotion.value = reducedMq.matches
    const onReducedChange = (e: MediaQueryListEvent): void => {
      isReducedMotion.value = e.matches
    }
    reducedMq.addEventListener?.('change', onReducedChange)
    unmountCleanups.push(() => reducedMq.removeEventListener?.('change', onReducedChange))
  }

  const onVisibilityChange = (): void => {
    isDocumentHidden.value = Boolean(document.hidden)
    if (!document.hidden) {
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
        isWindowFocused.value = false
      }
      isLowBatteryMotion.value = readLowBatteryMotion()
    }
  }
  const onWindowFocus = (): void => {
    isWindowFocused.value = true
    isLowBatteryMotion.value = readLowBatteryMotion()
  }
  const onWindowBlur = (): void => {
    isWindowFocused.value = false
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('blur', onWindowBlur)
  unmountCleanups.push(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onWindowFocus)
    window.removeEventListener('blur', onWindowBlur)
  })

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    const lowBatteryMo = new MutationObserver(() => {
      isLowBatteryMotion.value = readLowBatteryMotion()
    })
    lowBatteryMo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-low-battery-motion'],
    })
    unmountCleanups.push(() => lowBatteryMo.disconnect())
  }

  // Pause the (paint-heavy) animations while the element is scrolled
  // offscreen, without changing the logical active/fading state — so it never
  // fires activate/deactivate.
  if (typeof IntersectionObserver !== 'undefined' && rootEl.value) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) isVisible.value = entry.isIntersecting
      },
      // Start animating slightly before the element scrolls into view.
      { rootMargin: '256px' },
    )
    io.observe(rootEl.value)
    unmountCleanups.push(() => io.disconnect())
  }

  detectRadius()
  syncGlowObserver()

  // Re-detect if the slot content changes (e.g. CSS loaded late).
  if (typeof MutationObserver !== 'undefined' && rootEl.value) {
    const mo = new MutationObserver(() => {
      detectRadius()
      syncGlowObserver()
    })
    mo.observe(rootEl.value, { childList: true, subtree: false })
    unmountCleanups.push(() => mo.disconnect())
  }
})

onBeforeUnmount(() => {
  while (unmountCleanups.length > 0) {
    unmountCleanups.pop()?.()
  }
  glowObserver?.disconnect()
  glowObserver = null
})

function onAnimationEnd(e: AnimationEvent): void {
  if (e.animationName.includes('fade-out')) {
    isActive.value = false
    isFading.value = false
    emit('deactivate')
  }
  else if (e.animationName.includes('fade-in')) {
    emit('activate')
  }
}

const resolvedTheme = computed<'dark' | 'light'>(() =>
  props.theme === 'auto' ? systemTheme.value : props.theme,
)
const themeConfig = computed(() => sizeThemePresets[props.size][resolvedTheme.value])
const sizeConfig = computed(() => sizePresets[props.size])
const isPulse = computed(() => props.size === 'pulse-inner' || props.size === 'pulse-outside')

const finalBorderRadius = computed(() => props.borderRadius ?? detectedRadius.value ?? sizeConfig.value.borderRadius)
const finalDuration = computed(() => props.duration ?? (props.size === 'line' ? 3.1 : isPulse.value ? 2.3 : 1.96))
const finalSaturation = computed(() => props.saturation ?? themeConfig.value.saturation)
const finalBrightness = computed(() => props.brightness ?? themeConfig.value.brightness ?? 1.3)
const finalHueRange = computed(() => (props.size === 'line' ? Math.min(props.hueRange, 13) : props.hueRange))
const finalStaticColors = computed(() => (props.colorVariant === 'mono' ? true : props.staticColors))

const cssStyles = computed(() =>
  generateBeamCSS({
    id,
    borderRadius: finalBorderRadius.value,
    borderWidth: sizeConfig.value.borderWidth,
    duration: finalDuration.value,
    strokeOpacity: themeConfig.value.strokeOpacity,
    innerOpacity: themeConfig.value.innerOpacity,
    bloomOpacity: themeConfig.value.bloomOpacity,
    innerShadow: themeConfig.value.innerShadow,
    size: props.size,
    colorVariant: props.colorVariant,
    staticColors: finalStaticColors.value,
    brightness: finalBrightness.value,
    saturation: finalSaturation.value,
    hueRange: finalHueRange.value,
    theme: resolvedTheme.value,
    hairlineOpacity: themeConfig.value.hairlineOpacity,
  }),
)

// Runtime config for the JS breathing driver (null for non-pulse sizes).
const driverConfig = computed(() =>
  isPulse.value
    ? getPulseDriverConfig(props.size, resolvedTheme.value, finalDuration.value, finalStaticColors.value, id)
    : null,
)

const isMotionPaused = computed(() =>
  !isVisible.value
  || isDocumentHidden.value
  || !isWindowFocused.value
  || !isActivated.value
  || isReducedMotion.value
  || isLowBatteryMotion.value,
)

// Drive the Pulse breathing from the shared, fps-capped rAF loop while the
// instance is on, onscreen, visible, focused, activated, and motion is allowed.
watchEffect((onCleanup) => {
  const config = driverConfig.value
  if (!config)
    return
  if (!(isActive.value || isFading.value) || isMotionPaused.value)
    return
  const el = rootEl.value
  if (!el)
    return
  onCleanup(registerPulseInstance(el, config))
})

const rootStyle = computed<CSSProperties>(() => ({
  '--beam-strength': String(Math.max(0, Math.min(1, props.strength))),
  ...(props.size === 'pulse-outside'
    ? {
        '--pulse-glow-sx': String(pulseGlowScale.value.x),
        '--pulse-glow-sy': String(pulseGlowScale.value.y),
      }
    : {}),
} as CSSProperties))
</script>

<template>
  <div
    ref="rootEl"
    :data-beam="id"
    :data-active="isActive && !isFading ? '' : undefined"
    :data-fading="isFading ? '' : undefined"
    :data-paused="isActive && !isFading && isMotionPaused ? '' : undefined"
    :style="rootStyle"
    @animationend="onAnimationEnd"
  >
    <slot />
    <div data-beam-bloom />
    <InstanceStyle :css="cssStyles" />
  </div>
</template>
