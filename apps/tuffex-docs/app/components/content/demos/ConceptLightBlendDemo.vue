<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two beams crossing on a dark or a light surface. On dark they add (`mix-blend-mode:
 * plus-lighter`), so the overlap climbs towards white whatever the hues; on light they blend
 * normally, the overlap is a weighted average of the two colours, and it loses chroma as the
 * hues move apart.
 *
 * Hues are oklch angles, as in TxPrismGlow, at its tint lightness and chroma for each surface. A
 * colour outside sRGB keeps its lightness and hue and gives up chroma, so the stage, the
 * swatches and the numbers all use the same sRGB colours. Overlaps are composited on the
 * encoded sRGB values, as the browser composites them.
 */

type Rgb = [number, number, number]
type Surface = 'light' | 'dark'
type Blend = 'normal' | 'plus-lighter' | 'screen'
type Zone = 'within' | 'clash'

interface Preset {
  key: 'dark' | 'light'
  a: number
  b: number
}

function decode(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function encode(channel: number) {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
}

/** OKLab to linear sRGB. */
function oklabToLinear(l: number, a: number, b: number): Rgb {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ]
}

function inGamut(rgb: Rgb) {
  return rgb.every(channel => channel >= -1e-4 && channel <= 1 + 1e-4)
}

/** An oklch colour in encoded sRGB, its chroma reduced until it fits. */
function oklchToSrgb(l: number, c: number, hue: number): Rgb {
  const angle = (hue * Math.PI) / 180
  const at = (chroma: number) => oklabToLinear(l, chroma * Math.cos(angle), chroma * Math.sin(angle))
  let linear = at(c)
  if (!inGamut(linear)) {
    let low = 0
    let high = c
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2
      if (inGamut(at(mid)))
        low = mid
      else
        high = mid
    }
    linear = at(low)
  }
  return linear.map(channel => encode(Math.min(1, Math.max(0, channel)))) as Rgb
}

/** Encoded sRGB to OKLCH lightness and chroma. */
function toOklch(rgb: Rgb) {
  const [r, g, b] = rgb.map(decode) as Rgb
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, c: Math.hypot(okA, okB) }
}

/** One beam of `source` at `alpha` over an opaque `backdrop`. */
function composite(source: Rgb, alpha: number, backdrop: Rgb, blend: Blend): Rgb {
  return source.map((channel, i) => {
    const under = backdrop[i]!
    if (blend === 'plus-lighter')
      return Math.min(1, channel * alpha + under)
    if (blend === 'screen')
      return under + alpha * channel * (1 - under)
    return channel * alpha + under * (1 - alpha)
  }) as Rgb
}

function css([r, g, b]: Rgb, alpha = 1) {
  return `rgb(${(r * 255).toFixed(1)} ${(g * 255).toFixed(1)} ${(b * 255).toFixed(1)} / ${alpha})`
}

