<script lang="ts" setup>
import type { IntelligenceUsageSummary } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIntelligenceStats } from '@talex-touch/utils/renderer'

const props = defineProps<{
  callerId?: string
  days?: number
}>()

const { t } = useI18n()
const { getUsageStats, isLoading } = useIntelligenceStats()

const chartData = ref<IntelligenceUsageSummary[]>([])
const activeMetric = ref<'requests' | 'tokens' | 'cost'>('requests')
const hoveredIndex = ref<number | null>(null)

async function loadChartData() {
  try {
    const days = props.days || 14
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days + 1)

    const startPeriod = startDate.toISOString().split('T')[0]
    const endPeriod = endDate.toISOString().split('T')[0]

    const data = await getUsageStats(
      props.callerId || 'system',
      'day',
      startPeriod,
      endPeriod,
    )

    // Fill missing days with empty data
    const filledData: IntelligenceUsageSummary[] = []
    const dataMap = new Map(data.map(d => [d.period, d]))

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      const period = date.toISOString().split('T')[0]

      filledData.push(dataMap.get(period) || {
        period,
        periodType: 'day',
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
        avgLatency: 0,
      })
    }

    chartData.value = filledData
  }
  catch (error) {
    console.error('Failed to load chart data:', error)
  }
}

onMounted(loadChartData)
watch(() => props.callerId, loadChartData)
watch(() => props.days, loadChartData)

const maxValue = computed(() => {
  if (chartData.value.length === 0) return 1

  const values = chartData.value.map((d) => {
    switch (activeMetric.value) {
      case 'requests': return d.requestCount
      case 'tokens': return d.totalTokens
      case 'cost': return d.totalCost
    }
  })

  return Math.max(...values, 1)
})

const chartBars = computed(() => {
  return chartData.value.map((d, index) => {
    let value: number
    let successValue: number
    let failureValue: number

    switch (activeMetric.value) {
      case 'requests':
        value = d.requestCount
        successValue = d.successCount
        failureValue = d.failureCount
        break
      case 'tokens':
        value = d.totalTokens
        successValue = d.promptTokens
        failureValue = d.completionTokens
        break
      case 'cost':
        value = d.totalCost
        successValue = d.totalCost
        failureValue = 0
        break
    }

    const height = (value / maxValue.value) * 100
    const successHeight = (successValue / maxValue.value) * 100
    const failureHeight = (failureValue / maxValue.value) * 100

    const date = new Date(d.period)
    const dayLabel = date.getDate().toString()
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]

    return {
      index,
      value,
      successValue,
      failureValue,
      height,
      successHeight,
      failureHeight,
      period: d.period,
      dayLabel,
      weekday,
      data: d,
    }
  })
})

const totalStats = computed(() => {
  const totals = chartData.value.reduce((acc, d) => ({
    requests: acc.requests + d.requestCount,
    tokens: acc.tokens + d.totalTokens,
    cost: acc.cost + d.totalCost,
    success: acc.success + d.successCount,
    failure: acc.failure + d.failureCount,
  }), { requests: 0, tokens: 0, cost: 0, success: 0, failure: 0 })

  return totals
})

function formatValue(value: number, metric: 'requests' | 'tokens' | 'cost'): string {
  switch (metric) {
    case 'requests':
      return value.toLocaleString()
    case 'tokens':
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
      return value.toString()
    case 'cost':
      if (value < 0.01) return `$${value.toFixed(4)}`
      if (value < 1) return `$${value.toFixed(3)}`
      return `$${value.toFixed(2)}`
  }
}

