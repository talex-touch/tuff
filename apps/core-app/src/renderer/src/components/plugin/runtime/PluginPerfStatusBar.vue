<script lang="ts" setup name="PluginPerfStatusBar">
import type { StatusTone } from '@talex-touch/tuffex'
import { TxStatusBadge } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { usePluginRuntimeStats } from '~/composables/usePluginRuntimeStats'
import { formatBytesShort } from '~/components/plugin/runtime/format'

const props = defineProps<{
  pluginName: string
}>()

type Trend = 'up' | 'down' | 'flat'

function calcTrend(values: number[], deadband = 0): { trend: Trend, delta: number } {
  if (!values || values.length < 2)
    return { trend: 'flat', delta: 0 }
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  const delta = last - prev
  if (!Number.isFinite(delta))
    return { trend: 'flat', delta: 0 }
  if (Math.abs(delta) <= deadband)
    return { trend: 'flat', delta }
  return { trend: delta > 0 ? 'up' : 'down', delta }
}

function trendIcon(trend: Trend): string {
  if (trend === 'up')
    return 'i-ri-arrow-up-line'
  if (trend === 'down')
    return 'i-ri-arrow-down-line'
  return 'i-ri-arrow-right-line'
}

function toneWeight(tone: StatusTone): number {
  if (tone === 'danger')
    return 3
  if (tone === 'warning')
    return 2
  if (tone === 'success')
    return 1
  return 0
}

function worstTone(tones: StatusTone[]): StatusTone {
  let worst: StatusTone = 'muted'
  for (const tone of tones) {
    if (toneWeight(tone) > toneWeight(worst))
      worst = tone
  }
  return worst
}

function toneForMemory(bytes: number): StatusTone {
  const mb = bytes / 1024 / 1024
  if (!Number.isFinite(mb) || mb <= 0)
    return 'muted'
  if (mb >= 512)
    return 'danger'
  if (mb >= 256)
    return 'warning'
  return 'success'
}

function toneForCpu(cpuPercent: number): StatusTone {
  if (!Number.isFinite(cpuPercent) || cpuPercent < 0)
    return 'muted'
  if (cpuPercent >= 60)
    return 'danger'
  if (cpuPercent >= 30)
    return 'warning'
  return 'success'
}

const { stats, history, lastUpdatedAt, error } = usePluginRuntimeStats(
  computed(() => props.pluginName),
  { intervalMs: 1000, maxPoints: 60 },
)

const memorySeries = computed(() => history.value.map(p => p.memoryBytes))
const cpuSeries = computed(() => history.value.map(p => p.cpuPercent))

const memoryLabel = computed(() => {
  const v = stats.value?.usage.memoryBytes
  if (typeof v !== 'number')
    return '--'
  return formatBytesShort(v)
})

const cpuLabel = computed(() => {
  const v = stats.value?.usage.cpuPercent
  if (typeof v !== 'number')
    return '--'
  return `${v.toFixed(1)}%`
})

const lastUpdatedAgeLabel = computed(() => {
  const updatedAt = lastUpdatedAt.value
  if (!updatedAt)
    return '--'
  const diff = Math.max(0, Date.now() - updatedAt)
  if (diff < 1000)
    return `${diff}ms`
  return `${Math.round(diff / 1000)}s`
})

const isStale = computed(() => {
  const updatedAt = lastUpdatedAt.value
  if (!updatedAt)
    return true
  return Date.now() - updatedAt > 3500
})

const memTrend = computed(() => calcTrend(memorySeries.value, 1024 * 1024 * 4))
const cpuTrend = computed(() => calcTrend(cpuSeries.value, 0.15))

const memTone = computed(() => toneForMemory(stats.value?.usage.memoryBytes ?? 0))
const cpuTone = computed(() => toneForCpu(stats.value?.usage.cpuPercent ?? 0))

const health = computed(() => {
  if (error.value) {
    return {
      tone: 'danger' as const,
      text: 'RUNTIME ERROR',
      icon: 'i-ri-wifi-off-line',
    }
  }

  if (!stats.value || isStale.value) {
    return {
      tone: 'muted' as const,
      text: 'NO DATA',
      icon: 'i-ri-question-line',
    }
  }

  const tone = worstTone([memTone.value, cpuTone.value])
  if (tone === 'muted') {
    return { tone, text: 'UNKNOWN', icon: 'i-ri-question-line' }
  }
  if (tone === 'danger') {
    return { tone, text: 'HIGH', icon: 'i-ri-fire-line' }
  }
  if (tone === 'warning') {
    return { tone, text: 'ELEVATED', icon: 'i-ri-alarm-warning-line' }
  }
  return { tone: 'success' as const, text: 'OK', icon: 'i-ri-shield-check-line' }
})
</script>

<template>
  <div class="PluginPerfStatusBar" :class="{ stale: isStale, error: !!error }">
    <div class="left">
      <i class="i-ri-pulse-line" />
      <div class="left-title">
        <span class="title">性能</span>
        <span v-if="error" class="error-text">· {{ error }}</span>
        <span v-else class="hint">Updated {{ lastUpdatedAgeLabel }} ago</span>
      </div>
    </div>

    <div class="metrics">
      <div class="metric" :class="`tone-${memTone}`">
        <span class="label">MEM</span>
        <span class="value">{{ memoryLabel }}</span>
        <i :class="trendIcon(memTrend.trend)" class="trend" />
      </div>

      <div class="metric" :class="`tone-${cpuTone}`">
        <span class="label">CPU</span>
        <span class="value">{{ cpuLabel }}</span>
        <i :class="trendIcon(cpuTrend.trend)" class="trend" />
      </div>
    </div>

    <div class="right">
      <TxStatusBadge :text="health.text" :status="health.tone" :icon="health.icon" size="sm" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.PluginPerfStatusBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-top: 1px solid rgba(var(--el-border-color-rgb), 0.55);
  background: color-mix(in srgb, var(--el-bg-color) 76%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  user-select: none;
  z-index: 10;

  &.stale {
    background: color-mix(in srgb, var(--el-bg-color) 70%, transparent);
  }

  &.error {
    border-top-color: color-mix(in srgb, var(--el-color-danger) 48%, transparent);
  }
}

.left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;

  i {
    font-size: 18px;
    color: var(--el-text-color-secondary);
    opacity: 0.9;
  }
}

.left-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;

  .title {
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

.error-text {
  color: var(--el-color-danger);
  opacity: 0.85;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metrics {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.metric {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(var(--el-border-color-rgb), 0.35);
  background: rgba(var(--el-fill-color-rgb), 0.35);
  border-radius: 12px;
  padding: 8px 10px;
  min-width: 110px;

  .label {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--el-text-color-secondary);
    opacity: 0.9;
  }

  .trend {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    opacity: 0.75;
  }

  .value {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    line-height: 1;
    white-space: nowrap;
  }
}

.metric.tone-success {
  border-color: color-mix(in srgb, var(--el-color-success) 30%, transparent);
}

.metric.tone-warning {
  border-color: color-mix(in srgb, var(--el-color-warning) 34%, transparent);
}

.metric.tone-danger {
  border-color: color-mix(in srgb, var(--el-color-danger) 36%, transparent);
}

.metric.tone-info {
  border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}

.right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 96px;
}

</style>
