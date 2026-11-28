<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Semantic text on its tint, in both themes: the raw hue beside the ink TxModeChip draws,
 * `color-mix(in srgb, hue p%, --tx-text-color-primary)`. Each tone starts at the chip's own
 * share (success and warning 45%, danger 55%, info on the primary hue 50%). Both panels hold
 * the default theme's tokens from `variables.scss` whatever theme the page is in, and every
 * ratio is WCAG 2.1 contrast computed from those values.
 */

type Tone = 'danger' | 'success' | 'warning' | 'info'
type Rgb = [number, number, number]

interface Palette {
  key: 'light' | 'dark'
  ink: Rgb
  /** Secondary text, for the panel's own labels. */
  muted: Rgb
  bg: Rgb
  line: string
  hues: Record<Tone, Rgb>
  washes: Record<Tone, Rgb>
}

function hex(value: string): Rgb {
  const digits = value.replace('#', '')
  return [0, 2, 4].map(i => Number.parseInt(digits.slice(i, i + 2), 16)) as Rgb
}

/** `color-mix(in srgb, a share, b)`: a channel-wise blend of the encoded values. */
function mix(a: Rgb, b: Rgb, share: number): Rgb {
  return a.map((channel, i) => channel * share + b[i]! * (1 - share)) as Rgb
}

function linear(channel: number) {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: Rgb, b: Rgb) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function css([r, g, b]: Rgb) {
  return `rgb(${r.toFixed(1)} ${g.toFixed(1)} ${b.toFixed(1)})`
}

