<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * One passage set dark on light and light on dark, a row per role at TuffEx's weights: body 400,
 * emphasis 500, headings 600 and bold 700 on light, and on dark what the `--tx-font-weight-*`
 * tokens take there (style/variables.scss): body unchanged, 460, 560 and 660.
 *
 * Whether 460 is drawn at 460 depends on the font. A weight axis draws it; with static faces
 * CSS font matching picks a face instead: between 400 and 500 the nearest face up to 500, below
 * 400 the nearest face below, above 500 the nearest face above. So the figure draws the same
 * string on a canvas at each weight and compares the ink, the alpha the glyphs leave, with the
 * neighbouring hundreds: equal ink means the same face. Han characters all advance one em
 * whatever the weight, so width cannot tell for them; the widths are reported to show it.
 */

type Role = 'body' | 'emphasis' | 'heading' | 'bold'
type Script = 'latin' | 'cjk'

interface Sample {
  ink: number
  width: number
}

/** Draws the probe string at a weight; null when the canvas cannot set that weight. */
type Probe = (weight: number) => Sample | null

/** What a weight is drawn as in one font stack. */
type Rendered =
  | { kind: 'named' }
  | { kind: 'axis' }
  | { kind: 'same', like: number[] }
  | { kind: 'unknown' }

const LATIN_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const LATIN_TEXT = 'Hamburgefonstiv'
const CJK_TEXT = '光渗让亮字显得更粗'
const PROBE_SIZE = 48
/** One face draws the same pixels; the tolerance only absorbs read-back noise. */
const SAME_INK = 0.002

const THEMES = ['light', 'dark'] as const

const ROLES: Array<{ key: Role, light: number, dark: number, min: number, max: number, size: number }> = [
  // TuffEx leaves body text at 400 on dark; the slider goes below it to show where a static font
  // falls.
  { key: 'body', light: 400, dark: 400, min: 300, max: 450, size: 15 },
  { key: 'emphasis', light: 500, dark: 460, min: 400, max: 550, size: 15 },
  { key: 'heading', light: 600, dark: 560, min: 500, max: 650, size: 18 },
  { key: 'bold', light: 700, dark: 660, min: 600, max: 750, size: 15 },
]

function createProbe(family: string, text: string): Probe | null {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return null
  const ctx: CanvasRenderingContext2D = context
  ctx.font = `${PROBE_SIZE}px ${family}`
  canvas.width = Math.ceil(ctx.measureText(text).width * 1.25 + PROBE_SIZE)
  canvas.height = Math.ceil(PROBE_SIZE * 1.8)
  const samples = new Map<number, Sample | null>()

  return (weight) => {
    if (samples.has(weight))
      return samples.get(weight)!
    // Resizing reset the context, and a canvas that cannot parse a weight keeps its old font.
    ctx.font = `${weight} ${PROBE_SIZE}px ${family}`
    if (weight % 100 !== 0 && !new RegExp(`(?:^|\\s)${weight}(?:\\s|$)`).test(ctx.font)) {
      samples.set(weight, null)
      return null
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, PROBE_SIZE / 2, canvas.height / 2)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let i = 3; i < data.length; i += 4)
      ink += data[i]!
    const sample = ink > 0 ? { ink, width: ctx.measureText(text).width } : null
    samples.set(weight, sample)
    return sample
  }
}

function sameInk(a: Sample, b: Sample) {
  return Math.abs(a.ink - b.ink) <= SAME_INK * Math.max(a.ink, b.ink)
}

function resolve(probe: Probe | null | undefined, weight: number): Rendered {
  if (weight % 100 === 0)
    return { kind: 'named' }
  if (!probe)
    return { kind: 'unknown' }
  const below = Math.floor(weight / 100) * 100
  const above = below + 100
  const at = probe(weight)
  const low = probe(below)
  const high = probe(above)
  if (!at || !low || !high)
    return { kind: 'unknown' }
  const like = [below, above].filter((_, i) => sameInk(at, i === 0 ? low : high))
  if (like.length)
    return { kind: 'same', like }
  return low.ink < at.ink && at.ink < high.ink ? { kind: 'axis' } : { kind: 'unknown' }
}

const { locale } = useI18n()

const stage = ref<HTMLElement | null>(null)
const probes = shallowRef<Record<Script, Probe | null> | null>(null)
const compensate = ref(true)
const darkWeights = reactive<Record<Role, number>>({ body: 400, emphasis: 460, heading: 560, bold: 660 })

