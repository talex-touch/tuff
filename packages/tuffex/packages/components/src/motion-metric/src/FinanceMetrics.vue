<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import TxButton from '../../button'
import { toneColor, useMetricContext } from './context'
import MetricGauge from './MetricGauge.vue'
import MetricGroup from './MetricGroup.vue'
import MetricPlot from './MetricPlot.vue'
import MetricReadouts from './MetricReadouts.vue'
import MetricSegments from './MetricSegments.vue'
import MetricValue from './MetricValue.vue'
defineProps<{ kind: string }>()
const ctx = useMetricContext()
const data = ctx.data
const labels = ctx.labels
const asset = ref('')
const assets = computed(() => data.value.groups?.find(group => group.id === 'assets'))
const selectedAssets = computed(() => (assets.value?.metrics ?? []).filter(item => !asset.value || item.id === asset.value))
const stock = computed(() => data.value.series?.[0]?.points ?? [])
const stockEnd = computed(() => data.value.value ?? stock.value[stock.value.length - 1]?.value)
const stockStart = computed(() => data.value.previous ?? stock.value[0]?.value)
</script>
<template>
  <div v-if="kind === 'overview-bar-scrubber-card' || kind === 'overview-chart'" class="tx-mm-stack">
<MetricValue :value="data.value" :target="data.target" :unit="data.unit" :previous="data.previous" /><MetricPlot :series="data.series" mode="striped" :height="180" />
</div>
  <div v-else-if="kind === 'sales-analytics-dual-bars'" class="tx-mm-stack">
<MetricValue :value="data.value" :target="data.target" :unit="data.unit" /><MetricPlot :series="data.series" mode="dual" />
</div>
  <div v-else-if="kind === 'sales-target-segmented-arc'" class="tx-mm-stack">
<MetricReadouts :items="data.metrics" compact /><MetricGauge :value="data.value" :target="data.target" :items="data.metrics" :unit="data.unit" :label="data.status" />
</div>
  <div v-else-if="kind === 'sales-overview-radial-dashboard' || kind === 'sales-overview'" class="tx-mm-stack">
<div v-if="data.rank" class="tx-mm-rank">
☆ {{ data.rank }}
</div><MetricGauge :value="data.value" :target="data.target" :count="kind === 'sales-overview' ? 12 : 14" :unit="data.unit" :label="data.status" /><MetricReadouts :items="data.metrics" /><TxButton :disabled="ctx.disabled.value" @click="ctx.action('more')">
{{ labels.more }}
</TxButton>
</div>
  <div v-else-if="kind === 'credit-score-barcode-meter'" class="tx-mm-stack">
<MetricValue :value="data.value" :target="data.max ?? data.target" :previous="data.previous" /><MetricSegments :value="data.value" :target="data.max ?? data.target" :min="data.min" :count="42" mode="barcode" /><MetricReadouts :items="data.metrics" compact />
</div>
  <div v-else-if="kind === 'stock-chart-card' || kind === 'mono-stock'" class="tx-mm-stack">
<MetricValue :value="stockEnd" :unit="data.unit" :previous="stockStart" /><MetricPlot :series="data.series" :monochrome="kind === 'mono-stock'" :height="200" />
</div>
  <div v-else-if="kind === 'sales-dashboard'" class="tx-mm-stack">
    <MetricReadouts :items="data.metrics" />
    <div class="tx-mm-columns">
<MetricGroup v-for="original in data.groups" :key="original.id" :group="original">
<template #default="{ group }">
<h3>{{ group.label }}</h3><MetricValue :value="group.value" :target="group.target" :unit="group.unit" /><template v-if="group.id === 'target'">
<MetricReadouts :items="group.metrics" compact /><MetricGauge :value="group.value" :target="group.target ?? data.target" :items="group.metrics" :unit="group.unit" />
</template><MetricPlot v-else :series="group.series" mode="dual" :height="200" />
</template>
</MetricGroup>
</div>
  </div>
  <div v-else-if="kind === 'credit-score-cards'" class="tx-mm-columns">
    <section class="tx-mm-section">
<MetricGauge :value="data.value" :target="data.max ?? 850" :min="data.min ?? 300" mode="arc" :label="data.status" /><MetricValue :value="data.value" :previous="data.previous" />
</section>
    <MetricGroup v-for="original in data.groups" :key="original.id" :group="original">
<template #default="{ group }">
<h3>{{ group.label }}</h3><MetricReadouts v-if="group.id === 'report'" :items="group.metrics" compact /><template v-else-if="group.id === 'utilization'">
<MetricValue :value="group.value" :target="group.metrics?.[0]?.target" :unit="group.unit" /><progress :value="group.value" :max="group.metrics?.[0]?.target ?? 100" :aria-label="group.label" /><MetricReadouts :items="group.metrics" compact />
</template><MetricPlot v-else :series="group.series" mode="line" :height="140" />
</template>
</MetricGroup>
  </div>
  <div v-else-if="kind === 'finance-dashboard'" class="tx-mm-stack">
    <div class="tx-mm-columns">
<MetricGroup v-for="original in data.groups?.filter(item => item.id !== 'assets')" :key="original.id" :group="original" :select="original.id === 'credit'">
<template #default="{ group }">
<h3>{{ group.label }}</h3><MetricValue :value="group.value" :unit="group.unit" /><MetricSegments v-if="group.id === 'credit'" :value="group.value" :target="group.target ?? data.max ?? 100" :count="42" mode="barcode" /><MetricPlot v-else :series="group.series" :mode="group.id === 'expenses' ? 'stacked' : 'pixel'" :height="160" /><MetricReadouts :items="group.metrics" compact />
</template>
</MetricGroup>
</div>
    <section v-if="assets" class="tx-mm-section">
<div class="tx-mm-section__heading">
<h3>{{ assets.label }}</h3><select v-model="asset" :aria-label="assets.label" :disabled="ctx.disabled.value">
<option value="">
{{ labels.all }}
</option><option v-for="item in assets.metrics" :key="item.id" :value="item.id">
{{ item.label }}
</option>
</select>
</div><MetricValue :value="selectedAssets.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0)" :unit="assets.unit" /><MetricReadouts :items="selectedAssets" compact /><div class="tx-mm-allocation">
<span v-for="(item, i) in selectedAssets" :key="item.id" :style="{ flex: typeof item.value === 'number' ? Math.max(0, item.value) : 0, background: toneColor(item.tone, i) }" />
</div>
</section>
  </div>
  <div v-else-if="kind === 'savings-cards'" class="tx-mm-stack">
    <div class="tx-mm-section__heading">
<MetricValue :value="data.value" :target="data.target" :unit="data.unit" /><TxButton :disabled="ctx.disabled.value" @click="ctx.action('add')">
+
</TxButton>
</div>
    <progress :value="data.value" :max="data.target ?? 100" :aria-label="labels.current" />
    <MetricReadouts :items="data.metrics" compact /><MetricPlot :series="data.series" mode="bar" :height="150" />
  </div>
</template>
