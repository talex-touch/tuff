<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * The smoothstep S(x) = 3x² − 2x³ against a straight line, driving a real
 * TxBaseSurface in refraction mode.
 *
 * TxBaseSurface already applies S to `refraction-strength` (value / 100), then a filmic
 * curve 1 − (1 − s)^1.65, then lerps its displacement scale from −110 to −360
 * (base-surface `filmicRefractionStrength` and `refractionModel`, filmic profile).
 * Passing the slider straight through therefore is the shipped smoothstep; the linear
 * comparison passes S⁻¹(x), so the component's own S cancels instead of being doubled.
 */

type Mapping = 'smoothstep' | 'linear'

const { locale } = useI18n()

const position = ref(0.3)
const mapping = ref<Mapping>('smoothstep')

const FILMIC_EXPONENT = 1.65
const SCALE_AT_ZERO = -110
const SCALE_AT_FULL = -360

// Plot units.
const PLOT_W = 300
const PLOT_H = 220
const PAD = { left: 34, right: 12, top: 14, bottom: 34 }
const SAMPLES = 80

const copy = computed(() => locale.value === 'zh'
  ? {
      label: (x: string, s: string) => `线性与 smoothstep 映射曲线：x = ${x} 时强度 s = ${s}`,
      position: '滑块位置 x',
      mapping: '映射',
      smoothstep: 'Smoothstep（组件现状）',
      linear: '线性（对照）',
      axisX: '滑块 x',
      axisY: '强度 s',
      legendLinear: '线性 s = x',
      legendSmooth: 'S(x) = 3x² − 2x³',
      legendFilmic: '再经胶片曲线（当前映射）',
      prop: '传入的 refraction-strength',
      eased: '组件内 S(值/100)',
      filmic: '胶片曲线之后',
      scale: '位移幅度 scale',
      slope: 'x 处斜率 ds/dx',
      surface: 'refraction-strength',
      caption: 'TxBaseSurface 收到 refraction-strength（0–100）后，先算 s = S(值/100)，再过一条胶片曲线 1 − (1 − s)^1.65，最后才映射成位移幅度（−110 到 −360）。“Smoothstep（组件现状）”把滑块值原样传进去；“线性（对照）”传入 S⁻¹(x)，让组件自己的 S 抵消掉，强度随滑块线性上升，两者的差别就只剩这条曲线本身。S 在两端斜率为 0，滑块在头尾挪一点，表面几乎不变；x = 0 时组件仍保留 −110 的位移幅度。',
    }
  : {
      label: (x: string, s: string) => `Linear and smoothstep mapping curves: at x = ${x} the strength s = ${s}`,
      position: 'Slider position x',
      mapping: 'Mapping',
      smoothstep: 'Smoothstep (as shipped)',
      linear: 'Linear (comparison)',
      axisX: 'Slider x',
      axisY: 'Strength s',
      legendLinear: 'Linear s = x',
      legendSmooth: 'S(x) = 3x² − 2x³',
      legendFilmic: 'After the filmic curve (current mapping)',
      prop: 'refraction-strength passed',
      eased: 'S(value / 100) in the component',
      filmic: 'After the filmic curve',
      scale: 'Displacement scale',
      slope: 'Slope ds/dx at x',
      surface: 'refraction-strength',
      caption: 'TxBaseSurface turns refraction-strength (0–100) into s = S(value / 100), passes s through a filmic curve 1 − (1 − s)^1.65, and only then maps it to a displacement scale between −110 and −360. "Smoothstep (as shipped)" passes the slider through unchanged; "Linear (comparison)" passes S⁻¹(x), so the component\'s own S cancels and strength rises linearly, leaving the curve itself as the only difference. S is flat at both ends, so a small move near 0 or 1 barely changes the surface; at x = 0 the component still keeps a scale of −110.',
    })

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

/** The inverse of smoothstep on [0, 1]: the root of 3t² − 2t³ = y that lies in [0, 1]. */
function inverseSmoothstep(value: number) {
  const y = clamp01(value)
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3)
}

function filmic(value: number) {
  return 1 - (1 - value) ** FILMIC_EXPONENT
}

