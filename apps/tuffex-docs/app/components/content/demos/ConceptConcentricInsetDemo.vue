<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * The two inset rules of the concentricity article.
 *
 * ① The left end of a single-line field, drawn ZOOM times larger. The caret is a line at
 * x = padding, centred vertically. For x < R the top-left arc sits at y = R − √(R² − (R − x)²)
 * and the bottom-left arc mirrors it, so the caret is outside the field above that height and
 * below its mirror; those parts are drawn red.
 *
 * ② A chip whose vertical padding is a ratio of its fixed horizontal padding, set against the
 * article's 0.6–0.75 band.
 */

const { locale } = useI18n()

// TxInput (packages/tuffex/packages/components/src/input/src/TxInput.vue): 32px tall, 14px
// text, a 12px radius and 12px of horizontal padding.
const INPUT_HEIGHT = 32
const FONT_SIZE = 14
const TX_INPUT_RADIUS = 12
const TX_INPUT_PADDING = 12
// The caret is as tall as a line of text: the font size × a normal line height.
const NORMAL_LINE_HEIGHT = 1.2
const CARET_HEIGHT = FONT_SIZE * NORMAL_LINE_HEIGHT
const CARET_TOP = (INPUT_HEIGHT - CARET_HEIGHT) / 2
const CARET_BOTTOM = CARET_TOP + CARET_HEIGHT
const PILL_RADIUS = INPUT_HEIGHT / 2

// ① Figure units: the field's top-left corner, drawn ZOOM times larger, sits at (LEFT, TOP);
// the field runs on past the right edge of the view.
const ZOOM = 4
const LEFT = 18
const TOP = 28
const FIELD_BOTTOM = TOP + INPUT_HEIGHT * ZOOM
const VIEW_W = 400
const VIEW_H = FIELD_BOTTOM + 14
const RUN_OFF = VIEW_W + 20
// Baseline of the sample text, roughly where a centred 14px line puts it.
const BASELINE = TOP + (INPUT_HEIGHT / 2 + FONT_SIZE * 0.35) * ZOOM

// ② The article's chip, TxModeChip (packages/tuffex/packages/components/src/mode-chip/src/TxModeChip.vue):
// an 18px line of 13px text and 8px of horizontal padding. Its fixed 28px height leaves 5px above
// and below, the article's example.
const CHIP_FONT_SIZE = 13
const CHIP_LINE_HEIGHT = 18
const CHIP_INLINE = 8
const CHIP_ZOOM = 2
const BAND = [0.6, 0.75] as const
const EXAMPLE = { block: 5, inline: 8 }
const EXAMPLE_RATIO = EXAMPLE.block / EXAMPLE.inline
// The band's label and the example's sit on two rows above the axis: the example now falls
// inside the band, so one row would overlap them.
const SCALE = { min: 0.4, max: 1, step: 0.1, left: 16, right: 284, axis: 33 }
const SCALE_TICKS = Array.from(
  { length: Math.round((SCALE.max - SCALE.min) / SCALE.step) + 1 },
  (_, i) => SCALE.min + i * SCALE.step,
)

const radius = ref(PILL_RADIUS)
const inset = ref(2)
const ratio = ref(0.65)

/** Height of the top-left arc at x, 0 once x has cleared it: y = R − √(R² − (R − x)²). */
function arcHeightAt(x: number, r: number) {
  return x >= r ? 0 : r - Math.sqrt(r * r - (r - x) ** 2)
}

/**
 * The least padding that keeps the whole caret inside: the arc's x at the caret's top end.
 * The arc is symmetric about the diagonal, so that x is its height at x = CARET_TOP.
 */
function clearingInset(r: number) {
  return arcHeightAt(CARET_TOP, r)
}

