<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const GAP = 5
function series(values: number[]) {
  return values.map((value, index) => ({ time: index * GAP, value }))
}

// Even, dense samples let the default monotone curve communicate the trend
// instead of turning an eight-point polyline into a jagged zig-zag.
const MINT = series([-2.9, -3.02, -3.18, -3.4, -3.23, -3.05, -3.12, -3.42, -3.86, -3.71, -3.52, -3.68, -3.93, -4.1, -3.96, -3.82, -3.95, -4.2, -4.41, -4.28, -4.12, -4.24, -4.04, -3.88])
const PISTACHIO = series([0.22, 0.31, 0.45, 0.58, 0.51, 0.42, 0.55, 0.74, 0.91, 0.84, 0.76, 0.89, 1.02, 1.08, 1.01, 0.96, 1.05, 1.18, 1.15, 1.23, 1.16, 1.28, 1.35, 1.31])

const chartSeries = [
  { id: 'mint', label: 'Mint Chip', data: MINT, color: 'var(--tx-bui-orange)' },
  { id: 'pistachio', label: 'Pistachio', data: PISTACHIO, color: 'var(--tx-bui-accent)' },
]

const hoverIndex = ref<number | null>(null)

const copy = computed(() => locale.value === 'zh'
  ? { mint: '薄荷脆片', pistachio: '开心果', caption: '趋势快照', badge: '实时趋势' }
  : { mint: 'Mint Chip', pistachio: 'Pistachio', caption: 'Trend snapshot', badge: 'Live trend' })

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function formatTime(value: number): string {
  const minutes = Math.round(value)
  return `${12 + Math.floor(minutes / 60)}:${`${minutes % 60}`.padStart(2, '0')}`
}

const rows = computed(() => {
  if (hoverIndex.value === null)
    return []
  return [
    { label: copy.value.mint, value: formatPercent(MINT[hoverIndex.value]?.value ?? 0), color: 'var(--tx-bui-orange)' },
    { label: copy.value.pistachio, value: formatPercent(PISTACHIO[hoverIndex.value]?.value ?? 0), color: 'var(--tx-bui-accent)' },
  ]
})
const timeLabel = computed(() => hoverIndex.value === null ? '' : formatTime(MINT[hoverIndex.value]?.time ?? 0))
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
      :active-index="hoverIndex"
      :rows="rows"
      :time-label="timeLabel"
      @update:active-index="hoverIndex = $event"
    >
      <TxSparkChart
        :series="chartSeries"
        :active-index="hoverIndex"
        :aria-label="copy.caption"
        grid
        x-axis
        y-axis
        :x-tick-format="formatTime"
      />
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
  height: 178px;
}
</style>