function formatDate(period: string): string {
  const date = new Date(period)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
</script>

<template>
  <div class="usage-chart">
    <div v-if="isLoading" class="loading">
      <i class="i-carbon-circle-dash animate-spin" />
      {{ t('common.loading') }}
    </div>

    <div v-else class="chart-container">
      <!-- Metric Selector -->
      <div class="metric-tabs">
        <button
          :class="{ active: activeMetric === 'requests' }"
          @click="activeMetric = 'requests'"
        >
          <i class="i-carbon-send-alt" />
          <span>{{ t('intelligence.usage.requests') }}</span>
          <span class="metric-value">{{ totalStats.requests.toLocaleString() }}</span>
        </button>
        <button
          :class="{ active: activeMetric === 'tokens' }"
          @click="activeMetric = 'tokens'"
        >
          <i class="i-carbon-text-short-paragraph" />
          <span>{{ t('intelligence.usage.tokens') }}</span>
          <span class="metric-value">{{ formatValue(totalStats.tokens, 'tokens') }}</span>
        </button>
        <button
          :class="{ active: activeMetric === 'cost' }"
          @click="activeMetric = 'cost'"
        >
          <i class="i-carbon-currency-dollar" />
          <span>{{ t('intelligence.usage.cost') }}</span>
          <span class="metric-value">{{ formatValue(totalStats.cost, 'cost') }}</span>
        </button>
      </div>

      <!-- Chart Area -->
      <div class="chart-area">
        <div class="y-axis">
          <span>{{ formatValue(maxValue, activeMetric) }}</span>
          <span>{{ formatValue(maxValue / 2, activeMetric) }}</span>
          <span>0</span>
        </div>

        <div class="bars-container">
          <div
            v-for="bar in chartBars"
            :key="bar.period"
            class="bar-wrapper"
            @mouseenter="hoveredIndex = bar.index"
            @mouseleave="hoveredIndex = null"
          >
            <div class="bar-stack">
              <!-- Success/Primary bar -->
              <div
                class="bar success"
                :style="{ height: `${bar.successHeight}%` }"
              />
              <!-- Failure/Secondary bar -->
              <div
                v-if="activeMetric !== 'cost'"
                class="bar failure"
                :style="{ height: `${bar.failureHeight}%` }"
              />
            </div>
            <div class="bar-label">
              <span class="day">{{ bar.dayLabel }}</span>
              <span class="weekday">{{ bar.weekday }}</span>
            </div>

            <!-- Tooltip -->
            <Transition name="fade">
              <div v-if="hoveredIndex === bar.index" class="tooltip">
                <div class="tooltip-header">{{ formatDate(bar.period) }}</div>
                <div class="tooltip-row">
                  <span>{{ t('intelligence.usage.requests') }}</span>
                  <span>{{ bar.data.requestCount }}</span>
                </div>
                <div class="tooltip-row">
                  <span>{{ t('intelligence.usage.tokens') }}</span>
                  <span>{{ formatValue(bar.data.totalTokens, 'tokens') }}</span>
                </div>
                <div class="tooltip-row">
                  <span>{{ t('intelligence.usage.cost') }}</span>
                  <span>{{ formatValue(bar.data.totalCost, 'cost') }}</span>
                </div>
                <div class="tooltip-row success-rate">
                  <span>{{ t('intelligence.usage.successRate') }}</span>
                  <span>
                    {{
                      bar.data.requestCount > 0
                        ? Math.round((bar.data.successCount / bar.data.requestCount) * 100)
                        : 0
                    }}%
                  </span>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-dot success" />
          <span>{{
            activeMetric === 'requests'
              ? t('intelligence.usage.success')
              : activeMetric === 'tokens'
                ? t('intelligence.usage.promptTokens')
                : t('intelligence.usage.cost')
          }}</span>
        </div>
        <div v-if="activeMetric !== 'cost'" class="legend-item">
          <span class="legend-dot failure" />
          <span>{{
            activeMetric === 'requests'
              ? t('intelligence.usage.failure')
              : t('intelligence.usage.completionTokens')
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.usage-chart {
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 60px;
    color: var(--el-text-color-secondary);
  }

  .chart-container {
    padding: 8px 0;
  }

  .metric-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;

    button {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: var(--el-fill-color-lighter);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;

      i {
        font-size: 18px;
        color: var(--el-text-color-secondary);
      }

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      .metric-value {
        font-size: 16px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        font-variant-numeric: tabular-nums;
      }

      &:hover {
        background: var(--el-fill-color);
      }

      &.active {
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary-light-5);

        i, span {
          color: var(--el-color-primary);
        }

        .metric-value {
          color: var(--el-color-primary);
        }
      }
    }
  }

  .chart-area {
    display: flex;
    gap: 8px;
    height: 180px;
    margin-bottom: 12px;

    .y-axis {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: 50px;
      padding: 4px 0;
      font-size: 10px;
      color: var(--el-text-color-secondary);
      text-align: right;
    }

    .bars-container {
      flex: 1;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding: 4px 0;
      border-left: 1px solid var(--el-border-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    .bar-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      position: relative;
      cursor: pointer;

      &:hover .bar-stack .bar {
        opacity: 0.8;
      }

      .bar-stack {
        flex: 1;
        width: 100%;
        max-width: 24px;
        display: flex;
        flex-direction: column-reverse;
        gap: 1px;

        .bar {
          width: 100%;
          border-radius: 3px 3px 0 0;
          transition: all 0.3s ease;
          min-height: 2px;

          &.success {
            background: var(--el-color-primary);
          }

          &.failure {
            background: var(--el-color-warning);
          }
        }
      }

      .bar-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 6px;
        font-size: 10px;

        .day {
          color: var(--el-text-color-primary);
          font-weight: 500;
        }

        .weekday {
          color: var(--el-text-color-secondary);
          font-size: 9px;
        }
      }

      .tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: var(--el-bg-color-overlay);
        border: 1px solid var(--el-border-color);
        border-radius: 8px;
        padding: 10px 12px;
        min-width: 140px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 100;

        .tooltip-header {
          font-size: 12px;
          font-weight: 600;
          color: var(--el-text-color-primary);
          margin-bottom: 8px;
          text-align: center;
        }

        .tooltip-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          padding: 3px 0;
          color: var(--el-text-color-regular);

          &.success-rate {
            border-top: 1px solid var(--el-border-color-lighter);
            margin-top: 4px;
            padding-top: 6px;
            font-weight: 500;
          }
        }
      }
    }
  }

  .chart-legend {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 8px;

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--el-text-color-secondary);

      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 2px;

        &.success {
          background: var(--el-color-primary);
        }

        &.failure {
          background: var(--el-color-warning);
        }
      }
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
