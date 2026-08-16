<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// Index-derived sample times: a module-scope Date.now() would differ between
// the server render and the client hydrate.
function series(values: number[], gap = 6) {
  return values.map((value, index) => ({ time: index * gap, value }))
}

const MINT = series([-2.9, -3.4, -3.05, -3.86, -3.52, -4.1, -3.82, -4.41])
const PISTACHIO = series([0.22, 0.58, 0.42, 0.91, 0.76, 1.08, 0.96, 1.15])
const SPEND = series([274, 289, 264, 307, 331, 1210, 1718, 2112], 7)
const USAGE = series([18, 19, 17, 21, 22, 58, 81, 96], 7)

const page = ref(0)
const metric = ref<'spend' | 'usage'>('spend')
const compareHover = ref<number | null>(null)
const anomalyHover = ref<number | null>(null)
const allocation = ref('van')
const asked = ref<string | null>(null)

const compareSeries = [
  { id: 'mint', data: MINT, color: 'var(--tx-bui-orange)' },
  { id: 'pistachio', data: PISTACHIO, color: 'var(--tx-bui-accent)' },
]
const anomalySeries = computed(() => [
  { id: metric.value, data: metric.value === 'spend' ? SPEND : USAGE, color: 'var(--tx-bui-red)' },
])

const segments = computed(() => zh.value
  ? [
      { key: 'van', label: '香草', short: 'VAN', percent: 72.5, amount: '$51,785', color: 'var(--tx-bui-orange)', description: '当前库存价值的贡献快照。' },
      { key: 'choc', label: '巧克力', short: 'CHOC', percent: 22.8, amount: '$16,278', description: '第二大持仓。' },
      { key: 'mint', label: '薄荷', short: 'MINT', percent: 4.7, amount: '$3,357', description: '尾部份额。' },
    ]
  : [
      { key: 'van', label: 'Vanilla', short: 'VAN', percent: 72.5, amount: '$51,785', color: 'var(--tx-bui-orange)', description: 'Contribution snapshot across current inventory value.' },
      { key: 'choc', label: 'Chocolate', short: 'CHOC', percent: 22.8, amount: '$16,278', description: 'The second position.' },
      { key: 'mint', label: 'Mint', short: 'MINT', percent: 4.7, amount: '$3,357', description: 'The tail share.' },
    ])

const activeSegment = computed(() => segments.value.find(segment => segment.key === allocation.value))

