<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

// Sample times are index-derived rather than clock-derived: a module-scope
// Date.now() would differ between the server render and the client hydrate.
const GAP = 6
function series(values: number[]) {
  return values.map((value, index) => ({ time: index * GAP, value }))
}

const MINT = series([-2.9, -3.4, -3.05, -3.86, -3.52, -4.1, -3.82, -4.41])
const PISTACHIO = series([0.22, 0.58, 0.42, 0.91, 0.76, 1.08, 0.96, 1.15])

const chartSeries = [
  { id: 'mint', data: MINT, color: 'var(--tx-bui-orange)' },
  { id: 'pistachio', data: PISTACHIO, color: 'var(--tx-bui-accent)' },
]

const hoverIndex = ref<number | null>(null)

const copy = computed(() => locale.value === 'zh'
  ? { mint: '薄荷脆片', pistachio: '开心果', caption: '趋势快照', badge: '快照', time: '今天 12:00' }
  : { mint: 'Mint Chip', pistachio: 'Pistachio', caption: 'Trend snapshot', badge: 'Snapshot', time: 'Today, 12:00' })

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

const rows = computed(() => {
  if (hoverIndex.value === null)
    return []
  return [
    { label: copy.value.mint, value: formatPercent(MINT[hoverIndex.value]?.value ?? 0), color: 'var(--tx-bui-orange)' },
    { label: copy.value.pistachio, value: formatPercent(PISTACHIO[hoverIndex.value]?.value ?? 0), color: 'var(--tx-bui-accent)' },
  ]
})
</script>

<template>
  <div class="spark-demo">
    <div class="spark-demo__bar">
      <span class="spark-demo__caption">{{ copy.caption }}</span>
      <span class="spark-demo__badge">{{ copy.badge }}</span>
    </div>
    <TxChartScrubber
      class="spark-demo__stage"
      :point-count="MINT.length"
      :rows="rows"
      :time-label="copy.time"
      @scrub="hoverIndex = $event"
      @leave="hoverIndex = null"
    >
      <TxSparkChart :series="chartSeries" :aria-label="copy.caption" />
    </TxChartScrubber>
  </div>
</template>

<style scoped>
.spark-demo {
  width: 100%;
  max-width: 356px;
  overflow: hidden;
  background: var(--tx-bui-inset, #f7f8f9);
  border-radius: var(--tx-bui-radius-control, 8px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.spark-demo__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.spark-demo__caption {
  font-size: 11px;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-variant-numeric: tabular-nums;
}

.spark-demo__badge {
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--tx-bui-ink-2, #62656b);
  background: var(--tx-bui-field, #f2f2f3);
  border-radius: 999px;
}

.spark-demo__stage {
  height: 166px;
}
</style>
