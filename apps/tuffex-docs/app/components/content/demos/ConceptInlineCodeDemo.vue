<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Inline code against the text around it. The x-heights are measured, not assumed: a
 * canvas sets an `x` in the computed font of the sample paragraph and of its inline code,
 * and `actualBoundingBoxAscent` gives each glyph's height above the baseline. The
 * specimen draws both x-heights as guide lines, the code one scaled by the slider, so the
 * band between them is the residual the chosen size leaves.
 */

interface Part {
  text: string
  code?: boolean
}

interface FaceMetrics {
  family: string
  weight: string
  /** x-height as a fraction of the font size. */
  xHeight: number
  /** Advance of the specimen word as a fraction of the font size. */
  width: number
}

const SPECIMEN = 'max'
/** Font size the canvas measures at; ratios do not depend on it. */
const PROBE_SIZE = 200
// Specimen layout in viewBox units: the sans word is set at FONT_SIZE.
const FONT_SIZE = 100
const BASELINE = 84
const PAD = 24
const GAP = 40
const DEFAULT_EM = 0.9

const { locale } = useI18n()

const em = ref(DEFAULT_EM)
const sans = ref<FaceMetrics | null>(null)
const mono = ref<FaceMetrics | null>(null)
const proseRef = ref<HTMLElement | null>(null)

const copy = computed(() => locale.value === 'zh'
  ? {
      prose: [
        { text: '调用 ' },
        { text: 'segmentWords()', code: true },
        { text: ' 之前先确认 ' },
        { text: 'Intl.Segmenter', code: true },
        { text: ' 可用；不可用时会退回 ' },
        { text: 'FALLBACK', code: true },
        { text: ' 正则，按空白与单个汉字切分。' },
      ] as Part[],
      size: '行内代码字号',
      align: '对齐到实测值',
      specimen: '无衬线与等宽字体的 x 高度对比',
      sansLine: '正文 x 高度',
      monoLine: '代码 x 高度（已缩放）',
      sansX: '正文 x 高度（无衬线）',
      monoX: '代码 x 高度（等宽）',
      ratio: '等宽 ÷ 无衬线',
      residual: (value: string) => `${value} 时的残差`,
      exact: '恰好对齐的字号',
      unmeasured: '这台设备上的 canvas 没能按页面字体测量，数值暂缺。',
      caption: 'x 高度由 canvas 的 measureText(\'x\') 在当前浏览器中测得：正文取示例段落的计算字体，代码取段落里行内代码的计算字体。实线是正文的 x 高度，虚线是按滑杆缩放后的代码 x 高度，两线之间的色带就是残差；拖到「恰好对齐的字号」时色带消失。',
    }
  : {
      prose: [
        { text: 'Call ' },
        { text: 'segmentWords()', code: true },
        { text: ' only after checking that ' },
        { text: 'Intl.Segmenter', code: true },
        { text: ' exists; otherwise the ' },
        { text: 'FALLBACK', code: true },
        { text: ' pattern splits text on whitespace and single characters.' },
      ] as Part[],
      size: 'Inline code size',
      align: 'Align to measurement',
      specimen: 'x-heights of the sans-serif and the monospace face',
      sansLine: 'Body x-height',
      monoLine: 'Code x-height (scaled)',
      sansX: 'Body x-height (sans-serif)',
      monoX: 'Code x-height (monospace)',
      ratio: 'Monospace ÷ sans-serif',
      residual: (value: string) => `Residual at ${value}`,
      exact: 'Size that aligns exactly',
      unmeasured: 'The canvas on this device could not measure the page fonts, so the values are missing.',
      caption: 'The x-heights are measured in this browser with canvas measureText(\'x\'): the body in the computed font of the sample paragraph, the code in the computed font of its inline code. The solid line is the body x-height, the dashed line the code x-height scaled by the slider, and the band between them is the residual; at the size that aligns exactly, the band disappears.',
    })

let canvas: HTMLCanvasElement | null = null

function measureFace(el: Element): FaceMetrics | null {
  const style = getComputedStyle(el)
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null
  ctx.font = `${style.fontWeight} ${PROBE_SIZE}px ${style.fontFamily}`
  // An unparsable font leaves the previous one in place; do not report its metrics.
  if (!ctx.font.includes(`${PROBE_SIZE}px`))
    return null
  const x = ctx.measureText('x')
  const word = ctx.measureText(SPECIMEN)
  if (!(x.actualBoundingBoxAscent > 0))
    return null
  return {
    family: style.fontFamily,
    weight: style.fontWeight,
    xHeight: x.actualBoundingBoxAscent / PROBE_SIZE,
    width: word.width / PROBE_SIZE,
  }
}

function measure() {
  const prose = proseRef.value
  const code = prose?.querySelector('.icd__code')
  if (!prose || !code)
    return
  sans.value = measureFace(prose)
  mono.value = measureFace(code)
}

let disposed = false

function onFontsLoaded() {
  if (!disposed)
    measure()
}

onMounted(() => {
  measure()
  document.fonts?.ready.then(onFontsLoaded)
  document.fonts?.addEventListener('loadingdone', onFontsLoaded)
})

onBeforeUnmount(() => {
  disposed = true
  document.fonts?.removeEventListener('loadingdone', onFontsLoaded)
})

watch(locale, () => nextTick(measure))

const measured = computed(() => Boolean(sans.value && mono.value))
const ratio = computed(() => (sans.value && mono.value ? mono.value.xHeight / sans.value.xHeight : 0))
const residual = computed(() => (ratio.value ? ratio.value * em.value - 1 : 0))
const exactEm = computed(() => (ratio.value ? 1 / ratio.value : 0))