const copy = computed(() => locale.value === 'zh'
  ? {
      light: '浅色 · 深字白底',
      dark: '暗色 · 亮字暗底',
      roles: { body: '正文', emphasis: '强调', heading: '小标题', bold: '加粗' } as Record<Role, string>,
      cjkText: '光渗让亮字显得更粗',
      latinText: 'Light text looks bolder',
      compensate: '暗色字重补偿',
      darkWeight: (role: string) => `${role}（暗色）`,
      cjk: '中文',
      latin: 'Latin',
      same: (weights: number[]) => `同 ${weights.join(' / ')}`,
      cjkFont: '中文 · 页面继承字体',
      latinFont: 'Latin · system-ui 字体栈',
      measuring: '测量中…',
      unmeasurable: '无法测量',
      axis: (share: number) => `有字重轴：460 落在 400→500 的 ${share}%`,
      snapUp: '无字重轴：460 画成 500',
      snapDown: '无字重轴：460 画成 400',
      flat: '400 到 500 只有一个字面',
      evidence: (latin: string, cjk: string) => `48px 画布上 400 / 460 / 500 的实测宽度：Latin ${latin} px，中文 ${cjk} px。汉字每字都占 1em，宽度看不出字重，所以判断依据是笔画的像素面积。`,
      caption: '两栏固定为浅色（#303133 字 / #ffffff 底）与暗色（#e5eaf3 字 / #141414 底），中文用页面继承字体，英文用 system-ui 字体栈。打开补偿后，暗色一侧换成 TuffEx 暗色主题的字重：强调 460、小标题 560、加粗 660，正文保持 400。字重是否生效要看字体：下方把同一串字在画布上分别按 400、460、500 绘制并比较笔画面积，460 与 500 完全相同就说明字体没有字重轴，460 被匹配成了 500；落在两者之间才是真正的 460。暗色每行下的小字是同样测出的实际字重；把正文拖到 390，可以看到静态字体落到 300 的 Light 字面。',
    }
  : {
      light: 'Light · dark on light',
      dark: 'Dark · light on dark',
      roles: { body: 'Body', emphasis: 'Emphasis', heading: 'Heading', bold: 'Bold' } as Record<Role, string>,
      cjkText: '光渗让亮字显得更粗',
      latinText: 'Light text looks bolder',
      compensate: 'Dark weight compensation',
      darkWeight: (role: string) => `${role} (dark)`,
      cjk: 'CJK',
      latin: 'Latin',
      same: (weights: number[]) => `= ${weights.join(' = ')}`,
      cjkFont: 'CJK · the page\'s inherited font',
      latinFont: 'Latin · the system-ui stack',
      measuring: 'Measuring…',
      unmeasurable: 'Cannot measure',
      axis: (share: number) => `Weight axis: 460 sits ${share}% of the way from 400 to 500`,
      snapUp: 'No weight axis: 460 draws as 500',
      snapDown: 'No weight axis: 460 draws as 400',
      flat: 'One face from 400 to 500',
      evidence: (latin: string, cjk: string) => `Widths measured on a 48px canvas at 400 / 460 / 500: Latin ${latin} px, CJK ${cjk} px. Every Han character advances 1em, so width cannot show weight; the verdict reads the inked area instead.`,
      caption: 'The columns are fixed light (#303133 on #ffffff) and dark (#e5eaf3 on #141414) colours; Chinese uses the page\'s inherited font, Latin the system-ui stack. With compensation on, the dark column takes the weights of TuffEx\'s dark theme: emphasis 460, headings 560 and bold 660, with body text left at 400. Whether a weight takes effect depends on the font: below, the same string is drawn on a canvas at 400, 460 and 500 and the inked areas compared. If 460 matches 500 exactly, the font has no weight axis and 460 was matched to 500; only a value in between is a real 460. The small print under each dark row is measured the same way; drag body text to 390 to see a static font fall to its Light face at 300.',
    })

function renderedLabel(rendered: Rendered, weight: number) {
  if (rendered.kind === 'same')
    return copy.value.same(rendered.like)
  if (rendered.kind === 'unknown')
    return '?'
  return String(weight)
}

const rows = computed(() => ROLES.map((role) => {
  const dark = compensate.value ? darkWeights[role.key] : role.light
  const scripts = (['cjk', 'latin'] as Script[]).map((script) => {
    const rendered = resolve(probes.value?.[script], dark)
    return { script, label: renderedLabel(rendered, dark), off: rendered.kind === 'same' }
  })
  return { ...role, dark, scripts: dark % 100 === 0 || !probes.value ? [] : scripts }
}))

const fonts = computed(() => (['latin', 'cjk'] as Script[]).map((script) => {
  const label = script === 'latin' ? copy.value.latinFont : copy.value.cjkFont
  if (!probes.value)
    return { script, label, verdict: copy.value.measuring, state: '' }
  const probe = probes.value[script]
  const rendered = resolve(probe, 460)
  if (rendered.kind === 'axis') {
    const [low, at, high] = [400, 460, 500].map(weight => probe!(weight)!)
    const share = Math.round(((at!.ink - low!.ink) / (high!.ink - low!.ink)) * 100)
    return { script, label, verdict: copy.value.axis(share), state: 'is-pass' }
  }
  if (rendered.kind === 'same') {
    const verdict = rendered.like.length > 1
      ? copy.value.flat
      : rendered.like[0] === 500 ? copy.value.snapUp : copy.value.snapDown
    return { script, label, verdict, state: 'is-fail' }
  }
  return { script, label, verdict: copy.value.unmeasurable, state: '' }
}))