const copy = computed(() => {
  const pill = clearingInset(PILL_RADIUS).toFixed(2)
  const txInput = clearingInset(TX_INPUT_RADIUS).toFixed(2)
  return locale.value === 'zh'
    ? {
        caretTitle: '① 光标裁切',
        chipTitle: '② 垂直光学内边距',
        caretLabel: '输入框左端放大图：光标与圆角弧线',
        scaleLabel: '垂直与水平内边距之比的刻度',
        sample: '搜索',
        chips: ['设计', '已发布', 'Beta'],
        outside: '圆弧外的光标',
        inside: '圆弧内的光标',
        corner: '圆角让出的区域',
        caretNote: `放大 ${ZOOM} 倍的输入框左端。高 ${INPUT_HEIGHT}px，光标高 ${CARET_HEIGHT.toFixed(1)}px（${FONT_SIZE}px 字号 × ${NORMAL_LINE_HEIGHT}）、垂直居中；光标落在圆弧外的部分标红，由圆弧方程算出；圆点是圆弧上与光标两端同高的位置，也就是不被裁所需的最小内边距。`,
        chipNote: `行高 ${CHIP_LINE_HEIGHT}px，水平内边距固定 ${CHIP_INLINE}px；上排是实际大小，下面放大 ${CHIP_ZOOM} 倍，虚线框是文字行。刻度上的浅色带是文中的 ${BAND[0]}–${BAND[1]}，菱形是文中的例子 TxModeChip：上下各 ${EXAMPLE.block}px、左右 ${EXAMPLE.inline}px（${EXAMPLE_RATIO.toFixed(3)}）。`,
        radius: '① 圆角 R',
        inset: '① 水平内边距',
        ratio: '② 垂直 ÷ 水平',
        clipped: '① 被裁掉的光标',
        clearing: '① 不被裁的最小内边距',
        rule: '① 文中规则：内边距 ≥ R',
        block: '② 垂直内边距',
        height: '② Chip 高度',
        caption: `光标只有在圆角大、内边距又极小时才会被裁：${INPUT_HEIGHT}px 高的胶囊（R = ${PILL_RADIUS}px）内边距要小于 ${pill}px 才裁得到；TxInput 的圆角是 ${TX_INPUT_RADIUS}px，要小于 ${txInput}px，而它实际用了 ${TX_INPUT_PADDING}px。圆角不超过 ${CARET_TOP.toFixed(1)}px 时，光标贴得再近也不会被裁。`,
      }
    : {
        caretTitle: '① Caret clipping',
        chipTitle: '② Optical vertical padding',
        caretLabel: 'Left end of a field magnified: the caret against the corner arc',
        scaleLabel: 'Scale of the vertical to horizontal padding ratio',
        sample: 'Search',
        chips: ['Design', 'Published', 'Beta'],
        outside: 'Caret outside the arc',
        inside: 'Caret inside the arc',
        corner: 'Area the corner gives up',
        caretNote: `The left end of a field at ${ZOOM}×: ${INPUT_HEIGHT}px tall, the caret ${CARET_HEIGHT.toFixed(1)}px (${FONT_SIZE}px text × ${NORMAL_LINE_HEIGHT}) and centred. The part of the caret outside the arc is red, computed from the arc's equation; the dots mark where the arc is level with the caret's ends, which is the least padding that clears it.`,
        chipNote: `Line height ${CHIP_LINE_HEIGHT}px, horizontal padding fixed at ${CHIP_INLINE}px. The top row is actual size, the chip below ${CHIP_ZOOM}×, its dashed box the line of text. On the scale, the band is the article's ${BAND[0]}–${BAND[1]} and the diamond its example, TxModeChip: ${EXAMPLE.block}px above and below, ${EXAMPLE.inline}px sideways (${EXAMPLE_RATIO.toFixed(3)}).`,
        radius: '① Radius R',
        inset: '① Horizontal padding',
        ratio: '② Vertical ÷ horizontal',
        clipped: '① Caret clipped',
        clearing: '① Least padding that clears it',
        rule: '① Article rule: padding ≥ R',
        block: '② Vertical padding',
        height: '② Chip height',
        caption: `The caret is clipped only by a large radius with almost no padding: a ${INPUT_HEIGHT}px pill (R = ${PILL_RADIUS}px) clips it below ${pill}px of padding, and TxInput's ${TX_INPUT_RADIUS}px radius only below ${txInput}px, while it actually uses ${TX_INPUT_PADDING}px. At a radius of ${CARET_TOP.toFixed(1)}px or less the caret is never clipped, however close it sits.`,
      }
})

