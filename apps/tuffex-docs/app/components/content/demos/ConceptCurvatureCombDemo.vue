<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * A rounded corner drawn twice: a circular arc of radius R (what `border-radius`
 * draws) and a superellipse quadrant |x/a|^n + |y/a|^n = 1. The superellipse is
 * sized to cut the same depth along the 45° diagonal, so the two corners look
 * equally round and differ only in how the turning is spread out.
 *
 * Curvature is exact: for the superellipse κ = (n−1)/a · (uv)^(n−2) / (u^(2n−2) + v^(2n−2))^(3/2)
 * with u = x/a, v = y/a; for the arc it is 1/R. The comb draws κ as teeth along the
 * inward normal, the plot draws κ·R against arc length from the corner's midpoint.
 */

type View = 'both' | 'g1' | 'g2'

interface Sample {
  x: number
  y: number
  /** Inward unit normal, towards the centre of curvature. */
  nx: number
  ny: number
  kappa: number
  /** Arc length from the start of the path. */
  s: number
}

const { locale } = useI18n()

// Starts at the exponent TuffEx draws with: `tx-squircle` sets `corner-shape: superellipse(1.777)`.
const TUFFEX_EXPONENT = 2 ** 1.777

const exponent = ref(TUFFEX_EXPONENT)
const view = ref<View>('both')

// Figure units. The corner is the top-right one of a card: the top edge runs along
// y = TOP, the right edge along x = RIGHT.
const R = 56
const TOP = 34
const RIGHT = 306
const LEFT_END = 16
const BOTTOM_END = 296
const TOOTH = 34
const TOOTH_STEP = 5
const CORNER_SAMPLES = 360

const copy = computed(() => locale.value === 'zh'
  ? {
      label: 'G1 圆弧与 G2 超椭圆的曲率梳对比',
      plotLabel: '曲率 κ 沿弧长的分布',
      exponent: '超椭圆指数 n',
      view: '显示',
      both: '对比',
      g1: '圆弧 G1',
      g2: '超椭圆 G2',
      arc: '圆弧（border-radius）',
      squircle: '超椭圆',
      plotAxis: '弧长（以拐角中点为 0）',
      jumpArc: '圆弧衔接点曲率跳变',
      jumpSquircle: '超椭圆衔接点曲率跳变',
      peak: '超椭圆峰值曲率',
      reach: '超椭圆沿边延伸',
      caption: '梳齿长度 = 该点曲率。圆弧在直线与圆弧的衔接点，梳齿从 0 直接跳到 1/R，这一阶跃就是高光上看到的“折痕”；超椭圆从 0 平滑爬升，峰值更高但没有断点。两条曲线在 45° 方向切掉同样的深度，看起来一样圆。n = 2 时超椭圆退化为圆弧。',
    }
  : {
      label: 'Curvature combs of a G1 circular arc and a G2 superellipse',
      plotLabel: 'Curvature κ along the arc length',
      exponent: 'Superellipse exponent n',
      view: 'Show',
      both: 'Compare',
      g1: 'Arc G1',
      g2: 'Superellipse G2',
      arc: 'Circular arc (border-radius)',
      squircle: 'Superellipse',
      plotAxis: 'Arc length (0 at the corner midpoint)',
      jumpArc: 'Curvature jump where the arc meets the edge',
      jumpSquircle: 'Curvature jump where the superellipse meets the edge',
      peak: 'Superellipse peak curvature',
      reach: 'Superellipse reach along each edge',
      caption: 'Tooth length = curvature at that point. Where the arc meets the straight edge its comb jumps from 0 straight to 1/R: that step is the crease a highlight shows. The superellipse climbs from 0 smoothly, peaking higher but never breaking. Both curves cut the same depth along the 45° diagonal, so they read as equally round; at n = 2 the superellipse is the circle.',
    })

/** Edge extent a of the superellipse that cuts the arc's depth along the diagonal. */
const extent = computed(() => {
  const n = exponent.value
  return R * (1 - 2 ** -0.5) / (1 - 2 ** (-1 / n))
})

function straight(from: [number, number], to: [number, number], nx: number, ny: number, steps: number): Sample[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return { x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t, nx, ny, kappa: 0, s: 0 }
  })
}

