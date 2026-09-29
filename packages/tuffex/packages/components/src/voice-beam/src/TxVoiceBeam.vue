<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { VoiceBeamLevel, VoiceBeamProps, VoiceBeamType } from './types'
import { computed, h, onBeforeUnmount, onMounted, ref, useId, watch, watchEffect } from 'vue'
import { toTriple } from './color'
import { resolveVoiceDefaults, resolveVoiceStyle } from './presets'
import { generateVoiceBeamCSS, themePresets } from './styles'
import { registerVoiceInstance, type VoiceDriverConfig, type VoiceSource } from './voice-driver'

// Vue templates reject a literal <style> tag, so the per-instance stylesheet
// is rendered through a tiny functional component instead.
const InstanceStyle = Object.assign(
  (styleProps: { css: string }) => h('style', styleProps.css),
  { props: ['css'] },
)

// Vue port of the `VoiceBeam` React component
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// The stylesheet (styles.ts), presets (presets.ts), colour parsing (color.ts)
// and the shared rAF driver (voice-driver.ts) are verbatim upstream; this SFC
// only mirrors the wrapper behavior: fade lifecycle, offscreen pause, radius
// auto-detection, the WebKit host-area gate on the warp filter, and the
// per-frame level report.

defineOptions({
  name: 'TxVoiceBeam',
})

/** Band colour defaults per theme, as `r, g, b` triples. */
const BAND_COLORS = {
  dark: { core: '255, 255, 255', above: '255, 70, 80', mid: '90, 255, 150', below: '80, 140, 255' },
  light: { core: '197, 139, 255', above: '255, 122, 182', mid: '126, 196, 255', below: '45, 255, 171' },
} as const

const BORDER_WIDTH = 1
const DEFAULT_RADIUS = 16

/* WebKit (Safari) evaluates SVG filters on HTML content on the CPU every
   paint, which on a phone-sized host drops the frame rate by an order of
   magnitude, so the displacement warp is off there above this host area:
   a chat input (~39k px²) or a pill keeps it, the phone crop (~97k px²)
   and any real screen do not. Its 2D canvas also has no `filter`, so the
   band's blur is done in CSS on two canvases instead (the ridge and its
   wider halo), keeping Chromium's look. The half-resolution soft layers
   are explicit (a per-layer factor on every length, not `zoom`), so they
   run on every engine; Safari 18 rasters them pre-scale as Chromium does. */
const WEBKIT_WARP_MAX_AREA = 60_000
// Every iOS browser is WebKit whatever its name (CriOS, FxiOS); only
// desktop Blink carries "Chrome/".
const IS_WEBKIT =
  typeof navigator !== 'undefined' &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(navigator.userAgent)
const CANVAS_FILTER = (() => {
  if (typeof document === 'undefined') return true
  const ctx = document.createElement('canvas').getContext('2d')
  return !!ctx && typeof (ctx as { filter?: unknown }).filter === 'string'
})()

const props = withDefaults(defineProps<VoiceBeamProps>(), {
  type: 'default',
  stream: null,
  level: 0,
  sensitivity: 3.1,
  threshold: 0.015,
  attack: 0.325,
  release: 0.86,
  breatheDuration: 5.2,
  bands: true,
  processing: false,
  processingEase: 0.6,
  colorVariant: 'colorful',
  theme: 'dark',
  staticColors: false,
  active: true,
  paused: false,
})

const emit = defineEmits<{
  /** Fired every frame with the smoothed level (0–1) the beam is showing. */
  (e: 'level', value: number): void
  /** Fired when the fade-in animation completes. */
  (e: 'activate'): void
  /** Fired when the fade-out animation completes. */
  (e: 'deactivate'): void
}>()

// The id lands inside CSS custom property names, keyframe names and the SVG
// filter reference, so it must stay [a-zA-Z0-9_-] only. Vue's useId is
// SSR-stable (upstream's React ids only needed their colons stripped).
const id = `tx-voice-beam-${useId().replace(/[^a-z0-9_-]/gi, '-')}`

const rootEl = ref<HTMLDivElement | null>(null)

const systemTheme = ref<'dark' | 'light'>(
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
)
const reducedMotion = ref<boolean>(
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
)

