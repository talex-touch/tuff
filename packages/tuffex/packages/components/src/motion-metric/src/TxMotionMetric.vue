<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import type { MotionMetricData, MotionMetricEmits, MotionMetricProps } from './types'
import { computed, provide, ref, useId, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import AudienceMetrics from './AudienceMetrics.vue'
import { catalogKinds, metricContextKey } from './context'
import FinanceMetrics from './FinanceMetrics.vue'
import InfrastructureMetrics from './InfrastructureMetrics.vue'
import MonoMetrics from './MonoMetrics.vue'
import PersonalMetrics from './PersonalMetrics.vue'
import { MOTION_METRIC_DEFAULT_LABELS } from './types'
defineOptions({ name: 'TxMotionMetric' })
const props = withDefaults(defineProps<MotionMetricProps>(), { variant: 'm-progress-piano', animated: true, disabled: false, size: 'md' })
const emit = defineEmits<MotionMetricEmits>()
defineSlots<{
  header?: (props: { data: MotionMetricData }) => unknown
  avatar?: () => unknown
  preview?: (props: { data: MotionMetricData }) => unknown
  footer?: (props: { data: MotionMetricData }) => unknown
}>()
const root = ref<HTMLElement | null>(null)
const { active } = useMotionActivity(root, () => props.animated)
const headingId = useId()
const localPeriod = ref<string>()
const localIndex = ref(0)
const localValue = ref<number>()
const localRange = ref<[number, number]>()
const localRunning = ref(false)
const localMessage = ref('')
const labels = computed(() => ({ ...MOTION_METRIC_DEFAULT_LABELS, ...props.labels }))
const kind = computed(() => props.variant === 'animated-metric-card' ? props.interaction ?? 'progress-indicator-piano' : catalogKinds[props.variant] ?? props.variant)
const period = computed(() => props.period ?? localPeriod.value ?? props.periods?.[0]?.value ?? '')
const data = computed<MotionMetricData>(() => {
  const selected = props.periods?.find(option => option.value === period.value)?.data
  const merged = { ...props.data, ...selected }
  return { ...merged, value: kind.value === 'real-time-alerts' ? merged.value : props.modelValue ?? localValue.value ?? merged.value, threshold: kind.value === 'real-time-alerts' ? props.modelValue ?? localValue.value ?? merged.threshold : merged.threshold, series: props.series ?? merged.series, metrics: props.metrics ?? merged.metrics, status: props.status ?? merged.status }
})
const index = computed(() => props.activeIndex ?? localIndex.value)
const value = computed(() => props.modelValue ?? localValue.value ?? (kind.value === 'real-time-alerts' ? data.value.threshold : data.value.value))
const range = computed<[number, number]>(() => props.range ?? localRange.value ?? [data.value.min ?? 30, data.value.max ?? 120])
const running = computed(() => props.running ?? localRunning.value)
const message = computed(() => props.message ?? localMessage.value)
const disabled = computed(() => props.disabled)
const selectFilter = computed(() => props.filterStyle === 'select' || (props.filterStyle === undefined && ['credit-score-barcode-meter', 'finance-dashboard', 'marketing-cards', 'overview-chart', 'growth-calendar'].includes(kind.value)))
const hasData = computed(() => data.value.value !== undefined || !!(data.value.metrics?.length || data.value.series?.length || data.value.groups?.length || data.value.cells?.length || data.value.steps?.length || data.value.profiles?.length || data.value.messages?.length || data.value.remaining !== undefined))
const infrastructure = new Set(['cacheable-bandwidth-cost', 'cache-stats-card', 'network-telemetry-matrix', 'network-telemetry', 'progress-indicator-piano', 'progress-indicator', 'server-performance-step-bars', 'server-performance', 'budget', 'growth', 'prompts-card', 'real-time-alerts', 'system-metrics-card'])
const finance = new Set(['overview-bar-scrubber-card', 'overview-chart', 'sales-analytics-dual-bars', 'sales-target-segmented-arc', 'sales-overview-radial-dashboard', 'sales-overview', 'credit-score-barcode-meter', 'stock-chart-card', 'mono-stock', 'sales-dashboard', 'credit-score-cards', 'finance-dashboard', 'savings-cards'])
const audience = new Set(['users-growth-pill-progress', 'growth-calendar', 'mono-heatmap', 'views-hourly-wave-chart', 'user-metrics', 'users-chart-card', 'visitors-chart-card', 'marketing-cards'])
const family = computed(() => infrastructure.has(kind.value) ? InfrastructureMetrics : finance.has(kind.value) ? FinanceMetrics : audience.has(kind.value) ? AudienceMetrics : kind.value.startsWith('mono-') ? MonoMetrics : PersonalMetrics)
function format(value: number | string | undefined, unit?: string): string {
  if (value === undefined) return '—'
  if (props.formatValue) return props.formatValue(value, unit)
  return `${typeof value === 'number' ? String(Number(value.toFixed(2))) : value}${unit ? ` ${unit}` : ''}`
}
function choosePeriod(value: string): void {
  if (props.disabled) return
  localPeriod.value = value
  emit('update:period', value)
}
watch([period, kind], () => { localIndex.value = 0; localValue.value = undefined; localRange.value = undefined })
provide(metricContextKey, {
  data, labels, active, disabled, index, value, range, running, message, format,
  select(index, id = '') { if (!props.disabled) { localIndex.value = index; emit('update:activeIndex', index); emit('select', { id, index }) } },
  setValue(value) { if (!props.disabled) { localValue.value = value; emit('update:modelValue', value) } },
  setRange(value) { if (!props.disabled) { localRange.value = value; emit('update:range', value) } },
  setRunning(value) { if (!props.disabled) { localRunning.value = value; emit('update:running', value) } },
  setMessage(value) { if (!props.disabled) { localMessage.value = value; emit('update:message', value) } },
  action(value) { if (!props.disabled) emit('action', value) },
  filterGroup(groupId, period) { if (!props.disabled) emit('filter', { groupId, period }) },
  send() { if (!props.disabled && message.value.trim()) emit('send', message.value.trim()) },
})
</script>
<template>
  <article ref="root" class="tx-motion-metric" :class="[`tx-motion-metric--${size}`, { 'is-active': active, 'is-disabled': disabled, 'is-monochrome': kind.startsWith('mono-') }]" :data-variant="variant" :data-interaction="kind" :aria-labelledby="$slots.header ? undefined : headingId" :aria-label="$slots.header ? data.title ?? variant : undefined">
    <header class="tx-mm-header">
<slot name="header" :data="data">
<div>
<h2 :id="headingId">
{{ data.title ?? variant }}
</h2><p v-if="data.description && kind !== 'feedback-card'">
{{ data.description }}
</p>
</div>
</slot><slot name="avatar" />
</header>
    <div v-if="periods?.length" class="tx-mm-filters">
      <select v-if="selectFilter" :value="period" :aria-label="labels.period" :disabled="disabled" @change="choosePeriod(($event.target as HTMLSelectElement).value)">
<option v-for="option in periods" :key="option.value" :value="option.value">
{{ option.label }}
</option>
</select>
      <div v-else role="group" :aria-label="labels.period" class="tx-mm-periods">
<button v-for="option in periods" :key="option.value" type="button" :aria-pressed="option.value === period" :disabled="disabled" @click="choosePeriod(option.value)">
{{ option.label }}
</button>
</div>
    </div>
    <div v-if="data.status" class="tx-mm-status-label" role="status">
{{ data.status }}
</div>
    <component :is="family" v-if="hasData" :kind="kind">
<template v-if="$slots.preview" #preview>
<slot name="preview" :data="data" />
</template>
</component>
    <p v-else class="tx-mm-empty">
{{ labels.empty }}
</p>
    <footer v-if="$slots.footer">
<slot name="footer" :data="data" />
</footer>
  </article>
</template>
<style lang="scss">
@use './style';
</style>