/** Lead-in edge, corner, lead-out edge; arc length filled in afterwards. */
function cornerPath(corner: Sample[], a: number): Sample[] {
  const lead = straight([LEFT_END, TOP], [RIGHT - a, TOP], 0, 1, 24)
  const out = straight([RIGHT, TOP + a], [RIGHT, BOTTOM_END], -1, 0, 24)
  // Each joint appears twice, once per side, so a curvature step plots as a vertical jump.
  const path = [...lead, ...corner, ...out]
  let s = 0
  path.forEach((point, index) => {
    if (index > 0)
      s += Math.hypot(point.x - path[index - 1]!.x, point.y - path[index - 1]!.y)
    point.s = s
  })
  return path
}

const arcPath = computed(() => {
  const cx = RIGHT - R
  const cy = TOP + R
  const corner = Array.from({ length: CORNER_SAMPLES + 1 }, (_, i) => {
    const phi = (Math.PI / 2) * (1 - i / CORNER_SAMPLES)
    const ux = Math.cos(phi)
    const uy = -Math.sin(phi)
    return { x: cx + R * ux, y: cy + R * uy, nx: -ux, ny: -uy, kappa: 1 / R, s: 0 }
  })
  return cornerPath(corner, R)
})

const squirclePath = computed(() => {
  const n = exponent.value
  const a = extent.value
  const cx = RIGHT - a
  const cy = TOP + a
  const corner = Array.from({ length: CORNER_SAMPLES + 1 }, (_, i) => {
    const theta = (Math.PI / 2) * (1 - i / CORNER_SAMPLES)
    const c = Math.cos(theta)
    const sn = Math.sin(theta)
    const r = a / (c ** n + sn ** n) ** (1 / n)
    const u = Math.max(0, (r * c) / a)
    const v = Math.max(0, (r * sn) / a)
    const kappa = ((n - 1) / a) * (u * v) ** (n - 2) / (u ** (2 * n - 2) + v ** (2 * n - 2)) ** 1.5
    // Outward gradient of |u|^n + |v|^n is (u^(n−1), v^(n−1)); y is flipped on screen.
    const gx = u ** (n - 1)
    const gy = -(v ** (n - 1))
    const length = Math.hypot(gx, gy) || 1
    return { x: cx + r * c, y: cy - r * sn, nx: -gx / length, ny: -gy / length, kappa, s: 0 }
  })
  return cornerPath(corner, a)
})

