<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import { computed } from 'vue'
import TxButton from '../../button'
import { ratio, toneColor, useMetricContext } from './context'
import MetricMatrix from './MetricMatrix.vue'
import MetricPlot from './MetricPlot.vue'
import MetricReadouts from './MetricReadouts.vue'
import MetricValue from './MetricValue.vue'
defineProps<{ kind: string }>()
const ctx = useMetricContext()
const data = ctx.data
const labels = ctx.labels
const pills = computed(() => data.value.series?.[0]?.points ?? [])
const maximum = computed(() => data.value.target ?? Math.max(1, ...pills.value.map(point => point.value)))
const channels = computed(() => data.value.groups?.find(group => group.id === 'channels'))
</script>
<template>
  <div v-if="kind === 'users-growth-pill-progress' || kind === 'growth-calendar'" class="tx-mm-columns">
    <section class="tx-mm-stack">
<div class="tx-mm-profile">
<span aria-hidden="true">☆</span><span v-if="data.profiles?.[0]" class="tx-mm-avatar" :title="data.profiles[0].name">{{ data.profiles[0].initials ?? data.profiles[0].name.slice(0, 2) }}</span>
</div><MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><div class="tx-mm-pill-bars">
<button v-for="(point, i) in pills" :key="`${point.label}-${i}`" type="button" :aria-label="`${point.label}: ${ctx.format(point.value)}`" :aria-pressed="ctx.index.value === i" :disabled="ctx.disabled.value" @click="ctx.select(i)">
<span :style="{ width: `${ratio(point.value, maximum) * 100}%` }" /><strong>{{ point.label }} <small>{{ ctx.format(point.value) }}</small></strong>
</button>
</div>
</section>
    <section v-if="kind === 'growth-calendar'" class="tx-mm-section">
<h3>{{ data.groups?.[0]?.label }}</h3><div v-if="data.weekdays" class="tx-mm-calendar-weekdays">
<span v-for="(weekday, i) in data.weekdays" :key="i">{{ weekday }}</span>
</div><MetricMatrix :cells="data.cells ?? data.groups?.[0]?.cells" :columns="7" calendar />
</section>
  </div>
  <div v-else-if="kind === 'mono-heatmap'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" /><MetricMatrix :cells="data.cells" :columns="data.columns ?? 7" monochrome /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'views-hourly-wave-chart'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><MetricPlot :series="data.series" average :height="180" />
</div>
  <div v-else-if="kind === 'user-metrics'" class="tx-mm-stack">
<MetricReadouts :items="data.metrics" /><section v-for="group in data.groups" :key="group.id" class="tx-mm-section">
<h3>{{ group.label }}</h3><MetricValue :value="group.value" :unit="group.unit" /><MetricPlot :series="group.series" average :height="190" />
</section>
</div>
  <div v-else-if="kind === 'users-chart-card'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><MetricPlot :series="data.series" :height="140" /><MetricReadouts :items="data.metrics" compact /><TxButton :disabled="ctx.disabled.value" @click="ctx.action('details')">
{{ labels.details }}
</TxButton>
</div>
  <div v-else-if="kind === 'visitors-chart-card'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><MetricPlot :series="data.series" mode="line" :height="220" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'marketing-cards'" class="tx-mm-stack">
    <section v-if="channels" class="tx-mm-section">
<h3>{{ channels.label }}</h3><MetricValue :value="channels.value" :unit="channels.unit" /><div class="tx-mm-allocation tx-mm-allocation--tall">
<span v-for="(item, i) in channels.metrics" :key="item.id" :style="{ flex: typeof item.value === 'number' ? Math.max(0, item.value) : 0, background: toneColor(item.tone, i) }" :title="`${item.label}: ${ctx.format(item.value, item.unit)}`" />
</div><MetricReadouts :items="channels.metrics" compact />
</section>
    <section v-for="group in data.groups?.filter(item => item.id !== 'channels')" :key="group.id" class="tx-mm-section">
<div class="tx-mm-section__heading">
<h3>{{ group.label }}</h3><TxButton size="sm" :disabled="ctx.disabled.value" @click="ctx.action('details')">
{{ labels.details }}
</TxButton>
</div><MetricValue :value="group.value" :unit="group.unit" /><div class="tx-mm-campaign">
<MetricPlot :series="group.series" :height="140" /><MetricReadouts :items="group.metrics" compact />
</div>
</section>
  </div>
</template>
