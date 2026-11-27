<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two rounded rectangles, one inset P inside the other. The outer radius R either repeats
 * the inner radius r (R = r) or follows the concentric law (R = r + P).
 *
 * Both gaps are measured off the drawn shapes. The straight gap is the distance between the
 * two top edges. The corner gap runs along the 45° diagonal, on which both arc centres lie,
 * from the outer arc to the inner one: (P + r)√2 − r − R(√2 − 1). That is P√2 when R = r and
 * exactly P when R = r + P.
 */

type Nesting = 'same' | 'concentric'

interface Point {
  x: number
  y: number
}

const { locale } = useI18n()

const padding = ref(8)
const innerRadius = ref(12)
const nesting = ref<Nesting>('same')

// Figure units. The outer box's top-left corner, drawn ZOOM times larger, sits at
// (ORIGIN, ORIGIN); both boxes run on past the right and bottom edges of the view.
const ZOOM = 5
const ORIGIN = 30
const VIEW = 320
const RUN_OFF = VIEW + 20
// Far enough right that both top edges are straight there at every slider setting.
const EDGE_GAUGE_X = 290
const TICK = 5

const copy = computed(() => locale.value === 'zh'
  ? {
      label: '同值嵌套与同心嵌套的拐角间距：左上角放大图',
      actual: '实际大小',
      nesting: '嵌套方式',
      same: '同值 R = r',
      concentric: '同心 R = r + P',
      padding: '内边距 P',
      innerRadius: '内层半径 r',
      outerRadius: '外层半径 R',
      straight: '直边间距',
      corner: '对角间距',
      ratio: '对角 ÷ 直边',
      caption: `放大 ${ZOOM} 倍的左上角。同值嵌套时，两段圆弧的圆心（小圆点）沿对角线错开 P√2，拐角处的间距也就成了 P√2，是直边的 ${Math.SQRT2.toFixed(2)} 倍；同心嵌套时两个圆心重合，一整圈都等于 P。对角间距沿 45° 对角线、在两段圆弧之间量取。`,
    }
  : {
      label: 'Corner gap of same-radius and concentric nesting, top-left corner magnified',
      actual: 'Actual size',
      nesting: 'Nesting',
      same: 'Same R = r',
      concentric: 'Concentric R = r + P',
      padding: 'Padding P',
      innerRadius: 'Inner radius r',
      outerRadius: 'Outer radius R',
      straight: 'Straight gap',
      corner: 'Corner gap',
      ratio: 'Corner ÷ straight',
      caption: `The top-left corner at ${ZOOM}×. With the same radius, the two arcs' centres (the dots) sit P√2 apart on the diagonal, so the corner gap becomes P√2, ${Math.SQRT2.toFixed(2)} times the straight edge. With concentric radii the centres coincide and the gap is P all the way round. The corner gap is measured along the 45° diagonal, between the two arcs.`,
    })

const outerRadius = computed(() => nesting.value === 'same' ? innerRadius.value : innerRadius.value + padding.value)

/** A box's top-left corner: up its left edge, round the arc, along its top edge; closed into a fill if asked. */
function cornerPath(inset: number, radius: number, closed: boolean) {
  const start = ORIGIN + inset * ZOOM
  const r = radius * ZOOM
  const outline = `M ${start} ${RUN_OFF} L ${start} ${start + r} A ${r} ${r} 0 0 1 ${start + r} ${start} L ${RUN_OFF} ${start}`
  return closed ? `${outline} L ${RUN_OFF} ${RUN_OFF} Z` : outline
}

/** The top edge, the arc centre, and where the arc crosses the 45° diagonal. */
function corner(inset: number, radius: number) {
  const start = ORIGIN + inset * ZOOM
  const r = radius * ZOOM
  const centre: Point = { x: start + r, y: start + r }
  const diagonal: Point = { x: centre.x - r * Math.SQRT1_2, y: centre.y - r * Math.SQRT1_2 }
  return { top: start, centre, diagonal }
}

const outer = computed(() => corner(0, outerRadius.value))
const inner = computed(() => corner(padding.value, innerRadius.value))

const straightGap = computed(() => (inner.value.top - outer.value.top) / ZOOM)
const cornerGap = computed(() => Math.hypot(
  inner.value.diagonal.x - outer.value.diagonal.x,
  inner.value.diagonal.y - outer.value.diagonal.y,
) / ZOOM)
const ratio = computed(() => straightGap.value > 0 ? cornerGap.value / straightGap.value : null)
const even = computed(() => Math.abs(cornerGap.value - straightGap.value) < 0.005)

const guideEnd = computed(() => Math.max(outer.value.centre.x, inner.value.centre.x) + 16)

/** A short end mark across the diagonal gauge at a point. */
function diagonalTick(point: Point) {
  const d = TICK * Math.SQRT1_2
  return { x1: point.x - d, y1: point.y + d, x2: point.x + d, y2: point.y - d }
}

function formatPx(value: number) {
  return `${value}px`
}