const isActive = ref(props.active)
const isFading = ref(false)
const isVisible = ref(true)
const detectedRadius = ref<number | null>(null)
/* The host's area, measured on WebKit only, to keep the warp off large hosts there. */
const hostArea = ref(0)

const resolvedTheme = computed<'dark' | 'light'>(() =>
  props.theme === 'auto' ? systemTheme.value : props.theme,
)

// The preset tables are keyed by the three declared types. A value outside
// that set (a JS consumer, a bound variable) would crash the preset lookup
// outright — `resolveVoiceDefaults` reads `voiceTypePresets[type].reach` — so
// the wrapper resolves anything unrecognized to `default` before consulting
// them. Only the lookups are sanitized: `data-voice-type` still reports the
// raw prop, as upstream does.
const beamType = computed<VoiceBeamType>(() =>
  props.type === 'pill' || props.type === 'mobile' ? props.type : 'default',
)

// The type preset supplies the geometry defaults; an explicit prop wins;
// `scale` then multiplies every pixel dimension as one.
const geometry = computed(() => {
  const d = resolveVoiceDefaults(beamType.value, resolvedTheme.value)
  const sc = Math.max(0.05, props.scale ?? d.scale)
  const glowSize = props.glowSize ?? d.glowSize
  const processingDuration = props.processingDuration ?? d.processingDuration
  const processingLevel = props.processingLevel ?? d.processingLevel
  const processingTravel = props.processingTravel ?? d.processingTravel
  const processingCurve = props.processingCurve ?? d.processingCurve
  const cornerFollow = props.cornerFollow ?? d.cornerFollow
  const idle = props.idle ?? d.idle
  const reach = props.reach ?? d.reach
  const spread = props.spread ?? d.spread
  return {
    sc,
    glowSize,
    strokeOpacity: props.strokeOpacity ?? d.strokeOpacity,
    innerOpacity: props.innerOpacity ?? d.innerOpacity,
    bloomOpacity: props.bloomOpacity ?? d.bloomOpacity,
    processingDuration,
    processingLevel,
    processingTravel,
    processingCurve,
    cornerFollow,
    idle,
    reach,
    spread,
    flow: (props.flow ?? d.flow) * sc,
    bend: (props.bend ?? d.bend) * sc,
    bandStrength: props.bandStrength ?? d.bandStrength,
    bandWidth: (props.bandWidth ?? d.bandWidth) * sc,
    bandPosition: props.bandPosition ?? d.bandPosition,
    bandCurve: props.bandCurve ?? d.bandCurve,
    bandSpread: props.bandSpread ?? d.bandSpread,
    bandSkew: props.bandSkew ?? d.bandSkew,
    bandOffset: (props.bandOffset ?? d.bandOffset) * sc,
    bandTail: props.bandTail ?? d.bandTail,
    bandTailPosition: props.bandTailPosition ?? d.bandTailPosition,
    bandTailCurve: props.bandTailCurve ?? d.bandTailCurve,
    bandTailOverflow: (props.bandTailOverflow ?? d.bandTailOverflow) * sc,
    bandAberration: props.bandAberration ?? d.bandAberration,
    distortionBase: props.distortion ?? d.distortion,
    distortionDetail: (props.distortionDetail ?? d.distortionDetail) / sc,
    glowWidth: (props.glowWidth ?? d.glowWidth) * sc,
    glowHeight: (props.glowHeight ?? d.glowHeight) * sc,
    lobeSpacing: (props.lobeSpacing ?? d.lobeSpacing) * sc,
    rangeWidth: (props.rangeWidth ?? d.rangeWidth) * sc,
    rangeHeight: (props.rangeHeight ?? d.rangeHeight) * sc,
    softness: props.softness ?? d.softness,
    coreSize: (props.coreSize ?? d.coreSize) * sc,
    coreLight: Math.max(0, Math.min(3, props.coreLight ?? d.coreLight)),
    coreLightWidth: props.coreLightWidth ?? d.coreLightWidth,
    coreLightHeight: props.coreLightHeight ?? d.coreLightHeight,
    strokeScale: props.strokeScale ?? d.strokeScale,
    innerScale: props.innerScale ?? d.innerScale,
    innerHeight: props.innerHeight ?? d.innerHeight,
    bloomScale: props.bloomScale ?? d.bloomScale,
    bloomHeight: props.bloomHeight ?? d.bloomHeight,
  }
})