// ① The field and the caret.
const bodyPath = computed(() => {
  const r = radius.value * ZOOM
  return `M ${RUN_OFF} ${TOP} L ${LEFT + r} ${TOP} A ${r} ${r} 0 0 0 ${LEFT} ${TOP + r} L ${LEFT} ${FIELD_BOTTOM - r} A ${r} ${r} 0 0 0 ${LEFT + r} ${FIELD_BOTTOM} L ${RUN_OFF} ${FIELD_BOTTOM} Z`
})

/** The two slivers between the square corner and the arc: the room the radius takes away. */
const cornerPaths = computed(() => {
  const r = radius.value * ZOOM
  return [
    `M ${LEFT} ${TOP} L ${LEFT + r} ${TOP} A ${r} ${r} 0 0 0 ${LEFT} ${TOP + r} Z`,
    `M ${LEFT} ${FIELD_BOTTOM} L ${LEFT} ${FIELD_BOTTOM - r} A ${r} ${r} 0 0 0 ${LEFT + r} ${FIELD_BOTTOM} Z`,
  ]
})

const caret = computed(() => {
  const edge = arcHeightAt(inset.value, radius.value)
  const topCut = Math.max(0, Math.min(CARET_BOTTOM, edge) - CARET_TOP)
  const bottomCut = Math.max(0, CARET_BOTTOM - Math.max(CARET_TOP, INPUT_HEIGHT - edge))
  return { topCut, bottomCut, clipped: topCut + bottomCut }
})

const caretSegments = computed(() => {
  const { topCut, bottomCut } = caret.value
  return [
    { from: CARET_TOP, to: CARET_TOP + topCut, outside: true },
    { from: CARET_TOP + topCut, to: CARET_BOTTOM - bottomCut, outside: false },
    { from: CARET_BOTTOM - bottomCut, to: CARET_BOTTOM, outside: true },
  ].filter(segment => segment.to - segment.from > 0.001)
})

const caretX = computed(() => LEFT + inset.value * ZOOM)
const ruleX = computed(() => LEFT + radius.value * ZOOM)
const clearing = computed(() => clearingInset(radius.value))
const clears = computed(() => caret.value.clipped < 0.005)
const meetsRule = computed(() => inset.value >= radius.value)

function toY(value: number) {
  return TOP + value * ZOOM
}

// ② The chip.
const chipBlock = computed(() => ratio.value * CHIP_INLINE)
const chipHeight = computed(() => CHIP_LINE_HEIGHT + 2 * chipBlock.value)
const inBand = computed(() => ratio.value >= BAND[0] - 1e-9 && ratio.value <= BAND[1] + 1e-9)

function chipStyle(scale: number) {
  return {
    padding: `${chipBlock.value * scale}px ${CHIP_INLINE * scale}px`,
    fontSize: `${CHIP_FONT_SIZE * scale}px`,
    lineHeight: `${CHIP_LINE_HEIGHT * scale}px`,
  }
}

function scaleX(value: number) {
  return SCALE.left + (value - SCALE.min) / (SCALE.max - SCALE.min) * (SCALE.right - SCALE.left)
}

function diamond(x: number, y: number, size = 5) {
  return `M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`
}

