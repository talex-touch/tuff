<script setup lang="ts">
import type { GlassSurfaceProps } from '../index'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasDocument, hasNavigator, hasWindow } from '../../../../utils/env'
import { useGlassLens } from './lens/use-glass-lens'

defineOptions({
  name: 'TxGlassSurface',
})

const props = withDefaults(defineProps<GlassSurfaceProps>(), {
  width: '200px',
  height: '200px',
  borderRadius: 20,
  engine: 'classic',
  frost: 0,
  borderWidth: 0.07,
  brightness: 70,
  opacity: 0.93,
  blur: 11,
  displace: 0.5,
  backgroundOpacity: 0,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  xChannel: 'R',
  yChannel: 'G',
  mixBlendMode: 'difference',
})

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
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let isUnmounted = false

function supportsSVGFilters() {
  if (!hasWindow() || !hasNavigator() || !hasDocument())
    return false

  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)

  if (isWebkit || isFirefox)
    return false

  const value = `url(#${filterId})`
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return false
  return CSS.supports('backdrop-filter', value) || CSS.supports('-webkit-backdrop-filter', value)
}

function supportsBackdropFilter() {
  if (!hasWindow())
    return false
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return false
  return CSS.supports('backdrop-filter', 'blur(10px)')
}

/**
 * Longest side of the displacement map, in pixels. Chromium copies an feImage into every compositor
 * frame that draws a backdrop `url()` filter, rasterized on the CPU at the size it is drawn, so a
 * map as large as the surface cost a 1526×1886 panel 100–200ms a frame. The map is two ramps under
 * a blurred rect: drawn at this size and stretched, it displaces within a pixel of the full one.
 */
const MAP_MAX_SIDE = 256

/** The canvas name of the blend mode the map's blue ramp uses; null for the one canvas lacks, which keeps the SVG map. */
function canvasBlendOperation(mode: GlassSurfaceProps['mixBlendMode']): GlobalCompositeOperation | null {
  if (!mode || mode === 'normal')
    return 'source-over'
  if (mode === 'plus-lighter')
    return 'lighter'
  if (mode === 'plus-darker')
    return null
  return mode
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

/**
 * The map below, drawn into a canvas of at most MAP_MAX_SIDE pixels; null where the SVG filter is not
 * used (the map is then never read), or a 2D context or the blend mode is unavailable. Both ramps
 * start from transparent black, as the SVG stops do, so Chrome gives the two the same channel values.
 */
function drawDisplacementMap(width: number, height: number): string | null {
  const blend = canvasBlendOperation(props.mixBlendMode)
  if (!blend || !supportsSVGFilters())
    return null
  const scale = Math.min(1, MAP_MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  }
  catch {
    ctx = null
  }
  if (!ctx)
    return null

  ctx.scale(canvas.width / width, canvas.height / height)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const red = ctx.createLinearGradient(width, 0, 0, 0)
  red.addColorStop(0, 'rgba(0, 0, 0, 0)')
  red.addColorStop(1, '#f00')
  roundedRectPath(ctx, 0, 0, width, height, props.borderRadius)
  ctx.fillStyle = red
  ctx.fill()

  const blue = ctx.createLinearGradient(0, 0, 0, height)
  blue.addColorStop(0, 'rgba(0, 0, 0, 0)')
  blue.addColorStop(1, '#00f')
  ctx.globalCompositeOperation = blend
  roundedRectPath(ctx, 0, 0, width, height, props.borderRadius)
  ctx.fillStyle = blue
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'

  // Canvas filters ignore the transform, so the blur is scaled by hand.
  const edgeSize = Math.min(width, height) * (props.borderWidth * 0.5)
  ctx.filter = `blur(${props.blur * scale}px)`
  ctx.fillStyle = `hsl(0 0% ${props.brightness}% / ${props.opacity})`
  roundedRectPath(ctx, edgeSize, edgeSize, width - edgeSize * 2, height - edgeSize * 2, props.borderRadius)
  ctx.fill()

  return canvas.toDataURL('image/png')
}

function svgDisplacementMap(actualWidth: number, actualHeight: number) {
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
  if (isUnmounted)
    return

  if (feImageRef.value) {
    const rect = containerRef.value?.getBoundingClientRect()
    const width = rect?.width || 400
    const height = rect?.height || 200
    feImageRef.value.setAttribute('href', drawDisplacementMap(width, height) ?? svgDisplacementMap(width, height))
  }
}

function updateFilterElements() {
  if (isUnmounted)
    return

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
  const monochromeMask = 'var(--tx-surface-refraction-mask-rgb, 255 255 255)'
  const baseStyles: Record<string, string | number> = {
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
    height: typeof props.height === 'number' ? `${props.height}px` : props.height,
    borderRadius: `${props.borderRadius}px`,
  }

  const fallbackBlur = Math.max(0, props.blur)
  const svgSupported = supportsSVGFilters()
  const backdropFilterSupported = supportsBackdropFilter()

  if (svgSupported) {
    return {
      ...baseStyles,
      background: `rgb(${monochromeMask} / ${props.backgroundOpacity})`,
      backdropFilter: `url(#${filterId}) saturate(${props.saturation ?? 1})`,
    }
  }

  if (!backdropFilterSupported) {
    return {
      ...baseStyles,
      background: `rgb(${monochromeMask} / 0.4)`,
      border: `1px solid rgb(${monochromeMask} / 0.24)`,
    }
  }

  return {
    ...baseStyles,
    background: `rgb(${monochromeMask} / 0.22)`,
    backdropFilter: `blur(${fallbackBlur}px) saturate(1.8) brightness(1.06)`,
    WebkitBackdropFilter: `blur(${fallbackBlur}px) saturate(1.8) brightness(1.06)`,
    border: `1px solid rgb(${monochromeMask} / 0.24)`,
  }
})