const preset = computed(() => themePresets[resolvedTheme.value])
const typeStyle = computed(() => resolveVoiceStyle(beamType.value, resolvedTheme.value))
const finalBorderRadius = computed(() => props.borderRadius ?? detectedRadius.value ?? DEFAULT_RADIUS)
const distortion = computed(() =>
  IS_WEBKIT && hostArea.value > WEBKIT_WARP_MAX_AREA ? 0 : geometry.value.distortionBase,
)
const strength = computed(() => props.strength ?? typeStyle.value.strength ?? preset.value.strength ?? 1)
const hueRange = computed(() => props.hueRange ?? preset.value.hueRange ?? 24)
const hueDuration = computed(() => props.hueDuration ?? preset.value.hueDuration ?? 12)
const finalBrightness = computed(
  () => props.brightness ?? typeStyle.value.brightness ?? preset.value.brightness,
)
const finalSaturation = computed(
  () => props.saturation ?? typeStyle.value.saturation ?? preset.value.saturation,
)

watch([() => props.active, isActive, isFading], ([active]) => {
  if (active && !isActive.value && !isFading.value)
    isActive.value = true
  else if (!active && isActive.value && !isFading.value)
    isFading.value = true
})

/** Auto-detect the slot content's border radius when no explicit value is given. */
function detectRadius(): void {
  if (props.borderRadius != null)
    return
  const el = rootEl.value
  if (!el)
    return
  const child = el.firstElementChild as HTMLElement | null
  if (!child)
    return
  const raw = Number.parseFloat(getComputedStyle(child).borderTopLeftRadius)
  if (!Number.isNaN(raw) && raw > 0)
    detectedRadius.value = raw
}

function onAnimationEnd(e: AnimationEvent): void {
  const animationName = e.animationName
  if (animationName.includes('fade-out')) {
    isActive.value = false
    isFading.value = false
    emit('deactivate')
  }
  else if (animationName.includes('fade-in')) {
    emit('activate')
  }
}

// A parent rendering `:colors="['#f00']"` hands over a fresh array on every
// render. Upstream compares the palette props by value (`colorsKey` /
// `bandColorsKey`) so an equal palette never rebuilds the stylesheet or
// re-registers the driver; these keep that, and the arrays are rebuilt from
// the keys so nothing downstream tracks the prop's identity.
const colorsKey = computed(() => (props.colors ? props.colors.join('|') : ''))
const customColors = computed<string[] | undefined>(() => (colorsKey.value ? colorsKey.value.split('|') : undefined))
const bandColorsKey = computed(() =>
  [props.bandColors?.core, props.bandColors?.above, props.bandColors?.mid, props.bandColors?.below]
    .map((color) => color ?? '')
    .join('|'),
)
const customBandColors = computed(() => {
  const [core = '', above = '', mid = '', below = ''] = bandColorsKey.value.split('|')
  return { core, above, mid, below }
})

const cssStyles = computed(() =>
  generateVoiceBeamCSS({
    id,
    borderRadius: finalBorderRadius.value,
    borderWidth: BORDER_WIDTH,
    strokeOpacity: preset.value.strokeOpacity * geometry.value.strokeOpacity,
    innerOpacity: preset.value.innerOpacity * geometry.value.innerOpacity,
    bloomOpacity: preset.value.bloomOpacity * geometry.value.bloomOpacity,
    innerShadow: preset.value.innerShadow,
    colorVariant: props.colorVariant,
    colors: customColors.value,
    brightness: finalBrightness.value,
    saturation: finalSaturation.value,
    theme: resolvedTheme.value,
    hueBase: preset.value.hueBase ?? 0,
    glowSize: geometry.value.glowSize * geometry.value.sc,
    glowWidth: geometry.value.glowWidth,
    glowHeight: geometry.value.glowHeight,
    strokeScale: geometry.value.strokeScale,
    innerScale: geometry.value.innerScale,
    innerHeight: geometry.value.innerHeight,
    bloomScale: geometry.value.bloomScale,
    bloomHeight: geometry.value.bloomHeight,
    coreSize: geometry.value.coreSize,
    coreLight: geometry.value.coreLight,
    coreLightWidth: geometry.value.coreLightWidth,
    coreLightHeight: geometry.value.coreLightHeight,
    rangeWidth: geometry.value.rangeWidth,
    rangeHeight: geometry.value.rangeHeight,
    softness: geometry.value.softness,
    distortion: distortion.value > 0,
    scale: geometry.value.sc,
  }),
)

