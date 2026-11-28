<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * One faint wash, grained two ways.
 *
 * Right: TxStatusHint's wash as shipped. The tone's colour sits behind a mask that is
 * its gradient (strength 0.26, or 0.2 under a dark theme; 0.45 of it by 38%; gone at the
 * end) intersected with fractal noise (feTurbulence .85, 3 octaves, 140 px tiles) whose
 * alpha is remapped with slope 1.6 and intercept −0.2. Contrast ×k scales that slope
 * about the noise's mean (slope 1.6k, intercept 0.6 − 0.8k), so ×1 is the component.
 *
 * Left: the same gradient multiplied by the noise's mean alpha, 0.6 = 1.6 × 0.5 − 0.2,
 * so both washes carry the same average tint, and the same noise turned into a grey
 * layer (grey = 1.6k·a + 0.5 − 0.8k, clamped) blended over it with `overlay`.
 *
 * The readouts use the theme's own colours, read back through a canvas: the largest
 * change the grain can make at the wash's leading edge, at the ends of each noise
 * mapping, in 8-bit levels.
 */

type Rgb = [number, number, number]

const { locale } = useI18n()

const NOISE_SLOPE = 1.6
const NOISE_INTERCEPT = -0.2
/** The noise's alpha averages 0.5 before the remap, so the remapped mean is 0.6. */
const NOISE_MEAN = NOISE_SLOPE * 0.5 + NOISE_INTERCEPT
const STRENGTH_LIGHT = 0.26
const STRENGTH_DARK = 0.2
const BOX_H = 64
const LOUPE = 112
const ZOOM = 4

const contrast = ref(1)
const overlayOpacity = ref(5)
const sample = ref({ x: 0.08, y: 0.5 })
const innerWidth = ref(0)
const dark = ref(false)
const accent = ref<Rgb>([103 / 255, 194 / 255, 58 / 255])
const page = ref<Rgb>([1, 1, 1])
const supportsComposite = ref(true)

const maskBoxRef = ref<HTMLElement | null>(null)
const accentProbe = ref<HTMLElement | null>(null)
const pageProbe = ref<HTMLElement | null>(null)

let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let colorContext: CanvasRenderingContext2D | null = null

const copy = computed(() => locale.value === 'zh'
  ? {
      hint: '已复制到剪贴板',
      overlayTitle: 'Overlay 叠加颗粒',
      overlayNote: '同样的平均浓度（强度 × 0.6），同一张噪声做成灰度层，用 overlay 叠在色洗和页面之上。',
      maskTitle: '颗粒写进 alpha 遮罩',
      maskNote: '照搬 TxStatusHint：渐变与噪声的 alpha 做 mask-composite: intersect，颗粒只存在于色洗之内。',
      unsupported: '此浏览器不支持 mask-composite，TxStatusHint 在这里不画色洗',
      contrast: '颗粒对比度（×1 为 TxStatusHint）',
      opacity: 'Overlay 层不透明度',
      meanWash: '前缘平均色洗',
      overlayTint: 'Overlay · 色洗内最大改变',
      overlayPage: 'Overlay · 色洗外最大改变',
      maskTint: '遮罩 · 色洗内最大改变',
      maskPage: '遮罩 · 色洗外',
      levels: (value: string) => `${value} 级`,
      caption: '两边是同一条色洗：TxStatusHint 的 success 色，前缘强度 0.26（暗色主题 0.2），38% 处降到 0.45 倍，末端为 0；颗粒是同一张 feTurbulence 分形噪声（baseFrequency .85、3 个八度、140 px 平铺），对比度 ×1 即组件原值（slope 1.6、intercept −0.2，平均 alpha 0.6，所以前缘读作约 16%）。数字按当前主题的颜色、取噪声映射的两端算出，单位是 8 位色阶：5% 的 overlay 只改动一两个色阶，肉眼看不出；不透明度推得很高才显形，而且在深色页面上，色洗以外的底色也会一起起麻点。遮罩颗粒改的是色洗透出多少，色洗以外的像素一个都不动。把指针移到色洗上可以挪动放大镜；放大镜只放大色洗层，不含文字。',
    }
  : {
      hint: 'Copied to clipboard',
      overlayTitle: 'Grain blended with overlay',
      overlayNote: 'The same average density (strength × 0.6), with the same noise as a grey layer blended over the wash and the page with overlay.',
      maskTitle: 'Grain in the alpha mask',
      maskNote: 'TxStatusHint as shipped: the gradient and the noise alpha meet in mask-composite: intersect, so the grain exists only inside the wash.',
      unsupported: 'This browser lacks mask-composite, so TxStatusHint draws no wash here',
      contrast: 'Grain contrast (×1 is TxStatusHint)',
      opacity: 'Overlay layer opacity',
      meanWash: 'Mean wash at the leading edge',
      overlayTint: 'Overlay · largest change inside the wash',
      overlayPage: 'Overlay · largest change beyond the wash',
      maskTint: 'Mask · largest change inside the wash',
      maskPage: 'Mask · beyond the wash',
      levels: (value: string) => `${value} levels`,
      caption: 'Both sides carry the same wash: TxStatusHint\'s success colour at strength 0.26 on the leading edge (0.2 in dark themes), 0.45 of that by 38%, nothing at the end. The grain is the same feTurbulence fractal noise (baseFrequency .85, 3 octaves, 140 px tiles), and contrast ×1 is the component\'s own (slope 1.6, intercept −0.2, mean alpha 0.6, which is why the leading edge reads as about 16%). The numbers use the current theme\'s colours at the ends of each noise mapping, in 8-bit levels: a 5% overlay moves a pixel by a level or two, too little to see; it shows only once its opacity is pushed far up, and on a dark page it then speckles the page beyond the wash as well. The mask grain changes how much of the wash shows through and leaves every pixel beyond the wash untouched. Move the pointer over a wash to move the loupe; it magnifies the wash layer only, not the text.',
    })

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function formatNumber(value: number) {
  return String(Number(value.toFixed(3)))
}