function formatEm(value: number) {
  return `${value.toFixed(2)}em`
}

function formatSigned(value: number, digits = 1) {
  const rounded = Number((value * 100).toFixed(digits))
  if (rounded === 0)
    return `±${(0).toFixed(digits)}%`
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(digits)}%`
}

function alignToMeasurement() {
  if (!exactEm.value)
    return
  em.value = Math.min(1, Math.max(0.8, Math.round(exactEm.value * 100) / 100))
}

// Specimen geometry, all derived from the measurements.
const specimen = computed(() => {
  if (!sans.value || !mono.value)
    return null
  const monoSize = FONT_SIZE * em.value
  const sansWidth = sans.value.width * FONT_SIZE
  const monoWidth = mono.value.width * monoSize
  const monoX = PAD + sansWidth + GAP
  const width = monoX + monoWidth + PAD
  const sansLine = BASELINE - sans.value.xHeight * FONT_SIZE
  const monoLine = BASELINE - mono.value.xHeight * monoSize
  return {
    width,
    height: BASELINE + 16,
    monoX,
    monoSize,
    sansLine,
    monoLine,
    bandTop: Math.min(sansLine, monoLine),
    bandHeight: Math.abs(sansLine - monoLine),
  }
})

function resetDemo() {
  em.value = DEFAULT_EM
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="icd-root" :caption="copy.caption">
    <div class="icd">
      <p ref="proseRef" class="icd__prose">
        <template v-for="(part, index) in copy.prose" :key="index">
          <code v-if="part.code" class="icd__code" :style="{ fontSize: formatEm(em) }">{{ part.text }}</code>
          <template v-else>
{{ part.text }}
</template>
        </template>
      </p>

      <svg
        v-if="specimen && sans && mono"
        class="icd__specimen"
        :viewBox="`0 0 ${specimen.width.toFixed(1)} ${specimen.height}`"
        role="img"
        :aria-label="copy.specimen"
      >
        <rect
          class="icd__band"
          x="0"
          :y="specimen.bandTop"
          :width="specimen.width"
          :height="specimen.bandHeight"
        />
        <line class="icd__baseline" x1="0" :y1="BASELINE" :x2="specimen.width" :y2="BASELINE" />
        <line class="icd__line is-sans" x1="0" :y1="specimen.sansLine" :x2="specimen.width" :y2="specimen.sansLine" />
        <line class="icd__line is-mono" x1="0" :y1="specimen.monoLine" :x2="specimen.width" :y2="specimen.monoLine" />
        <text
          class="icd__glyphs"
          :x="PAD"
          :y="BASELINE"
          :font-size="FONT_SIZE"
          :style="{ fontFamily: sans.family, fontWeight: sans.weight }"
        >{{ SPECIMEN }}</text>
        <text
          class="icd__glyphs"
          :x="specimen.monoX"
          :y="BASELINE"
          :font-size="specimen.monoSize"
          :style="{ fontFamily: mono.family, fontWeight: mono.weight }"
        >{{ SPECIMEN }}</text>
      </svg>
      <p v-else class="cfig-panel__note">
        {{ copy.unmeasured }}
      </p>
    </div>

    <template #controls>
      <label class="cfig-control icd__slider">
        <span class="cfig-control__label">{{ copy.size }}</span>
        <TxSlider v-model="em" :min="0.8" :max="1" :step="0.01" show-value :format-value="formatEm" :aria-label="copy.size" />
      </label>
      <TxButton size="sm" variant="secondary" :disabled="!measured" @click="alignToMeasurement">
        {{ copy.align }}
      </TxButton>
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--icd-sans)"><span class="cfig-legend__swatch" />{{ copy.sansLine }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--icd-mono)"><span class="cfig-legend__swatch" />{{ copy.monoLine }}</span>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.sansX }}</span>
        <span class="cfig-stat__value">{{ sans ? `${sans.xHeight.toFixed(3)} em` : '—' }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.monoX }}</span>
        <span class="cfig-stat__value">{{ mono ? `${mono.xHeight.toFixed(3)} em` : '—' }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.ratio }}</span>
        <span class="cfig-stat__value">{{ ratio ? `×${ratio.toFixed(3)} · ${formatSigned(ratio - 1)}` : '—' }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.residual(formatEm(em)) }}</span>
        <span class="cfig-stat__value">{{ ratio ? formatSigned(residual) : '—' }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.exact }}</span>
        <span class="cfig-stat__value">{{ exactEm ? `${exactEm.toFixed(3)}em` : '—' }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.icd-root {
  --icd-sans: var(--cfig-ink);
  --icd-mono: var(--cfig-accent);
}

.icd {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 18px 12px;
}

.icd__prose {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
}

/* The article's rule, with the size left to the slider. */
.icd__code {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background-color: var(--tx-fill-color-light, #f5f7fa);
  font-family: var(--cfig-mono);
  vertical-align: baseline;
}

.icd__specimen {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
  overflow: visible;
}

.icd__band {
  fill: color-mix(in srgb, var(--icd-mono) 16%, transparent);
}

.icd__baseline {
  stroke: var(--cfig-line-strong);
  stroke-width: 1;
}

.icd__line {
  stroke-width: 1.5;
}

.icd__line.is-sans {
  stroke: var(--icd-sans);
}

.icd__line.is-mono {
  stroke: var(--icd-mono);
  stroke-dasharray: 6 4;
}

.icd__glyphs {
  fill: var(--cfig-ink);
}

.icd__slider {
  flex: 1 1 260px;
}
</style>
