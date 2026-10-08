<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import { computed } from 'vue'
import TxButton from '../../button'
import { useMetricContext } from './context'
import MetricGauge from './MetricGauge.vue'
import MetricPlot from './MetricPlot.vue'
import MetricReadouts from './MetricReadouts.vue'
import MetricValue from './MetricValue.vue'
defineProps<{ kind: string }>()
const ctx = useMetricContext()
const data = ctx.data
const timer = computed(() => {
  if (data.value.remaining === undefined) return '—'
  const value = Math.max(0, Math.floor(data.value.remaining))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
})
</script>
<template>
  <div v-if="kind === 'mono-revenue'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" /><MetricPlot :series="data.series" mode="area" monochrome :height="100" />
</div>
  <div v-else-if="kind === 'mono-credit'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.max ?? data.target" :min="data.min" mode="ring" :label="data.status" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'mono-wallet'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" /><MetricReadouts :items="data.metrics" /><p>{{ data.description }}</p>
</div>
  <div v-else-if="kind === 'mono-savings'" class="tx-mm-stack">
<MetricValue :value="data.value" :target="data.target" :unit="data.unit" /><progress :value="data.value" :max="data.target ?? 100" :aria-label="data.title" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'mono-activity-ring'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.target" :items="data.metrics" mode="rings" :unit="data.unit" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'mono-users'" class="tx-mm-stack">
<MetricValue :value="data.value" :previous="data.previous" :unit="data.unit" /><div class="tx-mm-regions">
<span v-for="item in data.metrics" :key="item.id">{{ item.label }} {{ ctx.format(item.value, item.unit) }}</span>
</div>
</div>
  <div v-else-if="kind === 'mono-kfactor'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.target" mode="ring" :unit="data.unit" /><p>{{ data.description }}</p>
</div>
  <div v-else-if="kind === 'mono-latency'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" /><MetricReadouts :items="data.metrics" compact /><MetricPlot :series="data.series" mode="line" monochrome :height="90" />
</div>
  <div v-else-if="kind === 'mono-bandwidth'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.target" mode="arc" :unit="data.unit" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'mono-server'" class="tx-mm-stack">
<div class="tx-mm-columns">
<MetricGauge v-for="item in data.metrics" :key="item.id" :value="typeof item.value === 'number' ? item.value : undefined" :target="item.target" :label="item.label" :unit="item.unit" mode="ring" />
</div><MetricReadouts v-for="group in data.groups" :key="group.id" :items="group.metrics" compact />
</div>
  <div v-else-if="kind === 'mono-progress'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.target" mode="ring" :unit="data.unit" /><ol class="tx-mm-build-steps">
<li v-for="step in data.steps" :key="step.id">
{{ step.label }} <span>{{ step.status }}</span>
</li>
</ol>
</div>
  <div v-else-if="kind === 'mono-radar'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.target" mode="arc" :label="data.status" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'mono-timer-arc'" class="tx-mm-stack">
<MetricGauge :value="data.total !== undefined && data.remaining !== undefined ? data.total - data.remaining : undefined" :target="data.total" mode="ring" :label="timer" /><MetricValue :value="timer" /><TxButton :disabled="ctx.disabled.value" @click="ctx.setRunning(!ctx.running.value)">
{{ ctx.running.value ? ctx.labels.value.pause : ctx.labels.value.start }}
</TxButton>
</div>
  <div v-else-if="kind === 'mono-timer-ring'" class="tx-mm-stack">
<MetricGauge :value="data.value" :target="data.target" :items="data.metrics" mode="rings" :unit="data.unit" /><MetricReadouts :items="data.metrics" compact />
</div>
</template>