function svgUrl(svg: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** TxStatusHint's noise tile, with `primitives` after the turbulence. */
function noiseTile(filterAttributes: string, primitives: string) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'${filterAttributes}><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/>${primitives}</filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
}

const slope = computed(() => NOISE_SLOPE * contrast.value)
const maskIntercept = computed(() => NOISE_MEAN - (NOISE_SLOPE / 2) * contrast.value)
const greyIntercept = computed(() => 0.5 - (NOISE_SLOPE / 2) * contrast.value)

const maskGrain = computed(() => svgUrl(noiseTile(
  '',
  `<feComponentTransfer><feFuncA type='linear' slope='${formatNumber(slope.value)}' intercept='${formatNumber(maskIntercept.value)}'/></feComponentTransfer>`,
)))

// The noise's alpha copied into R, G and B, so the grey layer is the mask's own grain;
// sRGB keeps a grey of 0.5 at 0.5, overlay's neutral point.
const overlayGrain = computed(() => {
  const transfer = `type='linear' slope='${formatNumber(slope.value)}' intercept='${formatNumber(greyIntercept.value)}'`
  return svgUrl(noiseTile(
    ' color-interpolation-filters=\'sRGB\'',
    `<feColorMatrix type='matrix' values='0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1'/><feComponentTransfer><feFuncR ${transfer}/><feFuncG ${transfer}/><feFuncB ${transfer}/></feComponentTransfer>`,
  ))
})

const strength = computed(() => (dark.value ? STRENGTH_DARK : STRENGTH_LIGHT))

const rootStyle = computed(() => ({
  '--nm-strength': String(strength.value),
  '--nm-mean': String(NOISE_MEAN),
  '--nm-mask-grain': maskGrain.value,
  '--nm-overlay-grain': overlayGrain.value,
  '--nm-overlay-opacity': String(overlayOpacity.value / 100),
}))

function overlayChannel(backdrop: number, source: number) {
  return backdrop <= 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source)
}

const greyEnds = computed(() => [clamp01(0.5 - (NOISE_SLOPE / 2) * contrast.value), clamp01(0.5 + (NOISE_SLOPE / 2) * contrast.value)])
const alphaEnds = computed(() => [clamp01(maskIntercept.value), clamp01(maskIntercept.value + slope.value)])

/** The smooth wash's leading-edge colour, the backdrop the overlay grain blends with. */
const leadingEdge = computed<Rgb>(() => page.value.map((p, i) => p + strength.value * NOISE_MEAN * (accent.value[i]! - p)) as Rgb)

function overlaySwing(base: Rgb) {
  const opacity = overlayOpacity.value / 100
  let worst = 0
  for (const channel of base) {
    for (const grey of greyEnds.value)
      worst = Math.max(worst, Math.abs(opacity * (overlayChannel(channel, grey) - channel)))
  }
  return worst * 255
}