function toHex(rgb: Rgb) {
  return `#${rgb.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
}

/** Degrees between two hues, the short way round. */
function hueGap(a: number, b: number) {
  const gap = Math.abs(a - b) % 360
  return Math.min(gap, 360 - gap)
}

function polar(radius: number, hue: number) {
  const angle = (hue * Math.PI) / 180
  return { x: 60 + radius * Math.sin(angle), y: 60 - radius * Math.cos(angle) }
}

// TxPrismGlow's tint per surface (`--tx-prism-glow-l` / `-c`), at its core opacity.
const SURFACES: Record<Surface, { l: number, c: number, alpha: number, bg: Rgb, ink: string }> = {
  light: { l: 0.76, c: 0.19, alpha: 0.5, bg: [1, 1, 1], ink: '#303133' },
  dark: { l: 0.74, c: 0.19, alpha: 0.78, bg: [20 / 255, 20 / 255, 20 / 255], ink: '#e5eaf3' },
}

// TxPrismGlow's cones 2 and 6, which set off together (prism-glow/src/cones.ts): their hues in
// the dark order, then in the light order, which gives cone 2 cone 4's purple.
const PRESETS: Preset[] = [
  { key: 'dark', a: 95, b: 258 },
  { key: 'light', a: 300, b: 258 },
]

const RING_OUTER = 54
const RING_INNER = 40
const RING_STEP = 5

const { locale } = useI18n()

const surface = ref<Surface>('light')
const hueA = ref(PRESETS[0]!.a)
const hueB = ref(PRESETS[0]!.b)
const plusLighter = ref(true)

onMounted(() => {
  plusLighter.value = typeof CSS !== 'undefined' && CSS.supports('mix-blend-mode', 'plus-lighter')
})

const copy = computed(() => locale.value === 'zh'
  ? {
      field: (a: number, b: number, light: boolean) => `${light ? '白底' : '暗底'}上色相 ${a}° 与 ${b}° 的两束光交叠`,
      wheel: (a: number, b: number, gap: number) => `色相环：A ${a}°，B ${b}°，相差 ${gap}°`,
      surface: '底色',
      light: '浅色底',
      dark: '暗色底',
      hueA: '光束 A 色相',
      hueB: '光束 B 色相',
      presets: { dark: '暗色顺序：黄 95° + 蓝 258°', light: '浅色顺序：紫 300° + 蓝 258°' } as Record<Preset['key'], string>,
      gap: '色相差',
      zones: { within: '120° 以内', clash: '超出 120° 准则' } as Record<Zone, string>,
      darkZone: '暗底叠加趋白，不受色相差限制',
      chroma: '重叠处色度',
      chromaValue: (keep: number) => `两束平均的 ${keep}%`,
      lightness: '重叠处亮度',
      lightnessValue: (l: string) => `L ${l}（纯白 = 1）`,
      overlap: 'A+B 中心',
      fallback: '当前浏览器不支持 plus-lighter，暗底改用 screen 混合演示，数值也按 screen 计算。',
      caption: '两个预设是 TxPrismGlow 开场同行的 2 号与 6 号光束：暗色顺序里是黄与蓝，浅色顺序把 2 号换成紫。色相取 oklch 角度，亮度与色度沿用 TxPrismGlow 的光色：浅色底 L 0.76、C 0.19，透明度 50%；暗色底 L 0.74、C 0.19，透明度 78%。超出 sRGB 的颜色保持亮度与色相，只降色度。暗底用 mix-blend-mode: plus-lighter，重叠处逐通道相加、逼近白色；白底用普通透明度混合，重叠处是两束颜色的加权平均，色相差越大，平均色越灰。重叠处色度是 OKLCH 色度与两束各自色度平均值之比，按浏览器的 sRGB 合成方式实时计算。',
    }
  : {
      field: (a: number, b: number, light: boolean) => `Two beams at hues ${a}° and ${b}° crossing on a ${light ? 'light' : 'dark'} surface`,
      wheel: (a: number, b: number, gap: number) => `Hue wheel: A at ${a}°, B at ${b}°, ${gap}° apart`,
      surface: 'Surface',
      light: 'Light',
      dark: 'Dark',
      hueA: 'Beam A hue',
      hueB: 'Beam B hue',
      presets: { dark: 'Dark order: yellow 95° + blue 258°', light: 'Light order: purple 300° + blue 258°' } as Record<Preset['key'], string>,
      gap: 'Hue difference',
      zones: { within: 'Within 120°', clash: 'Past the 120° rule' } as Record<Zone, string>,
      darkZone: 'Adds up towards white on dark, at any hue difference',
      chroma: 'Chroma where they overlap',
      chromaValue: (keep: number) => `${keep}% of the beams' average`,
      lightness: 'Lightness where they overlap',
      lightnessValue: (l: string) => `L ${l} (white = 1)`,
      overlap: 'A+B centre',
      fallback: 'This browser does not support plus-lighter, so the dark surface blends with screen, and the numbers follow screen.',
      caption: 'The presets are TxPrismGlow\'s cones 2 and 6, which set off together: yellow and blue in the dark order, purple for cone 2 in the light order. Hues are oklch angles, at TxPrismGlow\'s tint: L 0.76 and C 0.19 at 50% opacity on light, L 0.74 and C 0.19 at 78% on dark. A colour outside sRGB keeps its lightness and hue and gives up chroma. On dark the beams use mix-blend-mode: plus-lighter, so the overlap adds channel by channel towards white; on light they blend normally and the overlap is a weighted average of the two colours, greyer the further apart the hues. The overlap\'s chroma is its OKLCH chroma over the mean of the two beams\' own, composited in sRGB as the browser does and computed live.',
    })

const blend = computed<Blend>(() => {
  if (surface.value === 'light')
    return 'normal'
  return plusLighter.value ? 'plus-lighter' : 'screen'
})

const tints = computed(() => {
  const { l, c } = SURFACES[surface.value]
  return { a: oklchToSrgb(l, c, hueA.value), b: oklchToSrgb(l, c, hueB.value) }
})

const colours = computed(() => {
  const { alpha, bg } = SURFACES[surface.value]
  const a = composite(tints.value.a, alpha, bg, blend.value)
  const b = composite(tints.value.b, alpha, bg, blend.value)
  // B is painted over A, as in the stage.
  return { a, b, overlap: composite(tints.value.b, alpha, a, blend.value) }
})

