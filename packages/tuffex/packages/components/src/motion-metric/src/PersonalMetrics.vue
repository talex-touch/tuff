<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import { computed } from 'vue'
import TxButton from '../../button'
import TxInput from '../../input/src/TxInput.vue'
import TxSlider from '../../slider/src/TxSlider.vue'
import { toneColor, useMetricContext } from './context'
import MetricGauge from './MetricGauge.vue'
import MetricPlot from './MetricPlot.vue'
import MetricReadouts from './MetricReadouts.vue'
import MetricValue from './MetricValue.vue'
defineProps<{ kind: string }>()
defineSlots<{ preview?: () => unknown }>()
const ctx = useMetricContext()
const data = ctx.data
const labels = ctx.labels
const timer = computed(() => {
  if (data.value.remaining === undefined) return '—'
  const seconds = Math.max(0, Math.floor(data.value.remaining))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
const noise = computed(() => data.value.groups?.length ? data.value.groups : [{ id: 'noise', label: data.value.title ?? '', value: ctx.value.value, unit: data.value.unit }])
function setLow(value: number): void { ctx.setRange([Math.min(value, ctx.range.value[1]), ctx.range.value[1]]) }
function setHigh(value: number): void { ctx.setRange([ctx.range.value[0], Math.max(value, ctx.range.value[0])]) }
</script>
<template>
  <div v-if="kind === 'timer-preparation-segmented' || kind === 'timer-card'" class="tx-mm-stack">
    <MetricValue :value="timer" /><span>{{ labels.remaining }}</span>
    <output class="tx-mm-step-label">{{ data.steps?.[ctx.index.value]?.label }} <span>{{ data.steps?.[ctx.index.value]?.status }}</span></output>
    <div class="tx-mm-timer-steps">
<button v-for="(step, i) in data.steps" :key="step.id" type="button" :style="{ flex: Math.max(0, step.value) }" :aria-pressed="i === ctx.index.value" :disabled="ctx.disabled.value" @click="ctx.select(i, step.id)">
{{ step.label }}
</button>
</div>
    <progress v-if="data.remaining !== undefined && data.total !== undefined" :value="data.total - data.remaining" :max="data.total" :aria-label="data.title" />
    <TxButton :disabled="ctx.disabled.value" @click="ctx.setRunning(!ctx.running.value)">
{{ ctx.running.value ? labels.pause : labels.start }}
</TxButton>
  </div>
  <div v-else-if="kind === 'noise-decibel-level' || kind === 'noise-cards'" class="tx-mm-stack">
    <div class="tx-mm-columns">
<section v-for="group in noise" :key="group.id" class="tx-mm-section">
<div class="tx-mm-section__heading">
<h3>{{ group.label }}</h3><div class="tx-mm-signal" :style="{ color: toneColor(group.value !== undefined && group.value > (data.threshold ?? ctx.range.value[1]) ? 'warning' : 'success') }" aria-hidden="true">
<span /><span /><span />
</div>
</div><MetricValue :value="group.value" :unit="group.unit" /><div class="tx-mm-noise-pills">
<span>{{ labels.low }} {{ ctx.format(ctx.range.value[0]) }}</span><span>{{ labels.high }} {{ ctx.format(ctx.range.value[1]) }}</span>
</div>
</section>
</div>
    <label class="tx-mm-field">{{ labels.minimum }}<TxSlider :model-value="ctx.range.value[0]" :min="data.min ?? 0" :max="Math.min(data.max ?? 120, ctx.range.value[1])" :aria-label="labels.minimum" :disabled="ctx.disabled.value" :thumb-surface="false" @update:model-value="setLow" /></label>
    <label class="tx-mm-field">{{ labels.maximum }}<TxSlider :model-value="ctx.range.value[1]" :min="Math.max(data.min ?? 0, ctx.range.value[0])" :max="data.max ?? 120" :aria-label="labels.maximum" :disabled="ctx.disabled.value" :thumb-surface="false" @update:model-value="setHigh" /></label>
    <label v-if="kind === 'noise-decibel-level'" class="tx-mm-field">{{ labels.current }}<TxSlider :model-value="ctx.value.value ?? 0" :min="data.min ?? 0" :max="data.max ?? 120" :aria-label="labels.current" :disabled="ctx.disabled.value" :thumb-surface="false" @update:model-value="ctx.setValue" /></label>
  </div>
  <div v-else-if="kind === 'running-stats-card'" class="tx-mm-stack">
<MetricValue :value="data.value" :unit="data.unit" /><MetricReadouts :items="data.metrics" compact /><MetricPlot :series="data.series" mode="bar" :height="160" />
</div>
  <div v-else-if="kind === 'course-progress-card'" class="tx-mm-stack">
    <div class="tx-mm-section__heading">
<MetricGauge :value="data.value" :target="data.target" mode="ring" :unit="data.unit" /><TxButton :disabled="ctx.disabled.value" @click="ctx.action('resume')">
{{ labels.resume }}
</TxButton><TxButton size="sm" :disabled="ctx.disabled.value" @click="ctx.action('all')">
{{ labels.all }}
</TxButton>
</div>
    <section v-for="group in data.groups" :key="group.id" class="tx-mm-section">
<div class="tx-mm-section__heading">
<h3>{{ group.label }}</h3><TxButton size="sm" :disabled="ctx.disabled.value" @click="ctx.action('details')">
{{ labels.details }}
</TxButton>
</div><MetricValue :value="group.value" :unit="group.unit" /><div class="tx-mm-profile">
<span v-for="profile in data.profiles" :key="profile.id" class="tx-mm-avatar" :title="profile.name">{{ profile.initials ?? profile.name.slice(0, 2) }}</span>
</div><MetricReadouts :items="group.metrics" compact /><MetricPlot :series="group.series" mode="bar" :height="100" />
</section>
  </div>
  <div v-else-if="kind === 'health-cards'" class="tx-mm-columns">
    <section v-for="group in data.groups" :key="group.id" class="tx-mm-section">
<h3>{{ group.label }}</h3><MetricValue :value="group.value" :unit="group.unit" /><MetricReadouts :items="group.metrics" compact />
      <div v-if="group.id === 'goals' || group.id === 'hydration'" class="tx-mm-day-rings">
<div v-for="point in group.series?.[0]?.points" :key="point.label">
<MetricGauge :value="point.value" :target="group.metrics?.[0]?.target ?? 100" mode="ring" /><span>{{ point.label }}</span>
</div>
</div>
      <div v-else-if="group.id === 'period'" class="tx-mm-day-dots">
<span v-for="cell in group.cells" :key="cell.id"><i :class="{ 'is-filled': cell.value > 0 }" />{{ cell.label }}</span>
</div>
      <div v-else-if="group.id === 'sleep'" class="tx-mm-sleep">
<span v-for="(point, i) in group.series?.[0]?.points" :key="`${point.label}-${i}`" :style="{ flex: Math.max(0, point.value), height: `${point.level ?? 100}%`, background: toneColor(undefined, i) }" :title="`${point.label}: ${ctx.format(point.value, group.unit)}`" />
</div>
      <template v-else-if="group.id === 'target'">
<progress :value="group.value" :max="group.metrics?.[0]?.target ?? 100" :aria-label="group.label" /><p>{{ group.metrics?.[0]?.description }}</p>
</template>
      <MetricPlot v-else :series="group.series" :mode="group.id === 'heart' ? 'signal' : 'area'" :height="110" />
    </section>
  </div>
  <div v-else-if="kind === 'status-cards'" class="tx-mm-columns">
    <section v-for="profile in data.profiles" :key="profile.id" class="tx-mm-section tx-mm-status">
<div class="tx-mm-profile">
<span class="tx-mm-avatar">{{ profile.initials ?? profile.name.slice(0, 2) }}</span><div><h3>{{ profile.name }}</h3><p>{{ profile.status }}</p></div><span v-if="profile.value !== undefined" class="tx-mm-badge">{{ profile.value }}</span>
</div><p v-if="profile.detail">
{{ profile.detail }}
</p><div v-if="profile.segments" class="tx-mm-sleep">
<span v-for="(point, i) in profile.segments" :key="`${point.label}-${i}`" :style="{ flex: Math.max(0, point.value), background: toneColor(undefined, i) }" :title="`${point.label}: ${ctx.format(point.value)}`" />
</div><section v-if="profile.flight" class="tx-mm-flight">
<strong>{{ profile.flight.label }}</strong><div class="tx-mm-section__heading">
<span>{{ profile.flight.from }}</span><progress :value="profile.flight.progress" max="100" :aria-label="profile.flight.label" /><span>{{ profile.flight.to }}</span>
</div><div class="tx-mm-section__heading">
<span>{{ profile.flight.departure }}</span><span>{{ profile.flight.arrival }}</span>
</div>
</section>
</section>
  </div>
  <div v-else-if="kind === 'feedback-card'" class="tx-mm-stack">
    <section class="tx-mm-feedback-preview">
<slot name="preview">
<p>{{ data.description }}</p><MetricReadouts :items="data.metrics" compact />
</slot>
</section>
    <form class="tx-mm-feedback-form" @submit.prevent="ctx.send">
<TxInput :model-value="ctx.message.value" :placeholder="labels.message" :aria-label="labels.message" :disabled="ctx.disabled.value" @update:model-value="ctx.setMessage(String($event))" /><TxButton native-type="submit" :disabled="ctx.disabled.value || !ctx.message.value.trim()">
{{ labels.send }}
</TxButton>
</form>
    <ol class="tx-mm-messages">
<li v-for="message in data.messages" :key="message.id">
<div class="tx-mm-section__heading">
<strong>{{ message.author }}</strong><time v-if="message.time">{{ message.time }}</time>
</div><p>{{ message.text }}</p>
</li>
</ol>
  </div>
</template>