function toPolyline(points: Array<{ x: number, y: number }>) {
  return points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

/** Samples at even arc-length steps, interpolated from the dense path. */
function resample(path: Sample[], step: number): Sample[] {
  const total = path[path.length - 1]!.s
  const result: Sample[] = []
  let index = 1
  for (let s = 0; s <= total; s += step) {
    while (index < path.length - 1 && path[index]!.s < s)
      index += 1
    const p0 = path[index - 1]!
    const p1 = path[index]!
    const t = p1.s === p0.s ? 0 : (s - p0.s) / (p1.s - p0.s)
    const lerp = (a: number, b: number) => a + (b - a) * t
    result.push({ x: lerp(p0.x, p1.x), y: lerp(p0.y, p1.y), nx: lerp(p0.nx, p1.nx), ny: lerp(p0.ny, p1.ny), kappa: lerp(p0.kappa, p1.kappa), s })
  }
  return result
}

function comb(path: Sample[]) {
  const samples = resample(path, TOOTH_STEP)
  const tips = samples.map(point => ({ x: point.x + point.nx * point.kappa * R * TOOTH, y: point.y + point.ny * point.kappa * R * TOOTH }))
  const teeth = samples
    .map((point, i) => ({ x1: point.x, y1: point.y, x2: tips[i]!.x, y2: tips[i]!.y, k: point.kappa }))
    .filter(tooth => tooth.k > 0)
  return { teeth, envelope: toPolyline(tips) }
}

const arcComb = computed(() => comb(arcPath.value))
const squircleComb = computed(() => comb(squirclePath.value))
const showArc = computed(() => view.value !== 'g2')
const showSquircle = computed(() => view.value !== 'g1')

// κ·R against arc length measured from the corner's midpoint, which both paths share.
const PLOT_W = 340
const PLOT_H = 190
const PLOT_PAD = { left: 34, right: 12, top: 14, bottom: 30 }
const PLOT_KMAX = 1.6
// Fixed, so the x scale stays put while n changes: n = 6 spans ±2.46R.
const PLOT_HALF_SPAN = 3.1 * R

function plotX(s: number) {
  const span = PLOT_HALF_SPAN
  return PLOT_PAD.left + ((s + span) / (2 * span)) * (PLOT_W - PLOT_PAD.left - PLOT_PAD.right)
}

function plotY(kR: number) {
  return PLOT_H - PLOT_PAD.bottom - (kR / PLOT_KMAX) * (PLOT_H - PLOT_PAD.top - PLOT_PAD.bottom)
}

function curvatureTrace(path: Sample[], a: number) {
  const leadLength = RIGHT - a - LEFT_END
  const total = path[path.length - 1]!.s
  const mid = leadLength + (total - leadLength - (BOTTOM_END - TOP - a)) / 2
  const span = PLOT_HALF_SPAN
  return toPolyline(
    path
      .filter(point => Math.abs(point.s - mid) <= span)
      .map(point => ({ x: plotX(point.s - mid), y: plotY(point.kappa * R) })),
  )
}

const arcTrace = computed(() => curvatureTrace(arcPath.value, R))
const squircleTrace = computed(() => curvatureTrace(squirclePath.value, extent.value))

const plotTicks = [-3, -2, -1, 0, 1, 2, 3]

function tickLabel(multiple: number) {
  if (multiple === 0)
    return '0'
  return `${multiple < 0 ? '−' : ''}${Math.abs(multiple) === 1 ? '' : Math.abs(multiple)}R`
}

// The jump at a joint is the corner's curvature there, the edge's being 0. For the arc
// it is 1/R; for the superellipse κ ∝ (uv)^(n−2) vanishes at the joint whenever n > 2.
const arcJump = 1
const squircleJump = computed(() => (exponent.value <= 2 ? R / extent.value : 0))
const squirclePeak = computed(() => {
  const n = exponent.value
  return ((n - 1) / extent.value) * 2 ** (-(n - 2) / (2 * n)) * R
})

function formatExponent(value: number) {
  return value.toFixed(1)
}

function formatRatio(value: number) {
  return value < 0.005 ? '0' : value.toFixed(2)
}

function resetDemo() {
  exponent.value = TUFFEX_EXPONENT
  view.value = 'both'
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="curv-root" :caption="copy.caption">
    <div class="curv">
      <svg class="curv__corner" viewBox="0 0 340 310" role="img" :aria-label="copy.label">
        <g v-if="showArc" class="curv__set is-arc">
          <line
            v-for="(tooth, i) in arcComb.teeth"
            :key="`a${i}`"
            class="curv__tooth"
            :x1="tooth.x1"
            :y1="tooth.y1"
            :x2="tooth.x2"
            :y2="tooth.y2"
          />
          <polyline class="curv__envelope" :points="arcComb.envelope" />
          <polyline class="curv__outline" :points="toPolyline(arcPath)" />
        </g>
        <g v-if="showSquircle" class="curv__set is-squircle">
          <line
            v-for="(tooth, i) in squircleComb.teeth"
            :key="`s${i}`"
            class="curv__tooth"
            :x1="tooth.x1"
            :y1="tooth.y1"
            :x2="tooth.x2"
            :y2="tooth.y2"
          />
          <polyline class="curv__envelope" :points="squircleComb.envelope" />
          <polyline class="curv__outline" :points="toPolyline(squirclePath)" />
        </g>
        <line class="curv__diagonal" :x1="RIGHT" :y1="TOP" :x2="RIGHT - 120" :y2="TOP + 120" />
      </svg>

      <svg class="curv__plot" :viewBox="`0 0 ${PLOT_W} ${PLOT_H}`" role="img" :aria-label="copy.plotLabel">
        <line class="curv__axis" :x1="PLOT_PAD.left" :y1="plotY(0)" :x2="PLOT_W - PLOT_PAD.right" :y2="plotY(0)" />
        <line class="curv__axis" :x1="PLOT_PAD.left" :y1="PLOT_PAD.top" :x2="PLOT_PAD.left" :y2="plotY(0)" />
        <line class="curv__gridline" :x1="PLOT_PAD.left" :y1="plotY(1)" :x2="PLOT_W - PLOT_PAD.right" :y2="plotY(1)" />
        <text class="curv__tick" :x="PLOT_PAD.left - 6" :y="plotY(1) + 3" text-anchor="end">1/R</text>
        <text class="curv__tick" :x="PLOT_PAD.left - 6" :y="plotY(0) + 3" text-anchor="end">0</text>
        <text
          v-for="tick in plotTicks"
          :key="tick"
          class="curv__tick"
          :x="plotX(tick * R)"
          :y="plotY(0) + 14"
          text-anchor="middle"
        >
          {{ tickLabel(tick) }}
        </text>
        <text class="curv__tick is-axis" :x="(PLOT_W + PLOT_PAD.left) / 2" :y="PLOT_H - 3" text-anchor="middle">{{ copy.plotAxis }}</text>
        <polyline v-if="showArc" class="curv__trace is-arc" :points="arcTrace" />
        <polyline v-if="showSquircle" class="curv__trace is-squircle" :points="squircleTrace" />
      </svg>
    </div>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.exponent }}</span>
        <TxSlider v-model="exponent" :min="2" :max="6" :step="0.1" show-value :format-value="formatExponent" :aria-label="copy.exponent" />
      </label>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.view }}</span>
        <TxRadioGroup v-model="view">
          <TxRadio value="both">
            {{ copy.both }}
          </TxRadio>
          <TxRadio value="g1">
            {{ copy.g1 }}
          </TxRadio>
          <TxRadio value="g2">
            {{ copy.g2 }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--curv-arc)"><span class="cfig-legend__swatch" />{{ copy.arc }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--curv-squircle)"><span class="cfig-legend__swatch" />{{ copy.squircle }} n = {{ exponent.toFixed(1) }}</span>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat is-fail">
        <span class="cfig-stat__label">{{ copy.jumpArc }}</span>
        <span class="cfig-stat__value">0 → {{ formatRatio(arcJump) }} / R</span>
      </span>
      <span class="cfig-stat" :class="squircleJump < 0.005 ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.jumpSquircle }}</span>
        <span class="cfig-stat__value">0 → {{ formatRatio(squircleJump) }} / R</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.peak }}</span>
        <span class="cfig-stat__value">{{ squirclePeak.toFixed(2) }} / R</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.reach }}</span>
        <span class="cfig-stat__value">{{ (extent / R).toFixed(2) }} R</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.curv-root {
  --curv-arc: var(--tx-color-warning, #e6a23c);
  --curv-squircle: var(--tx-color-primary, #409eff);
}

.curv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 8px;
  padding: 10px;
}

.curv__corner,
.curv__plot {
  display: block;
  width: 100%;
  height: auto;
}

.curv__set.is-arc {
  --curv-color: var(--curv-arc);
}

.curv__set.is-squircle {
  --curv-color: var(--curv-squircle);
}

.curv__tooth {
  stroke: var(--curv-color);
  stroke-width: 0.8;
  opacity: 0.38;
}

.curv__envelope {
  fill: none;
  stroke: var(--curv-color);
  stroke-width: 1.2;
  stroke-dasharray: 3 2;
  opacity: 0.85;
}

.curv__outline {
  fill: none;
  stroke: var(--curv-color);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.curv__diagonal {
  stroke: var(--cfig-muted);
  stroke-width: 0.8;
  stroke-dasharray: 2 3;
  opacity: 0.6;
}

.curv__axis {
  stroke: var(--cfig-line-strong);
  stroke-width: 1;
}

.curv__gridline {
  stroke: var(--cfig-line-strong);
  stroke-width: 0.8;
  stroke-dasharray: 3 3;
}

.curv__tick {
  fill: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 9px;
}

.curv__tick.is-axis {
  font-family: inherit;
  font-size: 10px;
}

.curv__trace {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
}

.curv__trace.is-arc {
  stroke: var(--curv-arc);
}

.curv__trace.is-squircle {
  stroke: var(--curv-squircle);
}
</style>