const pages = computed(() => zh.value
  ? [
      { key: 'compare', prose: '你的创意工坊里表现最差的是 Rocky Road —— 下跌 6%，合 −$2,453.44。', suggestion: '要不要重新配比口味？' },
      { key: 'anomaly', prose: '12 月 13 日的冷柜电费异常偏高 —— 比均值高出 $1,834.66。', suggestion: '给点降低冷柜成本的建议' },
      { key: 'allocation', prose: '你在香草上压得很重 —— 它占了整箱的 72.5%。', suggestion: '如果只看季节限定，情况会怎样？' },
    ]
  : [
      { key: 'compare', prose: 'The worst performer in your creamery is Rocky Road — down 6%, or −$2,453.44.', suggestion: 'Should I rebalance flavors?' },
      { key: 'anomaly', prose: 'Unusually high freezer bill on Dec 13 — $1,834.66 above your average.', suggestion: 'Get tips on cutting freezer costs' },
      { key: 'allocation', prose: 'You are heavily invested in Vanilla — it is 72.5% of your case.', suggestion: 'If we look at seasonals, what changes?' },
    ])

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}
function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`
}
function formatMetric(value: number): string {
  return metric.value === 'spend' ? formatMoney(value) : `${Math.round(value)} kWh`
}

const copy = computed(() => zh.value
  ? { mint: '薄荷脆片', pistachio: '开心果', snapshot: '快照', trend: '趋势快照', time: '今天 12:00', spend: '支出', usage: '用电', freezer: '冷柜支出偏高', spent: '已花费', vs: '对比近 3 个月', threshold: '阈值' }
  : { mint: 'Mint Chip', pistachio: 'Pistachio', snapshot: 'Snapshot', trend: 'Trend snapshot', time: 'Today, 12:00', spend: 'Spend', usage: 'Usage', freezer: 'High freezer spend', spent: 'spent', vs: 'vs 3 months', threshold: 'threshold' })

const compareRows = computed(() => compareHover.value === null
  ? []
  : [
      { label: copy.value.mint, value: formatPercent(MINT[compareHover.value]?.value ?? 0), color: 'var(--tx-bui-orange)' },
      { label: copy.value.pistachio, value: formatPercent(PISTACHIO[compareHover.value]?.value ?? 0), color: 'var(--tx-bui-accent)' },
    ])

const anomalyData = computed(() => (metric.value === 'spend' ? SPEND : USAGE))
const anomalyRows = computed(() => anomalyHover.value === null
  ? []
  : [{
      label: metric.value === 'spend' ? copy.value.spend : copy.value.usage,
      value: formatMetric(anomalyData.value[anomalyHover.value]?.value ?? 0),
      color: 'var(--tx-bui-red)',
    }])

const anomalyCaption = computed(() => {
  if (anomalyHover.value !== null)
    return formatMetric(anomalyData.value[anomalyHover.value]?.value ?? 0)
  return metric.value === 'spend' ? `$2,112 ${copy.value.threshold}` : `82 kWh ${copy.value.threshold}`
})
</script>

<template>
  <div class="insight-demo">
    <TxInsightCards
      v-model:active-index="page"
      :pages="pages"
      :title="zh ? '洞察' : 'Insights'"
      @follow-up="asked = $event.suggestion ?? null"
    >
      <template #default="{ page: current }">
        <!-- 1 — two series compared -->
        <div v-if="current.key === 'compare'" class="insight-demo__card">
          <div class="insight-demo__metrics">
            <TxInsightMetric
              :label="copy.mint"
              color="var(--tx-bui-orange)"
              :value="-4.41"
              detail="−$2,377.66"
            />
            <TxInsightMetric
              :label="copy.pistachio"
              color="var(--tx-bui-accent)"
              :value="1.15"
              detail="+$617.22"
            />
          </div>
          <div class="insight-demo__chart">
            <div class="insight-demo__chart-bar">
              <span class="insight-demo__caption">{{ copy.trend }}</span>
              <span class="insight-demo__badge">{{ copy.snapshot }}</span>
            </div>
            <TxChartScrubber
              class="insight-demo__stage"
              :point-count="MINT.length"
              :rows="compareRows"
              :time-label="copy.time"
              @scrub="compareHover = $event"
              @leave="compareHover = null"
            >
              <TxSparkChart :series="compareSeries" :aria-label="copy.trend" />
            </TxChartScrubber>
          </div>
        </div>

        <!-- 2 — one series with a metric switch -->
        <div v-else-if="current.key === 'anomaly'" class="insight-demo__card">
          <div class="insight-demo__head">
            <span class="insight-demo__title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx-bui-red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              {{ copy.freezer }}
            </span>
            <span class="insight-demo__badge">{{ copy.snapshot }}</span>
          </div>
          <div class="insight-demo__chart">
            <div class="insight-demo__chart-bar">
              <span class="insight-demo__caption">{{ anomalyCaption }}</span>
              <span class="insight-demo__switch">
                <button
                  v-for="option in (['spend', 'usage'] as const)"
                  :key="option"
                  type="button"
                  :aria-pressed="metric === option"
                  :class="{ 'is-on': metric === option }"
                  @click="metric = option"
                >
                  {{ option === 'spend' ? copy.spend : copy.usage }}
                </button>
              </span>
            </div>
            <TxChartScrubber
              class="insight-demo__stage"
              :point-count="anomalyData.length"
              :rows="anomalyRows"
              :time-label="copy.time"
              @scrub="anomalyHover = $event"
              @leave="anomalyHover = null"
            >
              <TxSparkChart :series="anomalySeries" grid :aria-label="copy.freezer" :padding="{ top: 18 }" />
            </TxChartScrubber>
          </div>
          <div class="insight-demo__footline">
            <span class="insight-demo__hero">$2,112 {{ copy.spent }}</span>
            <code class="insight-demo__mono">+$1,834.66</code>
            <span class="insight-demo__note">{{ copy.vs }}</span>
          </div>
        </div>

        <!-- 3 — share of the whole -->
        <div v-else class="insight-demo__card">
          <span class="insight-demo__title">
            <span class="insight-demo__mark" aria-hidden="true">V</span>
            {{ zh ? '香草占比' : 'Vanilla allocation' }}
          </span>
          <span class="insight-demo__hero insight-demo__hero--block">{{ activeSegment?.amount }}</span>
          <TxAllocationBar v-model="allocation" :segments="segments" detail class="insight-demo__allocation" />
        </div>
      </template>
    </TxInsightCards>

    <p v-if="asked" class="insight-demo__asked">
      {{ zh ? '已发送追问：' : 'Follow-up sent: ' }}{{ asked }}
    </p>
  </div>
</template>

<style scoped>
.insight-demo {
  width: 100%;
  max-width: 344px;
}

.insight-demo__card {
  padding: 12px;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.insight-demo__metrics {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.insight-demo__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.insight-demo__title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
}

.insight-demo__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  background: var(--tx-bui-orange, #ef720c);
  border-radius: 999px;
}

.insight-demo__chart {
  margin-top: 8px;
  overflow: hidden;
  background: var(--tx-bui-inset, #f7f8f9);
  border-radius: var(--tx-bui-radius-control, 8px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.insight-demo__chart-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.insight-demo__caption {
  font-size: 11px;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-variant-numeric: tabular-nums;
}

.insight-demo__badge {
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--tx-bui-ink-2, #62656b);
  background: var(--tx-bui-field, #f2f2f3);
  border-radius: 999px;
}

.insight-demo__switch {
  display: flex;
  padding: 2px;
  background: var(--tx-bui-field, #f2f2f3);
  border-radius: 999px;
}

.insight-demo__switch button {
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--tx-bui-ink-3, #9a9da3);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.insight-demo__switch button.is-on {
  color: var(--tx-bui-ink, #1f2124);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
}

.insight-demo__stage {
  height: 166px;
}

.insight-demo__footline {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-top: 6px;
}

.insight-demo__hero {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--tx-bui-ink, #1f2124);
  font-variant-numeric: tabular-nums;
}

.insight-demo__hero--block {
  display: block;
  margin-top: 4px;
  font-size: 20px;
}

.insight-demo__mono {
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  color: var(--tx-bui-red, #e3474c);
}

.insight-demo__note {
  font-size: 11px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.insight-demo__allocation {
  margin-top: 12px;
}

.insight-demo__asked {
  margin-top: 10px;
  font-size: 12px;
  color: var(--tx-bui-ink-2, #62656b);
}
</style>