function formatPx(value: number) {
  return `${value}px`
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function resetDemo() {
  radius.value = PILL_RADIUS
  inset.value = 2
  ratio.value = 0.65
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption">
    <div class="cci cfig-split">
      <div class="cfig-panel">
        <span class="cfig-panel__title">{{ copy.caretTitle }}</span>
        <svg class="cci__field" :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" role="img" :aria-label="copy.caretLabel">
          <path class="cci__body" :d="bodyPath" />
          <path v-for="(d, i) in cornerPaths" :key="i" class="cci__corner" :d="d" />
          <line class="cci__rule" :x1="ruleX" :y1="TOP - 10" :x2="ruleX" :y2="FIELD_BOTTOM + 8" />
          <text class="cci__rule-label" :x="ruleX + 4" :y="TOP - 14">x = R</text>
          <text class="cci__text" :x="caretX + 1.5 * ZOOM" :y="BASELINE" :font-size="FONT_SIZE * ZOOM">{{ copy.sample }}</text>
          <line
            v-for="(segment, i) in caretSegments"
            :key="i"
            class="cci__caret"
            :class="{ 'is-outside': segment.outside }"
            :x1="caretX"
            :y1="toY(segment.from)"
            :x2="caretX"
            :y2="toY(segment.to)"
          />
          <template v-if="radius > CARET_TOP">
            <circle class="cci__meet" :cx="LEFT + clearing * ZOOM" :cy="toY(CARET_TOP)" r="3.5" />
            <circle class="cci__meet" :cx="LEFT + clearing * ZOOM" :cy="toY(CARET_BOTTOM)" r="3.5" />
          </template>
        </svg>
        <div class="cfig-legend">
          <span class="cfig-legend__item" style="--swatch: var(--cfig-fail)"><span class="cfig-legend__swatch" />{{ copy.outside }}</span>
          <span class="cfig-legend__item" style="--swatch: var(--cfig-ink)"><span class="cfig-legend__swatch" />{{ copy.inside }}</span>
          <span class="cfig-legend__item" style="--swatch: color-mix(in srgb, var(--cfig-fail) 35%, transparent)"><span class="cfig-legend__swatch" />{{ copy.corner }}</span>
        </div>
        <span class="cfig-panel__note">{{ copy.caretNote }}</span>
      </div>

      <div class="cfig-panel">
        <span class="cfig-panel__title">{{ copy.chipTitle }}</span>
        <div class="cci__chips">
          <span v-for="label in copy.chips" :key="label" class="cci__chip" :style="chipStyle(1)">{{ label }}</span>
        </div>
        <div class="cci__zoomed">
          <span class="cci__chip" :style="chipStyle(CHIP_ZOOM)"><span class="cci__chip-line">{{ copy.chips[0] }}</span></span>
        </div>
        <svg class="cci__scale" viewBox="0 0 300 58" role="img" :aria-label="copy.scaleLabel">
          <rect class="cci__band" :x="scaleX(BAND[0])" :y="SCALE.axis - 6" :width="scaleX(BAND[1]) - scaleX(BAND[0])" height="12" rx="3" />
          <text class="cci__scale-note" :x="(scaleX(BAND[0]) + scaleX(BAND[1])) / 2" y="9" text-anchor="middle">{{ BAND[0] }}–{{ BAND[1] }}</text>
          <line class="cci__axis" :x1="SCALE.left" :y1="SCALE.axis" :x2="SCALE.right" :y2="SCALE.axis" />
          <g v-for="tick in SCALE_TICKS" :key="tick">
            <line class="cci__axis" :x1="scaleX(tick)" :y1="SCALE.axis - 3" :x2="scaleX(tick)" :y2="SCALE.axis + 3" />
            <text class="cci__tick-label" :x="scaleX(tick)" y="53" text-anchor="middle">{{ tick.toFixed(1) }}</text>
          </g>
          <path class="cci__example" :d="diamond(scaleX(EXAMPLE_RATIO), SCALE.axis)" />
          <text class="cci__scale-note" :x="scaleX(EXAMPLE_RATIO)" y="20" text-anchor="middle">{{ EXAMPLE.block }}px {{ EXAMPLE.inline }}px</text>
          <line class="cci__marker" :class="inBand ? 'is-pass' : 'is-fail'" :x1="scaleX(ratio)" :y1="SCALE.axis - 9" :x2="scaleX(ratio)" :y2="SCALE.axis + 9" />
        </svg>
        <span class="cfig-panel__note">{{ copy.chipNote }}</span>
      </div>
    </div>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.radius }}</span>
        <TxSlider v-model="radius" :min="0" :max="PILL_RADIUS" :step="1" show-value :format-value="formatPx" :aria-label="copy.radius" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.inset }}</span>
        <TxSlider v-model="inset" :min="0" :max="20" :step="1" show-value :format-value="formatPx" :aria-label="copy.inset" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.ratio }}</span>
        <TxSlider v-model="ratio" :min="0.4" :max="1" :step="0.01" show-value :format-value="formatRatio" :aria-label="copy.ratio" />
      </label>
    </template>

    <template #readout>
      <span class="cfig-stat" :class="clears ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.clipped }}</span>
        <span class="cfig-stat__value">{{ caret.clipped.toFixed(2) }}px</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.clearing }}</span>
        <span class="cfig-stat__value">{{ clearing.toFixed(2) }}px</span>
      </span>
      <span class="cfig-stat" :class="meetsRule ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.rule }}</span>
        <span class="cfig-stat__value">{{ radius }}px</span>
      </span>
      <span class="cfig-stat" :class="inBand ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.ratio }}</span>
        <span class="cfig-stat__value">{{ ratio.toFixed(2) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.block }}</span>
        <span class="cfig-stat__value">{{ chipBlock.toFixed(2) }}px</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.height }}</span>
        <span class="cfig-stat__value">{{ chipHeight.toFixed(2) }}px</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.cci {
  padding: 12px;
}

