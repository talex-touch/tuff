<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Snell's law drawn as a ray diagram: n₁ sin θ₁ = n₂ sin θ₂ at a flat boundary between
 * air (n = 1) and a glass whose index the slider sets at 532 nm.
 *
 * With dispersion on, each channel takes its own index from Cauchy's equation
 * n(λ) = A + B/λ². B is 0.00420 µm², close to BK7 crown glass, and A is chosen so that
 * n(532 nm) equals the slider; the exaggeration multiplies B, so ×1 is the real spread.
 * An index the exaggeration would push below 1 is held at 1.
 */

type Direction = 'in' | 'out'
type ChannelKey = 'r' | 'g' | 'b'

interface Ray {
  key: ChannelKey | 'single'
  index: number
  /** Refraction angle in degrees, or null when the ray is totally reflected. */
  refracted: number | null
}

const { locale } = useI18n()

const incidence = ref(40)
const glassIndex = ref(1.52)
const direction = ref<Direction>('in')
const dispersion = ref(false)
const exaggeration = ref(20)

const CAUCHY_B = 0.0042
const REFERENCE_NM = 532
const CHANNELS: Array<{ key: ChannelKey, nm: number }> = [
  { key: 'r', nm: 650 },
  { key: 'g', nm: 532 },
  { key: 'b', nm: 450 },
]

// Figure units: the boundary runs along y = HY, the rays meet it at (HX, HY).
const VIEW_W = 360
const VIEW_H = 250
const HX = 180
const HY = 125
const RAY = 110

const copy = computed(() => locale.value === 'zh'
  ? {
      label: (summary: string) => `光线折射示意：${summary}`,
      angle: '入射角 θ₁',
      index: '玻璃折射率 n（532 nm）',
      direction: '方向',
      airToGlass: '空气 → 玻璃',
      glassToAir: '玻璃 → 空气',
      dispersion: '色散',
      exaggeration: '色散放大（×1 为真实玻璃）',
      air: '空气',
      glass: '玻璃',
      refracted: '折射角 θ₂',
      tir: '全反射',
      critical: '临界角 θc',
      criticalNone: '无（n₁ ≤ n₂）',
      spread: '红–蓝分离（图中）',
      spreadReal: '红–蓝分离（×1）',
      cauchy: '柯西系数（图中）',
      channel: { r: '红 650 nm', g: '绿 532 nm', b: '蓝 450 nm', single: '折射光' },
      caption: '斯涅尔定律 n₁ sin θ₁ = n₂ sin θ₂。打开色散后，每个通道按柯西公式 n(λ) = A + B/λ² 取自己的折射率：B = 0.00420 µm²（接近 BK7 冕牌玻璃），A 取使 n(532 nm) 等于滑块的值；放大倍数只乘在 B 上，×1 时红蓝两束光只差零点几度。从玻璃射向空气、入射角超过临界角时，光线全部反射回玻璃。TuffEx 并不追踪光线：琉光模式对 R、G、B 各做一次 feDisplacementMap 位移背景，三次的位移幅度差一个按角度算出的小偏移量，这就是它的“色散”。',
    }
  : {
      label: (summary: string) => `Refraction ray diagram: ${summary}`,
      angle: 'Incidence θ₁',
      index: 'Glass index n (532 nm)',
      direction: 'Direction',
      airToGlass: 'Air → glass',
      glassToAir: 'Glass → air',
      dispersion: 'Dispersion',
      exaggeration: 'Dispersion exaggeration (×1 is real glass)',
      air: 'air',
      glass: 'glass',
      refracted: 'Refraction θ₂',
      tir: 'Total reflection',
      critical: 'Critical angle θc',
      criticalNone: 'None (n₁ ≤ n₂)',
      spread: 'Red–blue split (drawn)',
      spreadReal: 'Red–blue split (×1)',
      cauchy: 'Cauchy coefficients (drawn)',
      channel: { r: 'Red 650 nm', g: 'Green 532 nm', b: 'Blue 450 nm', single: 'Refracted ray' },
      caption: 'Snell\'s law, n₁ sin θ₁ = n₂ sin θ₂. With dispersion on, each channel takes its own index from Cauchy\'s n(λ) = A + B/λ²: B = 0.00420 µm² (close to BK7 crown glass), and A is chosen so n(532 nm) equals the slider. The exaggeration multiplies B only, so at ×1 the red and blue rays part by a fraction of a degree. Going from glass into air, a ray steeper than the critical angle reflects back entirely. TuffEx traces no rays: its refraction mode displaces the backdrop with one feDisplacementMap pass per channel, and the three passes differ in scale by a small, angle-derived offset. That offset is its dispersion.',
    })

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI
}

