<script setup lang="ts">
// Vue port of the `MetalText` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// The glyph machinery — `paintTextRun` / `gaussBlur` from `engine/**` — is
// verbatim upstream; this SFC only mirrors the wrapper: it drives `TxMetalFx`
// with a text mask plus the Figma inner-shadow overlay (both in
// `./text-overlay`, the module-scope half of the React file).
//
// Bare metal-filled text — the Pro badge's glyph treatment without the pill.
// Figma: Portfolio › 1471:40925 ("Plan Pro" card).
//
// MetalFx's `mask` paints the word with the same font and metrics as the
// live span, so layout and hit-testing stay DOM. The metal is composited
// over the live text, so `color` is the tone the shader blends onto — the
// design's own colour, not white. The canvas is lifted above the content
// layer and the glow (clipped to the glyphs) above that.

import { computed, onBeforeUnmount, onMounted, ref, useAttrs, useSlots, watch, type CSSProperties, type ComponentPublicInstance } from 'vue'
import type { MaskFn } from './engine/renderer/core'
import { paintTextRun } from './engine/text-mask'
import TxMetalFx from './TxMetalFx.vue'
import { BARE_CSS, BARE_STYLE_ID, drawInnerShadow } from './text-overlay'
import { FIGMA_INNER_SHADOW, METAL_TEXT_DEFAULTS, type MetalFxRef, type MetalTextProps } from './types'

defineOptions({
  name: 'TxMetalText',
  // Upstream routes `className` to the inner span and ignores everything else;
  // the span is the only host, so `$attrs` lands there.
  inheritAttrs: false,
})

const props = withDefaults(defineProps<MetalTextProps>(), {
  strength: 1,
  innerShadow: () => FIGMA_INNER_SHADOW,
  glow: false,
  glowGain: METAL_TEXT_DEFAULTS.glowGain,
  metalOpacity: METAL_TEXT_DEFAULTS.metalOpacity,
  shaderScale: METAL_TEXT_DEFAULTS.shaderScale,
})

const attrs = useAttrs()

const fxRef = ref<ComponentPublicInstance | null>(null)
const textRef = ref<HTMLSpanElement | null>(null)

/**
 * `TxMetalFx` exposes its root element (`defineExpose({ el })`), which is the
 * only reliable handle: a root-level `v-if` makes the child component's `$el`
 * a fragment anchor rather than the element.
 */
const fxRootEl = (): HTMLElement | null => (fxRef.value as unknown as MetalFxRef | null)?.el ?? null

const mask: MaskFn = (ctx, _w, _h, dpr) => {
  const root = fxRootEl()
  const t = textRef.value
  if (root && t) paintTextRun(ctx, root, t, dpr)
}

const spanStyle = computed<CSSProperties>(() => ({
  font: props.font,
  color: props.color,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
}))

// The default slot is the Vue-native spelling (`<TxMetalText>Pro</TxMetalText>`);
// `children` stays supported because it is the upstream React prop. The glyph
// mask reads the span's rendered text, so either source paints correctly.
const slots = useSlots()
const slotText = computed<string>(() => ((slots as any).default?.() ?? [])
  .map((node: any) => (typeof node?.children === 'string' ? node.children : ''))
  .join(''))
const label = computed<string>(() => slotText.value.trim() || props.children || '')

onMounted(() => {
  if (!document.getElementById(BARE_STYLE_ID)) {
    const st = document.createElement('style')
    st.id = BARE_STYLE_ID
    st.textContent = BARE_CSS
    document.head.appendChild(st)
  }
  const root = fxRootEl()
  root?.setAttribute('data-mfx-bare', '')
  const cv = root?.querySelector<HTMLCanvasElement>('canvas.metal-fx-canvas')
  if (cv) cv.style.zIndex = '6'
  const host = root?.querySelector<HTMLElement>('.metal-fx-glow-svg')?.parentElement
  if (host) host.style.zIndex = '7'
})

// Inner-shadow overlay: above the metal (6) and the glow (7), redrawn when
// fonts land or the box changes. Static otherwise.
// (Upstream runs this from a `[innerShadow]` effect; the teardown below is the
// same set of cancellations, re-pointed at Vue's lifecycle.)
let detachRimOverlay: (() => void) | null = null
const mountRimOverlay = (): void => {
  detachRimOverlay?.()
  detachRimOverlay = null
  const root = fxRootEl()
  const t = textRef.value
  const innerShadow = props.innerShadow
  if (!root || !t || !innerShadow) return

  const cv = document.createElement('canvas')
  cv.className = 'metal-fx-text-rim'
  cv.setAttribute('aria-hidden', 'true')
  cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:8'
  root.appendChild(cv)
  const draw = () => drawInnerShadow(cv, root, t, innerShadow)
  draw()
  let alive = true
  document.fonts?.ready.then(() => {
    if (alive) draw()
  })
  const ro = new ResizeObserver(draw)
  ro.observe(root)
  // Browser zoom changes the DPR without changing the CSS box, so the
  // ResizeObserver stays quiet; re-rasterise from a resolution query.
  let mql: MediaQueryList | null = null
  const onDpr = () => {
    if (!alive) return
    draw()
    watchDpr()
  }
  const watchDpr = () => {
    mql?.removeEventListener('change', onDpr)
    mql = typeof window.matchMedia === 'function' ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null
    mql?.addEventListener('change', onDpr)
  }
  watchDpr()

  detachRimOverlay = () => {
    alive = false
    ro.disconnect()
    mql?.removeEventListener('change', onDpr)
    cv.remove()
  }
}

onMounted(mountRimOverlay)
watch(() => props.innerShadow, mountRimOverlay)
onBeforeUnmount(() => {
  detachRimOverlay?.()
  detachRimOverlay = null
})
</script>

<template>
  <TxMetalFx
    ref="fxRef"
    preset="chromatic"
    :theme="props.theme"
    :strength="props.strength * props.metalOpacity"
    :glow-gain="props.glowGain"
    :disable-glow="!props.glow"
    :mask="mask"
    :reflection-targets="props.reflectionTargets"
    :shader-scale="props.shaderScale"
    :border-radius="4"
    :style="{ background: 'transparent', borderRadius: 4 }"
  >
    <span ref="textRef" v-bind="attrs" :style="spanStyle" :aria-label="label">{{ slotText || props.children }}</span>
  </TxMetalFx>
</template>