/** What the figure hands TxBaseSurface as `refraction-strength`. */
const strengthProp = computed(() => 100 * (mapping.value === 'smoothstep' ? position.value : inverseSmoothstep(position.value)))
/** The component's own smoothstep of that value: S(x) when shipped, x for the comparison. */
const eased = computed(() => smoothstep(strengthProp.value / 100))
const filmicStrength = computed(() => filmic(eased.value))
const displacementScale = computed(() => Math.round(SCALE_AT_ZERO + (SCALE_AT_FULL - SCALE_AT_ZERO) * filmicStrength.value))
const slope = computed(() => (mapping.value === 'smoothstep' ? 6 * position.value * (1 - position.value) : 1))

function plotX(x: number) {
  return PAD.left + x * (PLOT_W - PAD.left - PAD.right)
}

function plotY(y: number) {
  return PLOT_H - PAD.bottom - y * (PLOT_H - PAD.top - PAD.bottom)
}

function trace(curve: (x: number) => number) {
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const x = i / SAMPLES
    return `${plotX(x).toFixed(2)},${plotY(curve(x)).toFixed(2)}`
  }).join(' ')
}

const linearTrace = trace(x => x)
const smoothTrace = trace(smoothstep)
const filmicTrace = computed(() => (mapping.value === 'smoothstep'
  ? trace(x => filmic(smoothstep(x)))
  : trace(x => filmic(x))))

const ticks = [0, 0.5, 1]

function formatPosition(value: number) {
  return value.toFixed(2)
}

