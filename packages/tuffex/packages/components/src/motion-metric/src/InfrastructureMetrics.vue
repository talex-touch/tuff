<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import { computed, useId } from 'vue'
import TxButton from '../../button'
import TxSlider from '../../slider/src/TxSlider.vue'
import { toneColor, useMetricContext } from './context'
import MetricMatrix from './MetricMatrix.vue'
import MetricPlot from './MetricPlot.vue'
import MetricReadouts from './MetricReadouts.vue'
import MetricSegments from './MetricSegments.vue'
import MetricValue from './MetricValue.vue'
defineProps<{ kind: string }>()
const ctx = useMetricContext()
const data = ctx.data
const labels = ctx.labels
const bandwidth = computed(() => data.value.groups?.find(group => group.id === 'bandwidth'))
const breakdown = computed(() => bandwidth.value?.metrics ?? data.value.metrics ?? [])
const total = computed(() => data.value.target ?? breakdown.value.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0))
const patternId = `bandwidth-pattern-${useId()}`
</script>
<template>
  <div v-if="kind === 'cacheable-bandwidth-cost' || kind === 'cache-stats-card'" class="tx-mm-stack">
    <MetricReadouts v-if="kind === 'cache-stats-card'" :items="data.metrics" />
    <MetricValue :value="data.value ?? bandwidth?.value" :unit="data.unit ?? bandwidth?.unit" :target="data.target" />
    <div class="tx-mm-allocation" role="img" :aria-label="breakdown.map(item => `${item.label}: ${ctx.format(item.value, item.unit)}`).join(', ')">
      <span v-for="(item, i) in breakdown" :key="item.id" :style="{ flex: typeof item.value === 'number' ? Math.max(0, item.value) : 0, background: toneColor(item.tone, i) }" :title="`${item.label}: ${ctx.format(item.value, item.unit)}`" />
      <span v-if="total > breakdown.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0)" class="tx-mm-allocation__remaining" :style="{ flex: total - breakdown.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0) }"><svg aria-hidden="true"><defs><pattern :id="patternId" width="6" height="6" patternUnits="userSpaceOnUse"><line x1="1" y1="0" x2="1" y2="6" stroke="currentColor" stroke-width="2" /></pattern></defs><rect width="100%" height="100%" :fill="`url(#${patternId})`" /></svg></span>
    </div>
    <MetricReadouts :items="breakdown" compact />
  </div>
  <div v-else-if="kind === 'network-telemetry-matrix' || kind === 'network-telemetry'" class="tx-mm-stack">
    <div class="tx-mm-actions">
<TxButton size="sm" :disabled="ctx.disabled.value" @click="ctx.action('share')">
{{ labels.share }}
</TxButton><TxButton size="sm" :disabled="ctx.disabled.value" @click="ctx.action('more')">
{{ labels.more }}
</TxButton>
</div>
    <MetricReadouts :items="data.metrics" />
    <section v-for="group in data.groups" :key="group.id" class="tx-mm-section">
<div class="tx-mm-section__heading">
<h3>{{ group.label }}</h3><span>{{ ctx.format(group.value, group.unit) }}</span>
</div><MetricMatrix :cells="group.cells" :columns="group.columns ?? 32" />
</section>
  </div>
  <div v-else-if="kind === 'progress-indicator-piano' || kind === 'progress-indicator'" class="tx-mm-stack">
    <MetricValue :value="ctx.value.value" :target="data.target" :unit="data.unit" :previous="data.previous" />
    <MetricSegments :value="ctx.value.value" :target="data.target" :count="kind === 'progress-indicator' ? 36 : 28" />
    <TxSlider :model-value="ctx.value.value ?? data.min ?? 0" :min="data.min ?? 0" :max="data.target ?? 100" :aria-label="labels.current" :disabled="ctx.disabled.value" :thumb-surface="false" @update:model-value="ctx.setValue" />
  </div>
  <div v-else-if="kind === 'server-performance-step-bars' || kind === 'server-performance'" class="tx-mm-stack">
    <MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><MetricPlot :series="data.series" mode="step" />
  </div>
  <div v-else-if="kind === 'budget'" class="tx-mm-stack">
    <div class="tx-mm-section__heading">
<span>{{ labels.current }} {{ ctx.format(data.value, data.unit) }}</span><span>{{ labels.target }} {{ ctx.format(data.target, data.unit) }}</span>
</div>
    <MetricSegments :value="data.value" :target="data.target" :count="64" :rows="3" mode="budget" />
    <TxButton :disabled="ctx.disabled.value" @click="ctx.action('details')">
{{ labels.details }}
</TxButton>
  </div>
  <div v-else-if="kind === 'growth'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><MetricPlot :series="data.series" mode="pixel" :height="220" />
</div>
  <div v-else-if="kind === 'prompts-card'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" :previous="data.previous" /><MetricSegments :value="data.value" :target="data.target" :count="30" mode="quota" />
</div>
  <div v-else-if="kind === 'real-time-alerts'" class="tx-mm-stack">
    <MetricValue :value="data.value" :unit="data.unit" :target="data.target" />
    <label class="tx-mm-field">{{ labels.threshold }} {{ ctx.format(ctx.value.value ?? data.threshold, data.unit) }}<TxSlider :model-value="ctx.value.value ?? data.threshold ?? 0" :max="data.target ?? 100" :aria-label="labels.threshold" :disabled="ctx.disabled.value" :thumb-surface="false" @update:model-value="ctx.setValue" /></label>
    <MetricPlot :series="data.series" mode="striped" :threshold="ctx.value.value ?? data.threshold" />
    <MetricReadouts :items="data.metrics" compact />
  </div>
  <div v-else-if="kind === 'system-metrics-card'" class="tx-mm-stack">
    <div class="tx-mm-columns">
<section v-for="group in data.groups" :key="group.id" class="tx-mm-section">
<h3>{{ group.label }}</h3><MetricValue :value="group.value" :unit="group.unit" /><MetricReadouts :items="group.metrics" compact /><MetricPlot :series="group.series" mode="line" :threshold="data.threshold" :height="100" />
</section>
</div>
    <section class="tx-mm-section">
<MetricReadouts :items="data.metrics" compact /><div v-for="item in data.metrics" :key="item.id" class="tx-mm-error-line">
<span>{{ item.label }}</span><progress v-if="typeof item.value === 'number'" :value="item.value" :max="item.target ?? 100" :aria-label="item.label" />
</div>
</section>
    <TxButton :disabled="ctx.disabled.value" @click="ctx.action('details')">
{{ labels.details }}
</TxButton>
  </div>
</template>