function toHex(rgb: Rgb) {
  return `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

const TONES: Tone[] = ['danger', 'success', 'warning', 'info']
/** TxModeChip's hue share per tone, in percent. */
const CHIP_SHARE: Record<Tone, number> = { danger: 55, success: 45, warning: 45, info: 50 }
/** WCAG 2.1 AA for body text. */
const AA = 4.5

const WHITE = hex('#ffffff')
const CARBON = hex('#141414')

// The default theme's tokens. Info chips take the primary hue and its wash; success and
// warning washes are 10% of the hue over the surface, danger and primary washes are set by hand.
const PALETTES: Palette[] = [
  {
    key: 'light',
    ink: hex('#303133'),
    muted: hex('#606266'),
    bg: WHITE,
    line: '#ebeef5',
    hues: { danger: hex('#f56c6c'), success: hex('#67c23a'), warning: hex('#e6a23c'), info: hex('#409eff') },
    washes: {
      danger: hex('#fef0f0'),
      success: mix(hex('#67c23a'), WHITE, 0.1),
      warning: mix(hex('#e6a23c'), WHITE, 0.1),
      info: hex('#ecf5ff'),
    },
  },
  {
    key: 'dark',
    ink: hex('#e5eaf3'),
    muted: hex('#cfd3dc'),
    bg: CARBON,
    line: '#363637',
    hues: { danger: hex('#f87171'), success: hex('#4ade80'), warning: hex('#fbbf24'), info: hex('#409eff') },
    washes: {
      danger: hex('#4f2020'),
      success: mix(hex('#4ade80'), CARBON, 0.1),
      warning: mix(hex('#fbbf24'), CARBON, 0.1),
      info: hex('#18222c'),
    },
  },
]

const { locale } = useI18n()

const tone = ref<Tone>('danger')
const shares = reactive<Record<Tone, number>>({ ...CHIP_SHARE })

const share = computed({
  get: () => shares[tone.value],
  set: (value: number) => {
    shares[tone.value] = value
  },
})

const copy = computed(() => locale.value === 'zh'
  ? {
      light: '浅色主题',
      dark: '暗色主题',
      meta: (ink: string, bg: string) => `主文字 ${ink} · 底 ${bg}`,
      tone: '色调',
      pure: '纯色相',
      mixed: 'color-mix 墨水',
      tones: { danger: '危险', success: '成功', warning: '警告', info: '信息' } as Record<Tone, string>,
      words: { danger: '操作失败', success: '已完成', warning: '待确认', info: '已同步' } as Record<Tone, string>,
      share: '色相占比',
      chipShare: 'TxModeChip 默认占比',
      limit: (theme: string) => `${theme}仍达 4.5:1 的最高占比`,
      caption: '两栏固定为 TuffEx 默认主题的浅色与暗色色值（variables.scss），不随页面主题切换。左列直接用纯色相写字；右列是 TxModeChip 的墨水 color-mix(in srgb, 色相 p%, 主文字色)，默认占比取自组件源码：成功、警告 45%，危险 55%，信息取主色 50%。每个对比度都按 WCAG 2.1 相对亮度实时算出，4.5:1 是正文的 AA 线。拖动滑杆改选中色调的占比，看它在哪里跌破达标线。',
    }
  : {
      light: 'Light theme',
      dark: 'Dark theme',
      meta: (ink: string, bg: string) => `text ${ink} · surface ${bg}`,
      tone: 'Tone',
      pure: 'Raw hue',
      mixed: 'color-mix ink',
      tones: { danger: 'Danger', success: 'Success', warning: 'Warning', info: 'Info' } as Record<Tone, string>,
      words: { danger: 'Failed', success: 'Completed', warning: 'Needs review', info: 'Synced' } as Record<Tone, string>,
      share: 'Hue share',
      chipShare: 'TxModeChip default share',
      limit: (theme: string) => `Highest share still at 4.5:1, ${theme.toLowerCase()}`,
      caption: 'Both columns hold the default TuffEx theme\'s light and dark values from variables.scss, whatever theme this page is in. The left column writes in the raw hue; the right one uses TxModeChip\'s ink, color-mix(in srgb, hue p%, primary text colour), starting from the shares in the component\'s source: 45% for success and warning, 55% for danger, 50% for info, which takes the primary hue. Every ratio is WCAG 2.1 contrast computed live; 4.5:1 is the AA line for body text. Drag the slider to change the selected tone\'s share and see where it stops passing.',
    })

function cell(color: Rgb, wash: Rgb) {
  const ratio = contrast(color, wash)
  return { color: css(color), ratio, pass: ratio >= AA }
}

const panels = computed(() => PALETTES.map((palette) => {
  const title = palette.key === 'light' ? copy.value.light : copy.value.dark
  return {
    key: palette.key,
    title,
    meta: copy.value.meta(toHex(palette.ink), toHex(palette.bg)),
    // The verdicts use the same recipe as the chips, so they stay legible on the fixed panel.
    vars: {
      '--cmc-bg': css(palette.bg),
      '--cmc-ink': css(palette.ink),
      '--cmc-muted': css(palette.muted),
      '--cmc-line': palette.line,
      '--cmc-pass': css(mix(palette.hues.success, palette.ink, 0.45)),
      '--cmc-fail': css(mix(palette.hues.danger, palette.ink, 0.55)),
    },
    rows: TONES.map(key => ({
      key,
      share: shares[key],
      wash: css(palette.washes[key]),
      cells: [
        { kind: 'pure', ...cell(palette.hues[key], palette.washes[key]) },
        { kind: 'mixed', ...cell(mix(palette.hues[key], palette.ink, shares[key] / 100), palette.washes[key]) },
      ],
    })),
  }
}))

/** The largest whole-percent share whose ink still clears AA on the tone's wash. */
function highestPassingShare(palette: Palette, key: Tone) {
  for (let candidate = 100; candidate >= 0; candidate -= 1) {
    if (contrast(mix(palette.hues[key], palette.ink, candidate / 100), palette.washes[key]) >= AA)
      return candidate
  }
  return null
}

const limits = computed(() => PALETTES.map((palette) => {
  const highest = highestPassingShare(palette, tone.value)
  return {
    key: palette.key,
    label: copy.value.limit(palette.key === 'light' ? copy.value.light : copy.value.dark),
    value: highest === null ? '—' : `${highest}%`,
    pass: highest !== null && share.value <= highest,
  }
}))

function formatShare(value: number) {
  return `${Math.round(value)}%`
}

function resetDemo() {
  tone.value = 'danger'
  Object.assign(shares, CHIP_SHARE)
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="cmc-root" stage="plain" :caption="copy.caption">
    <div class="cfig-split cmc">
      <section v-for="panel in panels" :key="panel.key" class="cmc-panel" :style="panel.vars">
        <header class="cmc-panel__head">
          <span class="cmc-panel__title">{{ panel.title }}</span>
          <span class="cmc-panel__meta cfig-mono">{{ panel.meta }}</span>
        </header>
        <table class="cmc-table">
          <thead>
            <tr>
              <th scope="col">
                {{ copy.tone }}
              </th>
              <th scope="col">
                {{ copy.pure }}
              </th>
              <th scope="col">
                {{ copy.mixed }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in panel.rows" :key="row.key" :class="{ 'is-selected': row.key === tone }">
              <th scope="row">
                <span class="cmc-name">{{ copy.tones[row.key] }}</span>
                <span class="cmc-share cfig-mono">{{ row.share }}%</span>
              </th>
              <td v-for="item in row.cells" :key="item.kind">
                <span class="cmc-chip" :style="{ background: row.wash, color: item.color }">{{ copy.words[row.key] }}</span>
                <span class="cmc-ratio cfig-mono" :class="item.pass ? 'is-pass' : 'is-fail'">
                  {{ item.ratio.toFixed(2) }}:1 {{ item.pass ? '✓ PASS' : '✗ FAIL' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <template #controls>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.tone }}</span>
        <TxRadioGroup v-model="tone">
          <TxRadio v-for="key in TONES" :key="key" :value="key">
            {{ copy.tones[key] }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <label class="cfig-control cmc-slider">
        <span class="cfig-control__label">{{ copy.tones[tone] }} · {{ copy.share }}</span>
        <TxSlider v-model="share" :min="0" :max="100" :step="1" show-value :format-value="formatShare" :aria-label="copy.share" />
      </label>
    </template>

    <template #readout>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.chipShare }} · {{ copy.tones[tone] }}</span>
        <span class="cfig-stat__value">{{ CHIP_SHARE[tone] }}%</span>
      </span>
      <span v-for="limit in limits" :key="limit.key" class="cfig-stat" :class="limit.pass ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ limit.label }}</span>
        <span class="cfig-stat__value">{{ limit.value }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.cmc {
  padding: 12px;
}

.cmc-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--cmc-line);
  border-radius: 12px;
  background: var(--cmc-bg);
  color: var(--cmc-ink);
}

.cmc-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 10px;
}

.cmc-panel__title {
  font-size: 12px;
  font-weight: 600;
}

.cmc-panel__meta {
  color: var(--cmc-muted);
  font-size: 11px;
}

.cmc-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.cmc-table th,
.cmc-table td {
  padding: 6px 4px;
  text-align: left;
  vertical-align: top;
}

.cmc-table thead th {
  color: var(--cmc-muted);
  font-size: 11px;
  font-weight: 500;
}

.cmc-table thead th:first-child {
  width: 22%;
}

.cmc-table tbody tr {
  border-top: 1px solid var(--cmc-line);
}

.cmc-table tbody tr.is-selected th {
  box-shadow: inset 3px 0 0 var(--cmc-ink);
}

.cmc-table tbody th {
  padding-left: 8px;
  font-weight: 400;
}

.cmc-name,
.cmc-share {
  display: block;
}

.cmc-name {
  font-size: 12px;
}

.cmc-share {
  color: var(--cmc-muted);
  font-size: 11px;
}

.cmc-chip {
  display: inline-block;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.cmc-ratio {
  display: block;
  margin-top: 4px;
  font-size: 11px;
}

.cmc-ratio.is-pass {
  color: var(--cmc-pass);
}

.cmc-ratio.is-fail {
  color: var(--cmc-fail);
}

.cmc-slider {
  flex: 1 1 260px;
}
</style>