.cci__field,
.cci__scale {
  display: block;
  width: 100%;
  height: auto;
}

.cci__body {
  fill: var(--tx-bg-color, #fff);
  stroke: var(--cfig-line-strong);
  stroke-width: 2;
}

.cci__corner {
  fill: color-mix(in srgb, var(--cfig-fail) 14%, transparent);
}

.cci__rule {
  stroke: var(--cfig-muted);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.cci__rule-label,
.cci__scale-note,
.cci__tick-label {
  fill: var(--cfig-muted);
  font-family: var(--cfig-mono);
}

.cci__rule-label {
  font-size: 11px;
}

.cci__text {
  fill: color-mix(in srgb, var(--cfig-ink) 72%, transparent);
}

.cci__caret {
  stroke: var(--cfig-ink);
  stroke-width: 4;
}

.cci__caret.is-outside {
  stroke: var(--cfig-fail);
  stroke-width: 5;
}

.cci__meet {
  fill: var(--tx-bg-color, #fff);
  stroke: var(--cfig-fail);
  stroke-width: 1.5;
}

.cci__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cci__zoomed {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.cci__chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cfig-accent) 14%, var(--tx-bg-color, #fff));
  color: var(--cfig-ink);
  white-space: nowrap;
}

.cci__chip-line {
  display: block;
  outline: 1px dashed color-mix(in srgb, var(--cfig-ink) 40%, transparent);
}

.cci__band {
  fill: color-mix(in srgb, var(--cfig-pass) 22%, transparent);
}

.cci__scale-note {
  font-size: 9.5px;
}

.cci__tick-label {
  font-size: 9px;
}

.cci__axis {
  stroke: var(--cfig-line-strong);
  stroke-width: 1;
}

.cci__example {
  fill: var(--tx-bg-color, #fff);
  stroke: var(--cfig-muted);
  stroke-width: 1.2;
}

.cci__marker {
  stroke-width: 2.5;
  stroke-linecap: round;
}

.cci__marker.is-pass {
  stroke: var(--cfig-pass);
}

.cci__marker.is-fail {
  stroke: var(--cfig-fail);
}
</style>