// Runtime config for the shared driver. Numbers only, so a re-render with
// the same knobs does not re-register the instance.
const driverConfig = computed<VoiceDriverConfig>(() => {
  const g = geometry.value
  const theme = resolvedTheme.value
  return {
    id,
    sensitivity: Math.max(0, props.sensitivity),
    threshold: Math.max(0, Math.min(0.95, props.threshold)),
    attack: Math.max(0, props.attack),
    release: Math.max(0, props.release),
    idle: Math.max(0, Math.min(1, g.idle)),
    breatheDuration: Math.max(0.2, props.breatheDuration),
    reach: Math.max(0, g.reach),
    spread: Math.max(0, g.spread),
    bands: props.bands,
    flow: g.flow,
    lobeSpacing: Math.max(0.1, g.lobeSpacing),
    bend: Math.max(0, g.bend),
    bandStrength: Math.max(0, g.bandStrength),
    bandWidth: Math.max(0, g.bandWidth),
    bandPosition: Math.max(0, g.bandPosition),
    bandCurve: Math.max(0.3, g.bandCurve),
    bandSpread: Math.max(0.05, g.bandSpread),
    bandSkew: Math.max(-0.9, Math.min(0.9, g.bandSkew)),
    bandOffset: g.bandOffset,
    bandTail: Math.max(0, Math.min(1.5, g.bandTail)),
    bandTailPosition: Math.max(0, Math.min(0.98, g.bandTailPosition)),
    bandTailCurve: Math.max(0.5, g.bandTailCurve),
    bandTailOverflow: Math.max(0, g.bandTailOverflow),
    bandAberration: Math.max(0, Math.min(1, g.bandAberration)),
    rangeWidth: g.rangeWidth,
    rangeHeight: g.rangeHeight,
    theme,
    bandColors: {
      core: (customBandColors.value.core && toTriple(customBandColors.value.core)) || BAND_COLORS[theme].core,
      above: (customBandColors.value.above && toTriple(customBandColors.value.above)) || BAND_COLORS[theme].above,
      mid: (customBandColors.value.mid && toTriple(customBandColors.value.mid)) || BAND_COLORS[theme].mid,
      below: (customBandColors.value.below && toTriple(customBandColors.value.below)) || BAND_COLORS[theme].below,
    },
    distortion: Math.max(0, Math.min(1, distortion.value)),
    coreLight: g.coreLight,
    scale: g.sc,
    radius: finalBorderRadius.value,
    processing: props.processing,
    processingDuration: Math.max(0.05, g.processingDuration),
    processingLevel: Math.max(0, Math.min(1, g.processingLevel)),
    processingEase: Math.max(0.05, props.processingEase),
    processingTravel: Math.max(0, g.processingTravel),
    processingCurve: Math.max(1, g.processingCurve),
    cornerFollow: Math.max(0, Math.min(1, g.cornerFollow)),
    hueRange: Math.max(0, hueRange.value),
    hueDuration: Math.max(0.5, hueDuration.value),
    staticColors: props.colorVariant === 'mono' ? true : props.staticColors,
    reducedMotion: reducedMotion.value,
    paused: props.paused,
  }
})

function getLevelValue(): number {
  const current: VoiceBeamLevel = props.level
  return typeof current === 'function' ? current() : current
}

// Drive the reaction from the shared, fps-capped rAF loop while the instance
// is on and onscreen; the driver itself freezes the motion (flow, hue drift,
// sweep and warp) under prefers-reduced-motion.
watchEffect((onCleanup) => {
  if (!(isActive.value || isFading.value) || !isVisible.value)
    return
  const el = rootEl.value
  if (!el)
    return
  const source: VoiceSource = { stream: props.stream, getLevel: getLevelValue }
  onCleanup(registerVoiceInstance(el, driverConfig.value, source, (value) => emit('level', value)))
})