/** B/λ² with λ in µm. */
function cauchyTerm(nm: number) {
  const um = nm / 1000
  return CAUCHY_B / (um * um)
}

/** The channel's index at a given exaggeration; n(532 nm) stays on the slider's value. */
function channelIndex(nm: number, factor: number) {
  return Math.max(1, glassIndex.value + factor * (cauchyTerm(nm) - cauchyTerm(REFERENCE_NM)))
}

/** Refraction angle for a ray whose glass has index `index`, or null past the critical angle. */
function refract(index: number) {
  const sinIncidence = Math.sin(toRad(incidence.value))
  const sinRefracted = direction.value === 'in' ? sinIncidence / index : sinIncidence * index
  if (sinRefracted > 1)
    return null
  return toDeg(Math.asin(sinRefracted))
}

const rays = computed<Ray[]>(() => {
  if (!dispersion.value) {
    const index = glassIndex.value
    return [{ key: 'single', index, refracted: refract(index) }]
  }
  return CHANNELS.map((channel) => {
    const index = channelIndex(channel.nm, exaggeration.value)
    return { key: channel.key, index, refracted: refract(index) }
  })
})

/** Red–blue angular split at a given exaggeration, or null when either ray reflects. */
function spreadAt(factor: number) {
  const red = refract(channelIndex(650, factor))
  const blue = refract(channelIndex(450, factor))
  if (red == null || blue == null)
    return null
  return Math.abs(red - blue)
}

const drawnSpread = computed(() => spreadAt(exaggeration.value))
const realSpread = computed(() => spreadAt(1))

const cauchyA = computed(() => glassIndex.value - exaggeration.value * cauchyTerm(REFERENCE_NM))
const cauchyB = computed(() => exaggeration.value * CAUCHY_B)

/** Critical angle for the glass-to-air direction at the reference wavelength. */
const criticalAngle = computed(() => {
  if (direction.value === 'in' || glassIndex.value <= 1)
    return null
  return toDeg(Math.asin(1 / glassIndex.value))
})

const incidentStart = computed(() => {
  const a = toRad(incidence.value)
  return { x: HX - RAY * Math.sin(a), y: HY - RAY * Math.cos(a) }
})

function rayEnd(ray: Ray) {
  if (ray.refracted == null) {
    const a = toRad(incidence.value)
    return { x: HX + RAY * Math.sin(a), y: HY - RAY * Math.cos(a) }
  }
  const a = toRad(ray.refracted)
  return { x: HX + RAY * Math.sin(a), y: HY + RAY * Math.cos(a) }
}

/** A small arrowhead at `t` along the segment, pointing from `from` to `to`. */
function arrowHead(from: { x: number, y: number }, to: { x: number, y: number }, t: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const mx = from.x + dx * t
  const my = from.y + dy * t
  const tip = [mx + ux * 5, my + uy * 5]
  const left = [mx - ux * 4 - uy * 3.5, my - uy * 4 + ux * 3.5]
  const right = [mx - ux * 4 + uy * 3.5, my - uy * 4 - ux * 3.5]
  return [tip, left, right].map(point => `${point[0]!.toFixed(2)},${point[1]!.toFixed(2)}`).join(' ')
}