const isLens = computed(() => props.engine === 'lens')
const lensId = `tx-glass-lens-${uniqueId}`

const lens = useGlassLens(containerRef, () => isLens.value, () => ({
  borderRadius: props.borderRadius,
  bezel: props.bezel,
  thickness: props.thickness,
  ior: props.ior,
  refraction: props.refraction,
  zoom: props.zoom,
  profile: props.profile,
  rimLight: props.rimLight,
  rimSaturation: props.rimSaturation,
  dispersion: props.dispersion,
}))

/** What the template draws the lens filter from; null while the lens is not refracting. */
const lensFilter = computed(() => {
  const field = lens.field.value
  const resolved = lens.params.value
  if (!isLens.value || !field || !resolved)
    return null

  const split = resolved.dispersion
  return {
    href: field.href,
    width: resolved.shape.width,
    height: resolved.shape.height,
    zoom: lens.zoom.value,
    source: lens.zoom.value ? 'magnified' : 'SourceGraphic',
    displacement: field.displacement,
    channels: split > 0
      ? { r: field.displacement * (1 - split), g: field.displacement, b: field.displacement * (1 + split) }
      : null,
    saturation: String(Math.max(0, props.saturation ?? 1.5)),
    rimSaturation: resolved.rimSaturation > 1 ? String(resolved.rimSaturation) : null,
  }
})

const lensStyles = computed(() => {
  const mask = 'var(--tx-surface-refraction-mask-rgb, 255 255 255)'
  const resolved = lens.params.value
  const refracting = lensFilter.value !== null
  const frost = Math.max(0, props.frost)
  const styles: Record<string, string | number> = {
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
    height: typeof props.height === 'number' ? `${props.height}px` : props.height,
    borderRadius: `${props.borderRadius}px`,
    '--tx-glass-frost': `${frost}px`,
  }

  // Shadow blur and offsets are drawn for a lens of about 150px; smaller ones scale them down.
  if (resolved)
    styles['--tx-glass-unit'] = Math.min(1, Math.max(0.3, Math.min(resolved.shape.width, resolved.shape.height) / 150)).toFixed(3)

  // Without refraction the surface is frosted glass, which needs a tint to read as a surface.
  const tint = refracting ? props.backgroundOpacity : Math.max(props.backgroundOpacity, 0.22)
  if (tint > 0)
    styles.backgroundColor = `rgb(${mask} / ${tint})`

  if (refracting) {
    styles.backdropFilter = `${frost > 0 ? `blur(${frost}px) ` : ''}url(#${lensId})`
    if (lens.rim.value)
      styles.backgroundImage = `url("${lens.rim.value}")`
  }
  return styles
})

