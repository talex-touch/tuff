<script setup lang="ts">
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { UsageInsights } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { TrendMetric, TrendSeriesStyles } from './audit-trend'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxChartLegendItem, TxTimeseriesChart } from '@talex-touch/tuffex/charts'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createDayLabelFormatter,
  formatCompact,
  formatInteger,
  formatUsd,
  usdTickFormatter
} from './audit-format'
import {
  buildTrendSeries,
  nearestTrendDay,
  TREND_PADDING_SERIES,
  trendDayAtTick,
  trendDays
} from './audit-trend'

/**
 * Local calendar days as bars: Token (input stacked on output), requests (succeeded stacked on
 * failed) or the estimated cost (parent PRD R-D3).
 *
 * The axis reads the main process's day keys, every day of the window drawn even when it is a
 * zero; a zero draws no bar, because a bar of no height is no bar.
 */
defineOptions({ name: 'AuditTrendCard' })

const props = defineProps<{
  insights?: UsageInsights | null
  loading?: boolean
}>()

const { t, locale } = useI18n()

const CHART_HEIGHT = 220

const metric = ref<TrendMetric>('tokens')

const metricItems = computed<FilterChipItem[]>(() => [
  { value: 'tokens', label: t('intelligenceAudit.trend.tokens') },
  { value: 'requests', label: t('intelligenceAudit.trend.requests') },
  { value: 'cost', label: t('intelligenceAudit.trend.cost') }
])

function setMetric(value: FilterChipValue): void {
  if (value === 'tokens' || value === 'requests' || value === 'cost') metric.value = value
}

/**
 * Series colours, by what each series is rather than where it falls: input and success share the
 * first slot, output takes the sixth (checked for colour-vision separation against the first in
 * both themes), and a failure is the chart's attention red because it is a state, not a category.
 */
const styles = computed<TrendSeriesStyles>(() => ({
  input: {
    name: t('intelligenceAudit.metrics.input'),
    color: 'var(--tx-chart-categorical-1, #4290f0)'
  },
  output: {
    name: t('intelligenceAudit.metrics.output'),
    color: 'var(--tx-chart-categorical-6, #d37536)'
  },
  other: {
    name: t('intelligenceAudit.metrics.otherTokens'),
    color: 'var(--tx-chart-categorical-4, #8d58ee)'
  },
  success: {
    name: t('intelligenceAudit.trend.success'),
    color: 'var(--tx-chart-categorical-1, #4290f0)'
  },
  failure: {
    name: t('intelligenceAudit.trend.failure'),
    color: 'var(--tx-chart-semantic-attention, #fc574a)'
  },
  cost: { name: t('intelligenceAudit.trend.cost'), color: 'var(--tx-chart-categorical-1, #4290f0)' }
}))

const days = computed(() => (props.insights ? trendDays(props.insights) : []))
const series = computed(() => buildTrendSeries(days.value, metric.value, styles.value))
const visibleSeries = computed(() =>
  series.value.filter((entry) => entry.name !== TREND_PADDING_SERIES)
)
/** Only the padding series is hidden; see `buildTrendSeries`. */
const hiddenSeries = [TREND_PADDING_SERIES]

function formatValue(value: number): string {
  return metric.value === 'cost'
    ? formatUsd(value, locale.value)
    : formatInteger(value, locale.value)
}

/** A key per visible series: its colour, its name, its total over the window. */
const legend = computed(() =>
  visibleSeries.value.map((entry) => ({
    name: entry.name,
    color: entry.color ?? 'var(--tx-chart-categorical-1, #4290f0)',
    value: formatValue(entry.data.reduce((sum, [, value]) => sum + value, 0))
  }))
)

const dayLabel = computed(() => createDayLabelFormatter(locale.value))
const dayTitle = computed(() =>
  createDayLabelFormatter(locale.value, { month: 'short', day: 'numeric', weekday: 'short' })
)

/**
 * The time axis ticks on local midnights — the same instants the bars sit on — and only those
 * get a label: for a one-day window d3 ticks every few hours, and an hour has no bar.
 */