const overlayTintSwing = computed(() => overlaySwing(leadingEdge.value))
const overlayPageSwing = computed(() => overlaySwing(page.value))
const maskTintSwing = computed(() => {
  let worst = 0
  accent.value.forEach((channel, i) => {
    for (const alpha of alphaEnds.value)
      worst = Math.max(worst, Math.abs(strength.value * (alpha - NOISE_MEAN) * (channel - page.value[i]!)))
  })
  return worst * 255
})

const loupeStyle = computed(() => {
  const x = sample.value.x * innerWidth.value
  const y = sample.value.y * (BOX_H - 2)
  return {
    width: `${innerWidth.value}px`,
    height: `${BOX_H - 2}px`,
    transform: `translate(${LOUPE / 2 - x * ZOOM}px, ${LOUPE / 2 - y * ZOOM}px) scale(${ZOOM})`,
  }
})

const markerStyle = computed(() => ({
  left: `${sample.value.x * 100}%`,
  top: `${sample.value.y * 100}%`,
  width: `${LOUPE / ZOOM}px`,
  height: `${LOUPE / ZOOM}px`,
}))

function onSample(event: PointerEvent) {
  const box = event.currentTarget as HTMLElement
  const rect = box.getBoundingClientRect()
  if (!box.clientWidth || !box.clientHeight)
    return
  sample.value = {
    x: clamp01((event.clientX - rect.left - box.clientLeft) / box.clientWidth),
    y: clamp01((event.clientY - rect.top - box.clientTop) / box.clientHeight),
  }
}

/** Any CSS colour as sRGB channels in 0–1, via a canvas (it parses whatever the engine serializes). */
function resolveColor(element: HTMLElement | null, fallback: Rgb): Rgb {
  if (!element)
    return fallback
  colorContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!colorContext)
    return fallback
  colorContext.clearRect(0, 0, 1, 1)
  colorContext.fillStyle = '#000'
  colorContext.fillStyle = getComputedStyle(element).color
  colorContext.fillRect(0, 0, 1, 1)
  const data = colorContext.getImageData(0, 0, 1, 1).data
  return [data[0]! / 255, data[1]! / 255, data[2]! / 255]
}

function readTheme() {
  // TxStatusHint's own test: `:is([data-theme='dark'], .dark) .tx-status-hint`.
  dark.value = Boolean(accentProbe.value?.closest('.dark, [data-theme="dark"]'))
  accent.value = resolveColor(accentProbe.value, accent.value)
  page.value = resolveColor(pageProbe.value, page.value)
}

function measure() {
  innerWidth.value = maskBoxRef.value?.clientWidth ?? 0
}

function formatContrast(value: number) {
  return `×${value.toFixed(2)}`
}

function formatOpacity(value: number) {
  return `${Math.round(value)}%`
}

function resetDemo() {
  contrast.value = 1
  overlayOpacity.value = 5
  sample.value = { x: 0.08, y: 0.5 }
}

