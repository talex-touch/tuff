<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * A scrolling list under a sticky bar, divided either by the article's drop shadow or by its
 * 1px hairline. The bar has an opaque background either way.
 *
 * The readouts come from the shadow's own numbers. CSS blurs a box shadow with a Gaussian of
 * σ = blur / 2, which fades out about one blur radius past the shadow's edge; that edge sits
 * offset-y below the bar. So the shadow reaches offset-y + blur into the content, and right
 * under the bar it darkens the content by alpha · Φ(offset-y / σ). The hairline is the bar's
 * own bottom border and puts nothing on the content.
 */

type Divider = 'shadow' | 'hairline'

// The article's two snippets: `box-shadow: 0 4px 12px rgba(0,0,0,0.15)` and `border-bottom: 1px solid`.
const SHADOW = { offsetY: 4, blur: 12, alpha: 0.15 }
const HAIRLINE = 1
const ROW_COUNT = 24

const { locale } = useI18n()

const divider = ref<Divider>('shadow')
const scroller = ref<HTMLElement | null>(null)

/** Standard normal CDF via Abramowitz–Stegun 7.1.26 (absolute error under 1.5e-7). */
function normalCdf(x: number) {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  return 0.5 * (1 + Math.sign(x) * erf)
}

const SHADOW_REACH = SHADOW.offsetY + SHADOW.blur
const SHADOW_AT_EDGE = SHADOW.alpha * normalCdf(SHADOW.offsetY / (SHADOW.blur / 2))
const SHADOW_CSS = `0 ${SHADOW.offsetY}px ${SHADOW.blur}px rgba(0, 0, 0, ${SHADOW.alpha})`

const copy = computed(() => locale.value === 'zh'
  ? {
      label: '带吸顶条的可滚动列表',
      divider: '分割方式',
      shadow: '投影',
      hairline: `${HAIRLINE}px 细线`,
      name: '名称',
      status: '状态',
      updated: '更新',
      statuses: ['运行中', '已完成', '排队中'],
      row: (n: number) => `第 ${n} 项任务`,
      ago: (minutes: number) => `${minutes} 分钟前`,
      reach: '落到内容上的深度',
      edge: '紧贴吸顶条处的压暗',
      caption: `滚动列表，对比两种分割。两种吸顶条都是不透明实底；投影就是文中的 ${SHADOW_CSS}。读数按 CSS 对投影的高斯模糊（σ = 模糊半径 ÷ 2）算出。`,
    }
  : {
      label: 'Scrolling list under a sticky bar',
      divider: 'Divider',
      shadow: 'Shadow',
      hairline: `${HAIRLINE}px hairline`,
      name: 'Name',
      status: 'Status',
      updated: 'Updated',
      statuses: ['Running', 'Done', 'Queued'],
      row: (n: number) => `Task ${n}`,
      ago: (minutes: number) => `${minutes} min ago`,
      reach: 'Reach into the content',
      edge: 'Darkening right under the bar',
      caption: `Scroll the list to compare the two dividers. The bar is opaque in both; the shadow is the article's ${SHADOW_CSS}. The readouts follow the Gaussian blur CSS gives a shadow, σ = blur ÷ 2.`,
    })

const rows = computed(() => Array.from({ length: ROW_COUNT }, (_, i) => ({
  name: copy.value.row(i + 1),
  status: copy.value.statuses[i % copy.value.statuses.length],
  time: copy.value.ago((i + 1) * 3),
})))

const barStyle = computed(() => divider.value === 'shadow'
  // A transparent border keeps the bar the same height in both modes.
  ? { boxShadow: SHADOW_CSS, borderBottom: `${HAIRLINE}px solid transparent` }
  : { borderBottom: `${HAIRLINE}px solid var(--tx-border-color, #dcdfe6)` })

const reach = computed(() => divider.value === 'shadow' ? SHADOW_REACH : 0)
const darkening = computed(() => divider.value === 'shadow' ? SHADOW_AT_EDGE : 0)

function resetDemo() {
  divider.value = 'shadow'
  scroller.value?.scrollTo({ top: 0 })
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption" stage="plain">
    <div ref="scroller" class="stk" tabindex="0" role="region" :aria-label="copy.label">
      <div class="stk__bar stk__line" :style="barStyle">
        <span>{{ copy.name }}</span>
        <span>{{ copy.status }}</span>
        <span class="stk__time">{{ copy.updated }}</span>
      </div>
      <ul class="stk__rows">
        <li v-for="(row, i) in rows" :key="i" class="stk__line">
          <span>{{ row.name }}</span>
          <span class="stk__muted">{{ row.status }}</span>
          <span class="stk__muted stk__time">{{ row.time }}</span>
        </li>
      </ul>
    </div>

    <template #controls>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.divider }}</span>
        <TxRadioGroup v-model="divider">
          <TxRadio value="shadow">
            {{ copy.shadow }}
          </TxRadio>
          <TxRadio value="hairline">
            {{ copy.hairline }}
          </TxRadio>
        </TxRadioGroup>
      </div>
    </template>

    <template #readout>
      <span class="cfig-stat" :class="reach > 0 ? 'is-fail' : 'is-pass'">
        <span class="cfig-stat__label">{{ copy.reach }}</span>
        <span class="cfig-stat__value">{{ reach }}px</span>
      </span>
      <span class="cfig-stat" :class="darkening > 0 ? 'is-fail' : 'is-pass'">
        <span class="cfig-stat__label">{{ copy.edge }}</span>
        <span class="cfig-stat__value">{{ (darkening * 100).toFixed(1) }}%</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.stk {
  height: 264px;
  overflow-y: auto;
  background: var(--tx-bg-color, #fff);
}

.stk:focus-visible {
  outline: 2px solid var(--cfig-accent);
  outline-offset: -2px;
}

.stk__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5.5em 6.5em;
  gap: 10px;
  align-items: center;
  padding: 9px 14px;
}

.stk__bar {
  position: sticky;
  top: 0;
  /* Opaque in both modes, as the article requires. */
  background: var(--tx-bg-color, #fff);
  color: var(--cfig-muted);
  font-size: 12px;
  font-weight: 600;
}

.stk__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.stk__rows .stk__line:nth-child(even) {
  background: var(--cfig-panel);
}

.stk__muted {
  color: var(--cfig-muted);
}

.stk__time {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
