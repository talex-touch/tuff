<script lang="ts" setup name="PluginPerfCharts">
import { TxCard } from '@talex-touch/tuffex'
import { computed } from 'vue'
import {
  formatBytesShort,
  formatCompactNumber,
  formatUptimeShort
} from '~/components/plugin/runtime/format'
import PluginSparkline from '~/components/plugin/runtime/PluginSparkline.vue'
import { usePluginRuntimeStats } from '~/composables/usePluginRuntimeStats'

const props = defineProps<{
  pluginName: string
  layout?: 'card' | 'bar'
}>()

const layoutMode = computed(() => props.layout ?? 'card')

const { stats, history, lastUpdatedAt, error } = usePluginRuntimeStats(
  computed(() => props.pluginName),
  { intervalMs: 1000, maxPoints: 90 }
)

const memorySeries = computed(() => history.value.map((p) => p.memoryBytes))
const cpuSeries = computed(() => history.value.map((p) => p.cpuPercent))
const workerSeries = computed(() => history.value.map((p) => p.workerThreads))
const requestRateSeries = computed(() => {
  const points = history.value
  if (points.length === 0) return []
  const rates: number[] = [0]
  for (let i = 1; i < points.length; i += 1) {
    rates.push(Math.max(0, points[i].requestCount - points[i - 1].requestCount))
  }
  return rates
})

const requestRate = computed(() => {
  const values = requestRateSeries.value
  return values.length ? values[values.length - 1] : 0
})

const uptimeLabel = computed(() => {
  const v = stats.value?.uptimeMs
  if (typeof v !== 'number') return '--'
  return formatUptimeShort(v)
})

const lastUpdatedAgeLabel = computed(() => {
  const updatedAt = lastUpdatedAt.value
  if (!updatedAt) return '--'
  const diff = Math.max(0, Date.now() - updatedAt)
  if (diff < 1000) return `${diff}ms`
  return `${Math.round(diff / 1000)}s`
})
</script>

<template>
  <div class="PluginPerfCharts" :class="[`layout-${layoutMode}`]">
    <template v-if="layoutMode === 'card'">
      <TxCard
        class="perf-card"
        variant="solid"
        background="blur"
        shadow="none"
        :radius="12"
        :padding="12"
      >
        <div class="header">
          <div class="title">
            <i class="i-ri-pulse-line" />
            <span class="text">性能趋势</span>
            <span class="hint">Up {{ uptimeLabel }}</span>
          </div>
          <div class="meta">
            <span v-if="error" class="error">Runtime Error · {{ error }}</span>
            <span v-else class="muted">Updated {{ lastUpdatedAgeLabel }} ago</span>
          </div>
        </div>
        <div class="grid">
          <div class="metric">
            <div class="metric-top">
              <div class="metric-label">REQ/s</div>
              <PluginSparkline
                class="metric-chart"
                :values="requestRateSeries"
                stroke="var(--el-color-primary)"
              />
            </div>
            <div class="metric-value">
              {{ formatCompactNumber(requestRate) }}
            </div>
            <div class="metric-sub">Total {{ formatCompactNumber(stats?.requestCount ?? 0) }}</div>
          </div>
          <div class="metric">
            <div class="metric-top">
              <div class="metric-label">MEM</div>
              <PluginSparkline
                class="metric-chart"
                :values="memorySeries"
                stroke="var(--el-color-info)"
              />
            </div>
            <div class="metric-value">
              {{ stats ? formatBytesShort(stats.usage.memoryBytes) : '--' }}
            </div>
            <div class="metric-sub">
              UI {{ stats?.workers.uiProcessCount ?? '--' }} · Views
              {{ stats?.workers.cachedViewCount ?? '--' }}
            </div>
          </div>
          <div class="metric">
            <div class="metric-top">
              <div class="metric-label">CPU</div>
              <PluginSparkline
                class="metric-chart"
                :values="cpuSeries"
                stroke="var(--el-color-warning)"
              />
            </div>
            <div class="metric-value">
              {{ stats ? `${stats.usage.cpuPercent.toFixed(1)}%` : '--' }}
            </div>
            <div class="metric-sub">
              Last Active
              {{ stats?.lastActiveAt ? new Date(stats.lastActiveAt).toLocaleTimeString() : '--' }}
            </div>
          </div>
          <div class="metric">
            <div class="metric-top">
              <div class="metric-label">WORKERS</div>
              <PluginSparkline
                class="metric-chart"
                :values="workerSeries"
                stroke="var(--el-color-success)"
              />
            </div>
            <div class="metric-value">
              {{ stats?.workers.threadCount ?? '--' }}
            </div>
            <div class="metric-sub">
              Windows {{ stats?.workers.windowCount ?? '--' }} · DivisionBox
              {{ stats?.workers.divisionBoxViewCount ?? '--' }}
            </div>
          </div>
        </div>
      </TxCard>
    </template>

    <template v-else-if="layoutMode === 'bar'">
      <div class="metric-bar">
        <div class="metric-item">
          <span class="label">REQ/S</span>
          <span class="value">{{ formatCompactNumber(requestRate) }}</span>
          <span class="sub">/ {{ formatCompactNumber(stats?.requestCount ?? 0) }}</span>
        </div>
        <div class="metric-item">
          <span class="label">MEM</span>
          <span class="value">{{ stats ? formatBytesShort(stats.usage.memoryBytes) : '--' }}</span>
        </div>
        <div class="metric-item">
          <span class="label">CPU</span>
          <span class="value">{{ stats ? `${stats.usage.cpuPercent.toFixed(1)}%` : '--' }}</span>
          <span class="sub">avg</span>
        </div>
        <div class="metric-item">
          <span class="label">WORKERS</span>
          <span class="value">{{ stats?.workers.threadCount ?? '--' }}</span>
          <span class="sub">Active</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.PluginPerfCharts {
  width: 100%;
}

.perf-card {
  width: 100%;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;

  i {
    font-size: 16px;
    color: var(--el-text-color-secondary);
    opacity: 0.9;
  }

  .text {
    font-size: 12px;
    font-weight: 700;
    color: var(--el-text-color-primary);
  }

  .hint {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    opacity: 0.85;
    white-space: nowrap;
  }
}

.meta {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  opacity: 0.8;

  .error {
    color: var(--el-color-danger);
    opacity: 0.9;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.metric {
  border: 1px solid rgba(var(--el-border-color-rgb), 0.35);
  background: rgba(var(--el-fill-color-rgb), 0.35);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.metric-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
  opacity: 0.9;
}

.metric-chart {
  width: 120px;
  height: 34px;
  opacity: 0.9;
  flex-shrink: 0;
}

.metric-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--el-text-color-primary);
  line-height: 1.1;
}

.metric-sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-bar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  color: #e2e8f0;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.metric-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.metric-item .label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.metric-item .value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
}

.metric-item .sub {
  font-size: 0.7rem;
  color: #64748b;
}
</style>