onMounted(() => {
  supportsComposite.value = typeof CSS !== 'undefined' && CSS.supports('mask-composite', 'intersect')
  readTheme()
  measure()
  if (typeof ResizeObserver !== 'undefined' && maskBoxRef.value) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(maskBoxRef.value)
  }
  themeObserver = new MutationObserver(readTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  colorContext = null
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="nm-root" :style="rootStyle" :caption="copy.caption">
    <div class="cfig-split nm">
      <div class="cfig-panel">
        <div class="cfig-panel__title">
          {{ copy.overlayTitle }}
          <span class="cfig-badge">overlay</span>
        </div>
        <div class="nm-box" @pointerdown="onSample" @pointermove="onSample">
          <span class="nm-wash is-smooth" />
          <span class="nm-grain" />
          <span class="nm-text">{{ copy.hint }}</span>
          <span class="nm-marker" :style="markerStyle" />
        </div>
        <div class="nm-loupe" aria-hidden="true">
          <div class="nm-box is-clone" :style="loupeStyle">
            <span class="nm-wash is-smooth" />
            <span class="nm-grain" />
          </div>
          <span class="nm-loupe__tag">{{ ZOOM }}×</span>
        </div>
        <p class="cfig-panel__note">
          {{ copy.overlayNote }}
        </p>
      </div>

      <div class="cfig-panel">
        <div class="cfig-panel__title">
          {{ copy.maskTitle }}
          <span class="cfig-badge is-pass">mask-composite</span>
        </div>
        <div ref="maskBoxRef" class="nm-box" @pointerdown="onSample" @pointermove="onSample">
          <span class="nm-wash is-grain" />
          <span class="nm-text">{{ copy.hint }}</span>
          <span class="nm-marker" :style="markerStyle" />
        </div>
        <div class="nm-loupe" aria-hidden="true">
          <div class="nm-box is-clone" :style="loupeStyle">
            <span class="nm-wash is-grain" />
          </div>
          <span class="nm-loupe__tag">{{ ZOOM }}×</span>
        </div>
        <p class="cfig-panel__note">
          {{ copy.maskNote }}
        </p>
        <span v-if="!supportsComposite" class="cfig-badge is-fail">{{ copy.unsupported }}</span>
      </div>
      <span ref="accentProbe" class="nm-probe is-accent" />
      <span ref="pageProbe" class="nm-probe is-page" />
    </div>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.contrast }}</span>
        <TxSlider v-model="contrast" :min="0" :max="2" :step="0.05" show-value :format-value="formatContrast" :aria-label="copy.contrast" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.opacity }}</span>
        <TxSlider v-model="overlayOpacity" :min="0" :max="100" :step="1" show-value :format-value="formatOpacity" :aria-label="copy.opacity" />
      </label>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.meanWash }}</span>
        <span class="cfig-stat__value">{{ strength }} × {{ NOISE_MEAN.toFixed(1) }} = {{ (strength * NOISE_MEAN * 100).toFixed(1) }}%</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.overlayTint }}</span>
        <span class="cfig-stat__value">{{ copy.levels(overlayTintSwing.toFixed(1)) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.overlayPage }}</span>
        <span class="cfig-stat__value">{{ copy.levels(overlayPageSwing.toFixed(1)) }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.maskTint }}</span>
        <span class="cfig-stat__value">{{ copy.levels(maskTintSwing.toFixed(1)) }}</span>
      </span>
      <span class="cfig-stat is-pass">
        <span class="cfig-stat__label">{{ copy.maskPage }}</span>
        <span class="cfig-stat__value">{{ copy.levels('0') }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.nm {
  padding: 12px;
}

.nm-box {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 64px;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid var(--cfig-line);
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
  cursor: crosshair;
  touch-action: pan-y;
}

.nm-box.is-clone {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  cursor: auto;
  transform-origin: 0 0;
}

.nm-wash {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
}

.nm-wash.is-smooth {
  background-color: var(--tx-color-success, #67c23a);
  mask-image: linear-gradient(
    to right,
    rgb(0 0 0 / calc(var(--nm-strength, 0.26) * var(--nm-mean, 0.6))),
    rgb(0 0 0 / calc(var(--nm-strength, 0.26) * var(--nm-mean, 0.6) * 0.45)) 38%,
    transparent
  );
}

/* TxStatusHint's rule, with the grain tile and strength passed in. Without mask
   compositing it would paint a solid block, so there it paints nothing, as the
   component does. */
@supports (mask-composite: intersect) {
  .nm-wash.is-grain {
    background-color: var(--tx-color-success, #67c23a);
    mask-image:
      linear-gradient(
        to right,
        rgb(0 0 0 / var(--nm-strength, 0.26)),
        rgb(0 0 0 / calc(var(--nm-strength, 0.26) * 0.45)) 38%,
        transparent
      ),
      var(--nm-mask-grain);
    mask-size: 100% 100%, 140px 140px;
    mask-repeat: no-repeat, repeat;
    mask-composite: intersect;
  }
}

.nm-grain {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: var(--nm-overlay-grain);
  background-size: 140px 140px;
  mix-blend-mode: overlay;
  opacity: var(--nm-overlay-opacity, 0.05);
}

.nm-text {
  position: relative;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}

.nm-marker {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid var(--cfig-ink);
  border-radius: 50%;
  opacity: 0.5;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.nm-loupe {
  position: relative;
  width: 112px;
  height: 112px;
  overflow: hidden;
  border: 1px solid var(--cfig-line-strong);
  border-radius: 50%;
  background: var(--tx-bg-color, #fff);
}

.nm-loupe__tag {
  position: absolute;
  right: 14px;
  bottom: 10px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--tx-bg-color, #fff);
  color: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 11px;
}

.nm-probe {
  display: none;
}

.nm-probe.is-accent {
  color: var(--tx-color-success, #67c23a);
}

.nm-probe.is-page {
  color: var(--tx-bg-color, #fff);
}
</style>