const rootStyle = computed(() => (isLens.value ? lensStyles.value : containerStyles.value))
const rootClass = computed(() => (isLens.value
  ? ['tx-glass-surface--lens', { 'is-refracting': lensFilter.value !== null }]
  : undefined))

function startClassic() {
  if (isUnmounted || isLens.value)
    return

  updateDisplacementMap()
  updateFilterElements()

  if (!resizeObserver && containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (resizeTimer)
        clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        updateDisplacementMap()
      }, 0)
    })
    resizeObserver.observe(containerRef.value)
  }
}

onMounted(() => {
  isUnmounted = false
  nextTick(startClassic)
})

onBeforeUnmount(() => {
  isUnmounted = true
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
})

watch(isLens, (lensOn) => {
  if (!lensOn)
    nextTick(startClassic)
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
  <div ref="containerRef" class="tx-glass-surface" :class="rootClass" :style="rootStyle">
    <svg
      v-if="lensFilter"
      class="tx-glass-surface__svg tx-glass-surface__svg--lens"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter
          :id="lensId"
          filterUnits="userSpaceOnUse"
          primitiveUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
          x="0"
          y="0"
          :width="lensFilter.width"
          :height="lensFilter.height"
        >
          <template v-if="lensFilter.zoom">
            <feImage
              :href="lensFilter.zoom.href"
              x="0"
              y="0"
              :width="lensFilter.width"
              :height="lensFilter.height"
              preserveAspectRatio="none"
              result="zoomMap"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="zoomMap"
              :scale="lensFilter.zoom.displacement"
              xChannelSelector="R"
              yChannelSelector="G"
              result="magnified"
            />
          </template>
          <feImage
            :href="lensFilter.href"
            x="0"
            y="0"
            :width="lensFilter.width"
            :height="lensFilter.height"
            preserveAspectRatio="none"
            result="map"
          />

          <template v-if="lensFilter.channels">
            <feDisplacementMap
              :in="lensFilter.source"
              in2="map"
              :scale="lensFilter.channels.r"
              xChannelSelector="R"
              yChannelSelector="G"
              result="dispRed"
            />
            <feColorMatrix
              in="dispRed"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="red"
            />
            <feDisplacementMap
              :in="lensFilter.source"
              in2="map"
              :scale="lensFilter.channels.g"
              xChannelSelector="R"
              yChannelSelector="G"
              result="dispGreen"
            />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="green"
            />
            <feDisplacementMap
              :in="lensFilter.source"
              in2="map"
              :scale="lensFilter.channels.b"
              xChannelSelector="R"
              yChannelSelector="G"
              result="dispBlue"
            />
            <feColorMatrix
              in="dispBlue"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="blue"
            />
            <feBlend in="red" in2="green" mode="screen" result="redGreen" />
            <feBlend in="redGreen" in2="blue" mode="screen" result="refracted" />
          </template>
          <feDisplacementMap
            v-else
            :in="lensFilter.source"
            in2="map"
            :scale="lensFilter.displacement"
            xChannelSelector="R"
            yChannelSelector="G"
            result="refracted"
          />

          <!-- The displacement picks whole pixels, so what it bends has stair-steps; a hair of blur hides them. A flat face has none, and stays sharp. -->
          <feGaussianBlur in="refracted" stdDeviation="0.4" :result="lensFilter.zoom ? 'settled' : 'soft'" />
          <template v-if="!lensFilter.zoom">
            <feComponentTransfer in="map" result="bent">
              <feFuncR type="table" tableValues="1 0 1" />
              <feFuncG type="table" tableValues="1 0 1" />
            </feComponentTransfer>
            <feColorMatrix
              in="bent"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  16 16 0 0 -0.1"
              result="bentMask"
            />
            <feComposite in="soft" in2="bentMask" operator="in" result="softBent" />
            <feComposite in="refracted" in2="bentMask" operator="out" result="sharpFlat" />
            <feComposite in="softBent" in2="sharpFlat" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="settled" />
          </template>
          <feColorMatrix in="settled" type="saturate" :values="lensFilter.saturation" result="face" />

          <template v-if="lensFilter.rimSaturation">
            <feColorMatrix in="settled" type="saturate" :values="lensFilter.rimSaturation" result="vivid" />
            <feColorMatrix
              in="map"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0"
              result="rimMask"
            />
            <feComposite in="vivid" in2="rimMask" operator="in" result="vividRim" />
            <feMerge>
              <feMergeNode in="face" />
              <feMergeNode in="vividRim" />
            </feMerge>
          </template>
        </filter>
      </defs>
    </svg>

    <svg v-else-if="!isLens" class="tx-glass-surface__svg" xmlns="http://www.w3.org/2000/svg">
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
@use '../../../style/mixins.scss' as *;

.tx-glass-surface {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: opacity 260ms ease-out;

  // High contrast: an opaque panel instead of glass. The material is an inline style, hence the
  // `!important`.
  @include tx-when-high-contrast {
    background: var(--tx-bg-color-overlay, #fff) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
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

.tx-glass-surface__svg--lens {
  width: 0;
  height: 0;
  overflow: hidden;
}

// The lens engine. The refraction itself is the backdrop filter set inline once the lens is drawn; this
// is the glass around it. `--tx-glass-lift` (0 at rest, 1 held down) lifts the shadows and is driven by
// `useLiquidDrag`; `--tx-glass-unit` shrinks them for a lens smaller than the ~150px they are drawn for.
.tx-glass-surface--lens {
  --tx-glass-lift: 0;
  --tx-glass-edge: color-mix(in srgb, var(--tx-text-color-primary, #000) 9%, transparent);

  background-repeat: no-repeat;
  background-size: 100% 100%;
  // Light comes from the top left, so the cast falls down and to the right at x:y = 1:2, and the inner
  // shades sit opposite: dark under the lit edge, light under the far one.
  box-shadow:
    calc((2px + 6px * var(--tx-glass-lift)) * var(--tx-glass-unit, 1))
      calc((4px + 12px * var(--tx-glass-lift)) * var(--tx-glass-unit, 1))
      calc((9px + 15px * var(--tx-glass-lift)) * var(--tx-glass-unit, 1))
      rgb(0 0 0 / calc(0.16 + 0.06 * var(--tx-glass-lift))),
    inset
      calc(2px * var(--tx-glass-lift) * var(--tx-glass-unit, 1))
      calc((2px + 6px * var(--tx-glass-lift)) * var(--tx-glass-unit, 1))
      calc(24px * var(--tx-glass-unit, 1))
      rgb(0 0 0 / calc(0.2 + 0.07 * var(--tx-glass-lift))),
    inset
      calc(-2px * var(--tx-glass-lift) * var(--tx-glass-unit, 1))
      calc((-2px - 6px * var(--tx-glass-lift)) * var(--tx-glass-unit, 1))
      calc(24px * var(--tx-glass-unit, 1))
      rgb(255 255 255 / calc(0.2 + 0.07 * var(--tx-glass-lift))),
    inset 0 0 0 0.5px var(--tx-glass-edge);

  // Where the SVG filter cannot run (Safari, Firefox, before the lens is measured) the lens is plain frosted glass.
  &:not(.is-refracting) {
    -webkit-backdrop-filter: blur(max(var(--tx-glass-frost, 0px), 12px)) saturate(1.7) brightness(1.06);
    backdrop-filter: blur(max(var(--tx-glass-frost, 0px), 12px)) saturate(1.7) brightness(1.06);
  }

  // The base rule above already makes it opaque; what is left to swap is the shading for an outline.
  @include tx-when-high-contrast {
    box-shadow: inset 0 0 0 1px var(--tx-border-color, currentcolor);
  }
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