function resetDemo() {
  position.value = 0.3
  mapping.value = 'smoothstep'
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="ss-root" :caption="copy.caption">
    <div class="ss">
      <svg class="ss__plot" :viewBox="`0 0 ${PLOT_W} ${PLOT_H}`" role="img" :aria-label="copy.label(position.toFixed(2), eased.toFixed(3))">
        <line
          v-for="tick in ticks"
          :key="`gy${tick}`"
          class="ss__grid"
          :x1="plotX(0)"
          :y1="plotY(tick)"
          :x2="plotX(1)"
          :y2="plotY(tick)"
        />
        <line
          v-for="tick in ticks"
          :key="`gx${tick}`"
          class="ss__grid"
          :x1="plotX(tick)"
          :y1="plotY(0)"
          :x2="plotX(tick)"
          :y2="plotY(1)"
        />
        <text v-for="tick in ticks" :key="`ty${tick}`" class="ss__tick" :x="plotX(0) - 6" :y="plotY(tick) + 3" text-anchor="end">{{ tick }}</text>
        <text v-for="tick in ticks" :key="`tx${tick}`" class="ss__tick" :x="plotX(tick)" :y="plotY(0) + 14" text-anchor="middle">{{ tick }}</text>
        <text class="ss__tick is-axis" :x="plotX(0.5)" :y="PLOT_H - 4" text-anchor="middle">{{ copy.axisX }}</text>
        <text class="ss__tick is-axis" :x="plotX(0) + 4" :y="plotY(1) - 3">{{ copy.axisY }}</text>

        <polyline class="ss__curve is-filmic" :points="filmicTrace" />
        <polyline class="ss__curve is-linear" :class="{ 'is-active': mapping === 'linear' }" :points="linearTrace" />
        <polyline class="ss__curve is-smooth" :class="{ 'is-active': mapping === 'smoothstep' }" :points="smoothTrace" />

        <line class="ss__guide" :x1="plotX(position)" :y1="plotY(0)" :x2="plotX(position)" :y2="plotY(1)" />
        <circle class="ss__dot is-linear" :class="{ 'is-active': mapping === 'linear' }" :cx="plotX(position)" :cy="plotY(position)" r="4" />
        <circle class="ss__dot is-smooth" :class="{ 'is-active': mapping === 'smoothstep' }" :cx="plotX(position)" :cy="plotY(smoothstep(position))" r="4" />
      </svg>

      <div class="ss__stage">
        <div class="ss__backdrop" aria-hidden="true">
          <span class="ss__blob is-1" />
          <span class="ss__blob is-2" />
          <span class="ss__blob is-3" />
          <span class="ss__word">Tuff</span>
        </div>
        <TxBaseSurface mode="refraction" :refraction-strength="strengthProp" :radius="16" class="ss__surface">
          <span class="ss__surface-body">
            <span class="ss__surface-label">{{ copy.surface }}</span>
            <span class="ss__surface-value cfig-mono">{{ strengthProp.toFixed(1) }}</span>
          </span>
        </TxBaseSurface>
      </div>
    </div>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.position }}</span>
        <TxSlider v-model="position" :min="0" :max="1" :step="0.01" show-value :format-value="formatPosition" :aria-label="copy.position" />
      </label>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.mapping }}</span>
        <TxRadioGroup v-model="mapping">
          <TxRadio value="smoothstep">
            {{ copy.smoothstep }}
          </TxRadio>
          <TxRadio value="linear">
            {{ copy.linear }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--ss-linear)"><span class="cfig-legend__swatch" />{{ copy.legendLinear }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--ss-smooth)"><span class="cfig-legend__swatch" />{{ copy.legendSmooth }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--ss-filmic)"><span class="cfig-legend__swatch" />{{ copy.legendFilmic }}</span>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.prop }}</span>
        <span class="cfig-stat__value">{{ strengthProp.toFixed(1) }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.eased }}</span>
        <span class="cfig-stat__value">{{ eased.toFixed(3) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.filmic }}</span>
        <span class="cfig-stat__value">{{ filmicStrength.toFixed(3) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.scale }}</span>
        <span class="cfig-stat__value">{{ displacementScale }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.slope }}</span>
        <span class="cfig-stat__value">{{ slope.toFixed(2) }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.ss-root {
  --ss-linear: var(--cfig-muted);
  --ss-smooth: var(--cfig-accent);
  --ss-filmic: var(--tx-color-warning, #e6a23c);
}

.ss {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 12px;
  padding: 10px;
}

.ss__plot {
  display: block;
  width: 100%;
  height: auto;
}

.ss__grid {
  stroke: var(--cfig-line);
  stroke-width: 1;
}

.ss__tick {
  fill: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 10px;
}

.ss__tick.is-axis {
  font-family: inherit;
  font-size: 10.5px;
}

.ss__curve {
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ss__curve.is-linear {
  stroke: var(--ss-linear);
  stroke-dasharray: 4 3;
}

.ss__curve.is-smooth {
  stroke: var(--ss-smooth);
}

.ss__curve.is-active {
  stroke-width: 2.6;
}

.ss__curve.is-filmic {
  stroke: var(--ss-filmic);
  stroke-width: 1.2;
  stroke-dasharray: 1.5 2.5;
}

.ss__guide {
  stroke: var(--cfig-muted);
  stroke-width: 0.8;
  stroke-dasharray: 2 3;
}

.ss__dot {
  fill: var(--tx-bg-color, #fff);
  stroke-width: 1.6;
}

.ss__dot.is-linear {
  stroke: var(--ss-linear);
}

.ss__dot.is-smooth {
  stroke: var(--ss-smooth);
}

.ss__dot.is-linear.is-active {
  fill: var(--ss-linear);
}

.ss__dot.is-smooth.is-active {
  fill: var(--ss-smooth);
}

.ss__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  overflow: hidden;
  border-radius: 12px;
}

.ss__backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 2px, transparent 2px 14px),
    linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
}

.ss__blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.6;
}

.ss__blob.is-1 {
  top: -30px;
  left: -10px;
  width: 140px;
  height: 140px;
  background: #ffd700;
}

.ss__blob.is-2 {
  right: 30px;
  bottom: -40px;
  width: 130px;
  height: 130px;
  background: #00d2ff;
}

.ss__blob.is-3 {
  top: 24px;
  right: -20px;
  width: 90px;
  height: 90px;
  background: #ff6b6b;
}

.ss__word {
  position: absolute;
  top: 50%;
  left: 50%;
  color: rgb(255 255 255 / 0.55);
  font-size: 64px;
  font-weight: 700;
  letter-spacing: 4px;
  transform: translate(-50%, -50%);
  user-select: none;
}

.ss__surface {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(72%, 260px);
  height: 112px;
  color: var(--tx-text-color-primary, #303133);
}

.ss__surface-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.ss__surface-label {
  font-size: 12px;
}

.ss__surface-value {
  font-size: 20px;
  font-weight: 600;
}
</style>