function tickFormat(timestamp: number): string {
  const day = trendDayAtTick(days.value, timestamp)
  return day ? dayLabel.value(day.day) : ''
}

/** The pointer's time snapped to the bar the tooltip's rows are read from. */
function tooltipTitle(timestamp: number): string {
  const day = nearestTrendDay(days.value, timestamp)
  return day ? dayTitle.value(day.day) : ''
}

const yTickFormat = computed(() =>
  metric.value === 'cost'
    ? usdTickFormatter(locale.value)
    : (value: number) => formatCompact(value, locale.value)
)

/** d3 picks the tick interval; one tick a day suits a week, one a week suits thirty days. */
const xTickCount = computed(() => (days.value.length > 10 ? 6 : Math.max(1, days.value.length)))

const ariaDescription = computed(() =>
  t(`intelligenceAudit.trend.aria.${metric.value}`, { days: days.value.length })
)
</script>

<template>
  <TxCard
    class="AuditTrendCard"
    shadow="none"
    data-testid="audit-trend"
    :aria-hidden="loading ? 'true' : undefined"
  >
    <header class="AuditTrendCard-Header">
      <h3>{{ t('intelligenceAudit.trend.title') }}</h3>
      <TxFilterChips
        :model-value="metric"
        :items="metricItems"
        role="tablist"
        :aria-label="t('intelligenceAudit.trend.metricLabel')"
        :disabled="loading"
        data-testid="audit-trend-metric"
        @update:model-value="setMetric"
      />
    </header>

    <div class="AuditTrendCard-Legend">
      <template v-if="loading || !insights">
        <TxChartLegendItem v-for="index in 2" :key="index" loading />
      </template>
      <template v-else>
        <TxChartLegendItem
          v-for="item in legend"
          :key="item.name"
          :name="item.name"
          :color="item.color"
          :value="item.value"
        />
      </template>
    </div>

    <TxTimeseriesChart
      class="AuditTrendCard-Chart"
      type="bar"
      :loading="loading || !insights"
      :data="series"
      :hidden-series="hiddenSeries"
      :height="CHART_HEIGHT"
      :x-axis-tick-count="xTickCount"
      :x-axis-tick-format="tickFormat"
      :y-axis-tick-format="yTickFormat"
      :y-axis-min-interval="metric === 'cost' ? undefined : 1"
      :tooltip-value-format="formatValue"
      :timestamp-format="tooltipTitle"
      :aria-description="ariaDescription"
      data-testid="audit-trend-chart"
    />

    <!-- The chart's numbers for a screen reader: a tooltip must never be the only way to a value. -->
    <table
      v-if="insights && !loading"
      class="AuditTrendCard-SrOnly"
      data-testid="audit-trend-table"
    >
      <caption>
        {{
          t('intelligenceAudit.trend.tableCaption')
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t('intelligenceAudit.trend.day') }}</th>
          <th v-for="entry in visibleSeries" :key="entry.name" scope="col">{{ entry.name }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(day, index) in days" :key="day.day">
          <th scope="row">{{ dayTitle(day.day) }}</th>
          <td v-for="entry in visibleSeries" :key="entry.name">
            {{ formatValue(entry.data[index]?.[1] ?? 0) }}
          </td>
        </tr>
      </tbody>
    </table>
  </TxCard>
</template>

<style scoped lang="scss">
.AuditTrendCard {
  padding: var(--shell-space-5) var(--shell-space-6);
}

.AuditTrendCard-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3);

  h3 {
    margin: 0;
    font-size: var(--shell-fs-lg);
    line-height: 1.3;
  }
}

/* One key for the stacked series, above the plot, in text ink with the series colour as a dot. */
.AuditTrendCard-Legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2) var(--shell-space-5);
  min-height: 1rem;
  margin: var(--shell-space-3) 0 var(--shell-space-2);
  color: var(--shell-text-secondary);
}

.AuditTrendCard-SrOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .AuditTrendCard {
    padding: var(--shell-space-5);
  }
}
</style>