const evidence = computed(() => {
  if (!probes.value)
    return ''
  const widths = (script: Script) => [400, 460, 500]
    .map(weight => probes.value?.[script]?.(weight)?.width.toFixed(1) ?? '—')
    .join(' / ')
  return copy.value.evidence(widths('latin'), widths('cjk'))
})

let disposed = false

function measure() {
  if (disposed || !stage.value)
    return
  const inherited = getComputedStyle(stage.value).fontFamily
  probes.value = {
    latin: createProbe(LATIN_STACK, LATIN_TEXT),
    cjk: createProbe(inherited, CJK_TEXT),
  }
}

onMounted(() => {
  if (!('fonts' in document)) {
    measure()
    return
  }
  // Measure once the page's fonts have loaded, and again whenever another face arrives.
  document.fonts.ready.then(measure)
  document.fonts.addEventListener('loadingdone', measure)
})

onBeforeUnmount(() => {
  disposed = true
  if ('fonts' in document)
    document.fonts.removeEventListener('loadingdone', measure)
})

function formatWeight(value: number) {
  return String(Math.round(value))
}

function resetDemo() {
  compensate.value = true
  for (const role of ROLES)
    darkWeights[role.key] = role.dark
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="irr-root" stage="plain" :caption="copy.caption">
    <div ref="stage" class="cfig-split irr">
      <section v-for="theme in THEMES" :key="theme" class="irr-panel" :class="`is-${theme}`">
        <header class="irr-panel__head">
          <span>{{ theme === 'light' ? copy.light : copy.dark }}</span>
          <span class="cfig-mono">{{ theme === 'light' ? '#303133 / #ffffff' : '#e5eaf3 / #141414' }}</span>
        </header>
        <div v-for="row in rows" :key="row.key" class="irr-row">
          <span class="irr-row__role cfig-mono">
            {{ copy.roles[row.key] }} · {{ theme === 'light' ? row.light : row.dark }}
          </span>
          <p class="irr-row__sample" :style="{ fontSize: `${row.size}px`, fontWeight: theme === 'light' ? row.light : row.dark }">
            <span class="irr-cjk">{{ copy.cjkText }}</span>
            {{ ' ' }}
            <span class="irr-latin">{{ copy.latinText }}</span>
          </p>
          <span v-if="theme === 'dark' && row.scripts.length" class="irr-row__rendered cfig-mono">
            <span v-for="item in row.scripts" :key="item.script" :class="{ 'is-off': item.off }">
              {{ item.script === 'cjk' ? copy.cjk : copy.latin }} {{ item.label }}
            </span>
          </span>
        </div>
      </section>
    </div>

    <template #controls>
      <TxSwitch v-model="compensate" size="small" :label="copy.compensate" />
      <label v-for="role in ROLES" :key="role.key" class="cfig-control irr-slider">
        <span class="cfig-control__label">{{ copy.darkWeight(copy.roles[role.key]) }}</span>
        <TxSlider
          v-model="darkWeights[role.key]"
          :min="role.min"
          :max="role.max"
          :step="10"
          :disabled="!compensate"
          show-value
          :format-value="formatWeight"
          :aria-label="copy.darkWeight(copy.roles[role.key])"
        />
      </label>
    </template>

    <template #readout>
      <span v-for="font in fonts" :key="font.script" class="cfig-stat" :class="font.state">
        <span class="cfig-stat__label">{{ font.label }}</span>
        <span class="cfig-stat__value">{{ font.verdict }}</span>
      </span>
      <p v-if="evidence" class="irr-evidence">
        {{ evidence }}
      </p>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.irr {
  padding: 12px;
}

.irr-panel {
  --irr-ink: #303133;
  --irr-muted: #606266;
  --irr-off: color-mix(in srgb, #f56c6c 55%, #303133);

  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #ffffff;
  color: var(--irr-ink);
}

.irr-panel.is-dark {
  --irr-ink: #e5eaf3;
  --irr-muted: #a3a6ad;
  --irr-off: color-mix(in srgb, #f87171 55%, #e5eaf3);

  border-color: #363637;
  background: #141414;
}

.irr-panel__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 10px;
  color: var(--irr-muted);
  font-size: 11px;
}

.irr-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.irr-row__role,
.irr-row__rendered {
  color: var(--irr-muted);
  font-size: 11px;
}

.irr-row__sample {
  margin: 0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.irr-cjk {
  font-family: inherit;
}

.irr-latin {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.irr-row__rendered {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
}

.irr-row__rendered .is-off {
  color: var(--irr-off);
}

.irr-slider {
  flex: 1 1 220px;
}

.irr-evidence {
  flex: 1 1 100%;
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
  text-wrap: pretty;
}
</style>