onMounted(() => {
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.value = mq.matches ? 'dark' : 'light'
    const onChange = (e: MediaQueryListEvent): void => {
      systemTheme.value = e.matches ? 'dark' : 'light'
    }
    mq.addEventListener('change', onChange)
    onBeforeUnmount(() => mq.removeEventListener('change', onChange))

    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = rmq.matches
    const onReduce = (e: MediaQueryListEvent): void => {
      reducedMotion.value = e.matches
    }
    rmq.addEventListener('change', onReduce)
    onBeforeUnmount(() => rmq.removeEventListener('change', onReduce))
  }

  // The warp filter is CPU-bound on WebKit, so the host's area decides
  // whether it is worth it there.
  if (IS_WEBKIT && rootEl.value) {
    const el = rootEl.value
    const measure = (): void => {
      hostArea.value = el.clientWidth * el.clientHeight
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      onBeforeUnmount(() => ro.disconnect())
    }
  }

  // Stop the per-frame work while the element is scrolled offscreen.
  if (typeof IntersectionObserver !== 'undefined' && rootEl.value) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) isVisible.value = entry.isIntersecting
      },
      { rootMargin: '256px' },
    )
    io.observe(rootEl.value)
    onBeforeUnmount(() => io.disconnect())
  }

  detectRadius()

  // Re-detect if the slot content changes (e.g. CSS loaded late).
  if (typeof MutationObserver !== 'undefined' && rootEl.value) {
    const mo = new MutationObserver(detectRadius)
    mo.observe(rootEl.value, { childList: true, subtree: false })
    onBeforeUnmount(() => mo.disconnect())
  }
})

watch(() => props.borderRadius, detectRadius)

const rootStyle = computed<CSSProperties>(() => ({
  '--voice-strength': String(Math.max(0, Math.min(1, strength.value))),
}) as CSSProperties)
</script>

<template>
  <div
    ref="rootEl"
    :data-voice-beam="id"
    :data-voice-type="type"
    data-voice-halfres=""
    :data-active="isActive && !isFading ? '' : undefined"
    :data-fading="isFading ? '' : undefined"
    :data-paused="isActive && !isFading && (!isVisible || paused) ? '' : undefined"
    :data-listening="stream ? '' : undefined"
    :data-processing="processing ? '' : undefined"
    :style="rootStyle"
    @animationend="onAnimationEnd"
  >
    <slot />
    <div data-voice-beam-bloom />
    <template v-if="distortion > 0">
      <!-- Mirrors of the inner light and bloom, clipped to below the
           band line and carrying the displacement filter. -->
      <div data-voice-beam-warp="inner" />
      <div data-voice-beam-warp="bloom" />
    </template>
    <canvas v-if="!CANVAS_FILTER" data-voice-beam-band-halo aria-hidden="true" />
    <canvas data-voice-beam-band aria-hidden="true" />
    <!-- After the band canvases, so the wash sits over the band's halo
         under the line (it is clipped to below the line, so the ridge
         itself stays) while the host's own content stays above it. -->
    <div v-if="geometry.coreLight > 0" data-voice-beam-core>
      <div />
    </div>
    <!-- The distortion filter: drifting fractal noise, its green
         channel pinned to 0.5 so only x displaces, driven per frame by
         the driver (scale and offset), which also narrows the region
         to the strip under the band line once it runs — the full box
         here is only the first frame. Zero-sized, so it takes no room. -->
    <svg
      v-if="distortion > 0"
      aria-hidden="true"
      width="0"
      height="0"
      style="position: absolute; pointer-events: none"
    >
      <filter
        :id="`vb-distort-${id}`"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          :baseFrequency="`${(0.012 * geometry.distortionDetail).toFixed(4)} ${(0.05 * geometry.distortionDetail).toFixed(4)}`"
          numOctaves="2"
          seed="7"
          result="noise"
        />
        <feOffset in="noise" dx="0" dy="0" result="moved" />
        <feColorMatrix
          in="moved"
          type="matrix"
          values="1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" :scale="0" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <InstanceStyle :css="css ? `${cssStyles}\n${css.split('{id}').join(id)}` : cssStyles" />
  </div>
</template>