function resetDemo() {
  padding.value = 8
  innerRadius.value = 12
  nesting.value = 'same'
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption">
    <div class="ccr" :class="even ? 'is-even' : 'is-uneven'">
      <svg class="ccr__corner" :viewBox="`0 0 ${VIEW} ${VIEW}`" role="img" :aria-label="copy.label">
        <path class="ccr__outer" :d="cornerPath(0, outerRadius, true)" />
        <path class="ccr__inner" :d="cornerPath(padding, innerRadius, true)" />
        <path class="ccr__outer-line" :d="cornerPath(0, outerRadius, false)" />
        <path class="ccr__inner-line" :d="cornerPath(padding, innerRadius, false)" />
        <line class="ccr__diagonal" :x1="ORIGIN - 12" :y1="ORIGIN - 12" :x2="guideEnd" :y2="guideEnd" />
        <g v-if="padding > 0" class="ccr__gauge is-straight">
          <line :x1="EDGE_GAUGE_X" :y1="outer.top" :x2="EDGE_GAUGE_X" :y2="inner.top" />
          <line :x1="EDGE_GAUGE_X - TICK" :y1="outer.top" :x2="EDGE_GAUGE_X + TICK" :y2="outer.top" />
          <line :x1="EDGE_GAUGE_X - TICK" :y1="inner.top" :x2="EDGE_GAUGE_X + TICK" :y2="inner.top" />
        </g>
        <g v-if="padding > 0" class="ccr__gauge is-corner">
          <line :x1="outer.diagonal.x" :y1="outer.diagonal.y" :x2="inner.diagonal.x" :y2="inner.diagonal.y" />
          <line v-bind="diagonalTick(outer.diagonal)" />
          <line v-bind="diagonalTick(inner.diagonal)" />
        </g>
        <circle class="ccr__centre is-outer" :cx="outer.centre.x" :cy="outer.centre.y" r="4.5" />
        <circle class="ccr__centre is-inner" :cx="inner.centre.x" :cy="inner.centre.y" r="2" />
      </svg>

      <div class="cfig-panel ccr__actual">
        <span class="cfig-panel__title">{{ copy.actual }}</span>
        <div class="ccr__real" :style="{ borderRadius: `${outerRadius}px`, padding: `${padding}px` }">
          <div class="ccr__real-inner" :style="{ borderRadius: `${innerRadius}px` }" />
        </div>
      </div>
    </div>

    <template #controls>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.nesting }}</span>
        <TxRadioGroup v-model="nesting">
          <TxRadio value="same">
            {{ copy.same }}
          </TxRadio>
          <TxRadio value="concentric">
            {{ copy.concentric }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.padding }}</span>
        <TxSlider v-model="padding" :min="0" :max="24" :step="1" show-value :format-value="formatPx" :aria-label="copy.padding" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.innerRadius }}</span>
        <TxSlider v-model="innerRadius" :min="4" :max="20" :step="1" show-value :format-value="formatPx" :aria-label="copy.innerRadius" />
      </label>
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--cfig-accent)"><span class="cfig-legend__swatch" />{{ copy.straight }}</span>
        <span class="cfig-legend__item" :style="{ '--swatch': even ? 'var(--cfig-pass)' : 'var(--cfig-fail)' }"><span class="cfig-legend__swatch" />{{ copy.corner }}</span>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.outerRadius }}</span>
        <span class="cfig-stat__value">{{ outerRadius }}px</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.straight }}</span>
        <span class="cfig-stat__value">{{ straightGap.toFixed(2) }}px</span>
      </span>
      <span class="cfig-stat" :class="even ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.corner }}</span>
        <span class="cfig-stat__value">{{ cornerGap.toFixed(2) }}px</span>
      </span>
      <span class="cfig-stat" :class="even ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.ratio }}</span>
        <span class="cfig-stat__value">{{ ratio === null ? '—' : `× ${ratio.toFixed(2)}` }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.ccr {
  --ccr-outer: color-mix(in srgb, var(--cfig-ink) 7%, var(--tx-bg-color, #fff));
  --ccr-inner: color-mix(in srgb, var(--cfig-accent) 16%, var(--tx-bg-color, #fff));
  --ccr-inner-line: color-mix(in srgb, var(--cfig-accent) 65%, var(--cfig-ink));
  --ccr-corner: var(--cfig-fail);

  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.ccr.is-even {
  --ccr-corner: var(--cfig-pass);
}

.ccr__corner {
  display: block;
  width: 100%;
  max-width: 360px;
  height: auto;
  margin: 0 auto;
}

.ccr__outer {
  fill: var(--ccr-outer);
}

.ccr__inner {
  fill: var(--ccr-inner);
}

.ccr__outer-line,
.ccr__inner-line {
  fill: none;
  stroke-width: 2;
}

.ccr__outer-line {
  stroke: var(--cfig-line-strong);
}

.ccr__inner-line {
  stroke: var(--ccr-inner-line);
}

.ccr__diagonal {
  stroke: var(--cfig-muted);
  stroke-width: 1;
  stroke-dasharray: 3 4;
  opacity: 0.7;
}

.ccr__gauge line {
  stroke-width: 2.5;
  stroke-linecap: round;
}

.ccr__gauge.is-straight line {
  stroke: var(--cfig-accent);
}

.ccr__gauge.is-corner line {
  stroke: var(--ccr-corner);
}

.ccr__centre.is-outer {
  fill: var(--tx-bg-color, #fff);
  stroke: var(--cfig-ink);
  stroke-width: 1.5;
}

.ccr__centre.is-inner {
  fill: var(--ccr-inner-line);
}

.ccr__actual {
  align-items: stretch;
}

.ccr__real {
  box-sizing: border-box;
  width: 100%;
  max-width: 240px;
  height: 132px;
  margin: 0 auto;
  background: var(--ccr-outer);
  box-shadow: inset 0 0 0 1px var(--cfig-line-strong);
}

.ccr__real-inner {
  height: 100%;
  background: var(--ccr-inner);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cfig-accent) 45%, transparent);
}
</style>