const gap = computed(() => Math.round(hueGap(hueA.value, hueB.value)))

const zone = computed<Zone>(() => gap.value <= 120 ? 'within' : 'clash')

const overlapStats = computed(() => {
  const [a, b, overlap] = [colours.value.a, colours.value.b, colours.value.overlap].map(toOklch)
  const mean = (a!.c + b!.c) / 2
  return {
    keep: mean > 0 ? Math.round((overlap!.c / mean) * 100) : 0,
    lightness: overlap!.l.toFixed(2),
  }
})

function beamStyle(tint: Rgb) {
  const { alpha } = SURFACES[surface.value]
  return {
    background: `radial-gradient(closest-side, ${css(tint, alpha)} 0%, ${css(tint, alpha)} 64%, ${css(tint, 0)} 100%)`,
    mixBlendMode: blend.value,
  }
}

const ring = computed(() => {
  const { l, c } = SURFACES[surface.value]
  return Array.from({ length: 360 / RING_STEP }, (_, i) => {
    const hue = i * RING_STEP
    // Half a degree of overlap hides the seams between segments.
    const start = hue - RING_STEP / 2 - 0.5
    const end = hue + RING_STEP / 2 + 0.5
    const p1 = polar(RING_OUTER, start)
    const p2 = polar(RING_OUTER, end)
    const p3 = polar(RING_INNER, end)
    const p4 = polar(RING_INNER, start)
    return {
      hue,
      fill: css(oklchToSrgb(l, c, hue)),
      d: `M${p1.x.toFixed(2)} ${p1.y.toFixed(2)}A${RING_OUTER} ${RING_OUTER} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}L${p3.x.toFixed(2)} ${p3.y.toFixed(2)}A${RING_INNER} ${RING_INNER} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}Z`,
    }
  })
})