/** An arc around the hit point, between two screen angles (degrees, y pointing down). */
function arcPoints(radius: number, from: number, to: number) {
  const steps = 24
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = toRad(from + ((to - from) * i) / steps)
    return `${(HX + radius * Math.cos(a)).toFixed(2)},${(HY + radius * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

function labelAt(radius: number, angle: number) {
  const a = toRad(angle)
  return { x: HX + radius * Math.cos(a), y: HY + radius * Math.sin(a) }
}

/** The ray whose θ₂ the arc marks: the only one, or green. */
const markedRay = computed(() => rays.value.find(ray => ray.key === 'single' || ray.key === 'g')!)

const incidenceArc = computed(() => arcPoints(30, -90, -90 - incidence.value))
const incidenceLabel = computed(() => labelAt(44, -90 - incidence.value / 2))
const refractedArc = computed(() => {
  const angle = markedRay.value.refracted
  return angle == null ? '' : arcPoints(40, 90, 90 - angle)
})
const refractedLabel = computed(() => {
  const angle = markedRay.value.refracted
  return angle == null ? null : labelAt(56, 90 - angle / 2)
})

const glassOnTop = computed(() => direction.value === 'out')
const topIndex = computed(() => (glassOnTop.value ? glassIndex.value : 1))
const bottomIndex = computed(() => (glassOnTop.value ? 1 : glassIndex.value))

function formatAngle(value: number) {
  return `${value.toFixed(1)}°`
}

function formatIndex(value: number) {
  return value.toFixed(2)
}

function formatFactor(value: number) {
  return `×${Math.round(value)}`
}

function mediumLabel(isGlass: boolean, slot: 1 | 2, index: number) {
  const name = isGlass ? copy.value.glass : copy.value.air
  const wavelength = isGlass && dispersion.value ? ' (532 nm)' : ''
  return `n${slot === 1 ? '₁' : '₂'} = ${index.toFixed(3)}${wavelength} · ${name}`
}

function rayReadout(ray: Ray) {
  const angle = ray.refracted == null ? copy.value.tir : formatAngle(ray.refracted)
  return dispersion.value ? `n ${ray.index.toFixed(4)} · ${angle}` : angle
}

const ariaSummary = computed(() => {
  const parts = rays.value.map(ray => `${copy.value.channel[ray.key]} ${ray.refracted == null ? copy.value.tir : formatAngle(ray.refracted)}`)
  return copy.value.label(`θ₁ ${formatAngle(incidence.value)}, ${parts.join(', ')}`)
})

function resetDemo() {
  incidence.value = 40
  glassIndex.value = 1.52
  direction.value = 'in'
  dispersion.value = false
  exaggeration.value = 20
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="ray-root" :caption="copy.caption">
    <svg class="ray" :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" role="img" :aria-label="ariaSummary">
      <rect class="ray__medium" :class="{ 'is-glass': glassOnTop }" x="0" y="0" :width="VIEW_W" :height="HY" />
      <rect class="ray__medium" :class="{ 'is-glass': !glassOnTop }" x="0" :y="HY" :width="VIEW_W" :height="VIEW_H - HY" />
      <line class="ray__boundary" x1="0" :y1="HY" :x2="VIEW_W" :y2="HY" />
      <line class="ray__normal" :x1="HX" y1="14" :x2="HX" :y2="VIEW_H - 14" />

      <text class="ray__medium-label" x="12" y="22">{{ mediumLabel(glassOnTop, 1, topIndex) }}</text>
      <text class="ray__medium-label" x="12" :y="VIEW_H - 12">{{ mediumLabel(!glassOnTop, 2, bottomIndex) }}</text>

      <polyline class="ray__arc" :points="incidenceArc" />
      <text class="ray__angle-label" :x="incidenceLabel.x" :y="incidenceLabel.y + 4" text-anchor="middle">θ₁</text>
      <template v-if="refractedLabel">
        <polyline class="ray__arc" :points="refractedArc" />
        <text class="ray__angle-label" :x="refractedLabel.x" :y="refractedLabel.y + 4" text-anchor="middle">θ₂</text>
      </template>

      <line class="ray__beam is-incident" :x1="incidentStart.x" :y1="incidentStart.y" :x2="HX" :y2="HY" />
      <polygon class="ray__head is-incident" :points="arrowHead(incidentStart, { x: HX, y: HY }, 0.55)" />

      <g v-for="ray in rays" :key="ray.key" class="ray__channel" :class="`is-${ray.key}`">
        <line class="ray__beam" :class="{ 'is-reflected': ray.refracted == null }" :x1="HX" :y1="HY" :x2="rayEnd(ray).x" :y2="rayEnd(ray).y" />
        <polygon class="ray__head" :points="arrowHead({ x: HX, y: HY }, rayEnd(ray), 0.62)" />
      </g>
    </svg>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.angle }}</span>
        <TxSlider v-model="incidence" :min="0" :max="89" :step="0.5" show-value :format-value="formatAngle" :aria-label="copy.angle" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.index }}</span>
        <TxSlider v-model="glassIndex" :min="1" :max="2" :step="0.01" show-value :format-value="formatIndex" :aria-label="copy.index" />
      </label>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.direction }}</span>
        <TxRadioGroup v-model="direction">
          <TxRadio value="in">
            {{ copy.airToGlass }}
          </TxRadio>
          <TxRadio value="out">
            {{ copy.glassToAir }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-control">
        <TxSwitch v-model="dispersion" :label="copy.dispersion" />
      </div>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.exaggeration }}</span>
        <TxSlider v-model="exaggeration" :min="1" :max="40" :step="1" :disabled="!dispersion" show-value :format-value="formatFactor" :aria-label="copy.exaggeration" />
      </label>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.angle }}</span>
        <span class="cfig-stat__value">{{ formatAngle(incidence) }}</span>
      </span>
      <span v-for="ray in rays" :key="ray.key" class="cfig-stat ray-stat" :class="`is-${ray.key}`">
        <span class="cfig-stat__label">{{ dispersion ? copy.channel[ray.key] : copy.refracted }}</span>
        <span class="cfig-stat__value">{{ rayReadout(ray) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.critical }}</span>
        <span class="cfig-stat__value">{{ criticalAngle == null ? copy.criticalNone : formatAngle(criticalAngle) }}</span>
      </span>
      <template v-if="dispersion">
        <span class="cfig-stat is-accent">
          <span class="cfig-stat__label">{{ copy.spread }}</span>
          <span class="cfig-stat__value">{{ drawnSpread == null ? '—' : `${drawnSpread.toFixed(2)}°` }}</span>
        </span>
        <span class="cfig-stat">
          <span class="cfig-stat__label">{{ copy.spreadReal }}</span>
          <span class="cfig-stat__value">{{ realSpread == null ? '—' : `${realSpread.toFixed(2)}°` }}</span>
        </span>
        <span class="cfig-stat">
          <span class="cfig-stat__label">{{ copy.cauchy }}</span>
          <span class="cfig-stat__value">A {{ cauchyA.toFixed(4) }} · B {{ cauchyB.toFixed(4) }} µm²</span>
        </span>
      </template>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.ray-root {
  --ray-r: #e5484d;
  --ray-g: #1f9d55;
  --ray-b: #3b74f0;
  --ray-single: var(--cfig-accent);
}

.ray {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
  margin: 0 auto;
}

.ray__medium {
  fill: transparent;
}

.ray__medium.is-glass {
  fill: color-mix(in srgb, var(--cfig-accent) 9%, transparent);
}

.ray__boundary {
  stroke: var(--cfig-line-strong);
  stroke-width: 1.2;
}

.ray__normal {
  stroke: var(--cfig-muted);
  stroke-width: 0.8;
  stroke-dasharray: 3 3;
  opacity: 0.7;
}

.ray__medium-label,
.ray__angle-label {
  fill: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 10.5px;
}

.ray__angle-label {
  fill: var(--cfig-ink);
  font-size: 11px;
}

.ray__arc {
  fill: none;
  stroke: var(--cfig-muted);
  stroke-width: 1;
}

.ray__channel.is-r {
  --ray-color: var(--ray-r);
}

.ray__channel.is-g {
  --ray-color: var(--ray-g);
}

.ray__channel.is-b {
  --ray-color: var(--ray-b);
}

.ray__channel.is-single {
  --ray-color: var(--ray-single);
}

.ray__beam {
  stroke: var(--ray-color, var(--cfig-ink));
  stroke-width: 2;
  stroke-linecap: round;
}

.ray__beam.is-incident {
  stroke: var(--cfig-ink);
}

.ray__beam.is-reflected {
  stroke-dasharray: 5 3;
}

.ray__head {
  fill: var(--ray-color, var(--cfig-ink));
}

.ray__head.is-incident {
  fill: var(--cfig-ink);
}

.ray-stat.is-r {
  --ray-color: var(--ray-r);
}

.ray-stat.is-g {
  --ray-color: var(--ray-g);
}

.ray-stat.is-b {
  --ray-color: var(--ray-b);
}

.ray-stat.is-single {
  --ray-color: var(--ray-single);
}

/* The channel's colour as a swatch, so the label text keeps the readout's contrast. */
.ray-stat .cfig-stat__label::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 5px;
  border-radius: 50%;
  background: var(--ray-color);
  vertical-align: 0;
}
</style>