const arc = computed(() => {
  // Signed short way from A to B; the wheel runs clockwise from the top.
  let delta = ((hueB.value - hueA.value) % 360 + 360) % 360
  if (delta > 180)
    delta -= 360
  const radius = 31
  const from = polar(radius, hueA.value)
  const to = polar(radius, hueA.value + delta)
  return `M${from.x.toFixed(2)} ${from.y.toFixed(2)}A${radius} ${radius} 0 0 ${delta >= 0 ? 1 : 0} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
})

const markers = computed(() => [
  { key: 'A', hue: hueA.value, fill: css(tints.value.a) },
  { key: 'B', hue: hueB.value, fill: css(tints.value.b) },
].map(marker => ({ ...marker, dot: polar((RING_OUTER + RING_INNER) / 2, marker.hue) })))

const swatches = computed(() => [
  { key: 'a', label: `A · ${hueA.value}°`, colour: colours.value.a },
  { key: 'b', label: `B · ${hueB.value}°`, colour: colours.value.b },
  { key: 'overlap', label: copy.value.overlap, colour: colours.value.overlap },
].map(swatch => ({ ...swatch, fill: css(swatch.colour), hex: toHex(swatch.colour) })))

function applyPreset(preset: Preset) {
  hueA.value = preset.a
  hueB.value = preset.b
}

function isPreset(preset: Preset) {
  return hueA.value === preset.a && hueB.value === preset.b
}

function formatHue(value: number) {
  return `${Math.round(value)}°`
}

function resetDemo() {
  surface.value = 'light'
  applyPreset(PRESETS[0]!)
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="lbd-root" stage="plain" :caption="copy.caption">
    <div class="lbd">
      <div
        class="lbd-field"
        role="img"
        :aria-label="copy.field(hueA, hueB, surface === 'light')"
        :style="{ background: css(SURFACES[surface].bg), color: SURFACES[surface].ink }"
      >
        <span class="lbd-beam is-a" :style="beamStyle(tints.a)" />
        <span class="lbd-beam is-b" :style="beamStyle(tints.b)" />
        <span class="lbd-mark" />
        <span class="lbd-tag is-a cfig-mono">A · {{ hueA }}°</span>
        <span class="lbd-tag is-b cfig-mono">B · {{ hueB }}°</span>
      </div>
      <svg class="lbd-wheel" viewBox="0 0 120 120" role="img" :aria-label="copy.wheel(hueA, hueB, gap)">
        <path v-for="segment in ring" :key="segment.hue" :d="segment.d" :fill="segment.fill" />
        <path class="lbd-wheel__arc" :class="surface === 'light' ? `is-${zone}` : ''" :d="arc" />
        <g v-for="marker in markers" :key="marker.key">
          <circle class="lbd-wheel__dot" :cx="marker.dot.x" :cy="marker.dot.y" r="6" :fill="marker.fill" />
          <text class="lbd-wheel__key" :x="marker.dot.x" :y="marker.dot.y + 2.6" text-anchor="middle">{{ marker.key }}</text>
        </g>
        <text class="lbd-wheel__gap" x="60" y="64" text-anchor="middle">{{ gap }}°</text>
      </svg>
    </div>

    <template #controls>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.surface }}</span>
        <TxRadioGroup v-model="surface">
          <TxRadio value="light">
            {{ copy.light }}
          </TxRadio>
          <TxRadio value="dark">
            {{ copy.dark }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-control lbd-presets">
        <TxButton
          v-for="preset in PRESETS"
          :key="preset.key"
          size="sm"
          :variant="isPreset(preset) ? 'primary' : 'secondary'"
          @click="applyPreset(preset)"
        >
          {{ copy.presets[preset.key] }}
        </TxButton>
      </div>
      <label class="cfig-control lbd-slider">
        <span class="cfig-control__label">{{ copy.hueA }}</span>
        <TxSlider v-model="hueA" :min="0" :max="359" :step="1" show-value :format-value="formatHue" :aria-label="copy.hueA" />
      </label>
      <label class="cfig-control lbd-slider">
        <span class="cfig-control__label">{{ copy.hueB }}</span>
        <TxSlider v-model="hueB" :min="0" :max="359" :step="1" show-value :format-value="formatHue" :aria-label="copy.hueB" />
      </label>
    </template>

    <template #readout>
      <span class="cfig-stat" :class="surface === 'light' ? (zone === 'within' ? 'is-pass' : 'is-fail') : ''">
        <span class="cfig-stat__label">{{ copy.gap }}</span>
        <span class="cfig-stat__value">{{ gap }}° · {{ surface === 'light' ? copy.zones[zone] : copy.darkZone }}</span>
      </span>
      <span v-if="surface === 'light'" class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.chroma }}</span>
        <span class="cfig-stat__value">{{ copy.chromaValue(overlapStats.keep) }}</span>
      </span>
      <span v-else class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.lightness }}</span>
        <span class="cfig-stat__value">{{ copy.lightnessValue(overlapStats.lightness) }}</span>
      </span>
      <span v-for="swatch in swatches" :key="swatch.key" class="cfig-stat">
        <span class="cfig-stat__label">{{ swatch.label }}</span>
        <span class="cfig-stat__value lbd-swatch">
          <span class="lbd-swatch__chip" :style="{ background: swatch.fill }" />
          {{ swatch.hex }}
        </span>
      </span>
      <p v-if="surface === 'dark' && !plusLighter" class="lbd-note">
        {{ copy.fallback }}
      </p>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.lbd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.lbd-field {
  position: relative;
  flex: 1 1 280px;
  height: 230px;
  min-width: 0;
  overflow: hidden;
  border-radius: 12px;
  isolation: isolate;
}

.lbd-beam {
  position: absolute;
  top: 50%;
  width: 200px;
  height: 200px;
  translate: -50% -50%;
}

.lbd-beam.is-a {
  left: calc(50% - 48px);
}

.lbd-beam.is-b {
  left: calc(50% + 48px);
}

.lbd-mark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  opacity: 0.7;
  translate: -50% -50%;
}

.lbd-tag {
  position: absolute;
  bottom: 10px;
  font-size: 11px;
}

.lbd-tag.is-a {
  left: 12px;
}

.lbd-tag.is-b {
  right: 12px;
}

.lbd-wheel {
  flex: 0 0 132px;
  width: 132px;
  height: 132px;
  margin: 0 auto;
}

.lbd-wheel__arc {
  fill: none;
  stroke: var(--cfig-muted);
  stroke-width: 3;
  stroke-linecap: round;
}

.lbd-wheel__arc.is-within {
  stroke: var(--cfig-pass);
}

.lbd-wheel__arc.is-clash {
  stroke: var(--cfig-fail);
}

.lbd-wheel__dot {
  stroke: var(--tx-bg-color, #fff);
  stroke-width: 2;
}

.lbd-wheel__key {
  fill: #303133;
  font-size: 7px;
  font-weight: 600;
}

.lbd-wheel__gap {
  fill: var(--cfig-ink);
  font-family: var(--cfig-mono);
  font-size: 13px;
}

.lbd-presets {
  gap: 8px;
}

.lbd-slider {
  flex: 1 1 220px;
}

.lbd-swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lbd-swatch__chip {
  width: 12px;
  height: 12px;
  border: 1px solid var(--cfig-line-strong);
  border-radius: 3px;
}

.lbd-note {
  flex: 1 1 100%;
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
}
</style>
