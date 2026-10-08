<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import type { MotionMetricPoint, MotionMetricSeries } from './types'
import { computed, useId } from 'vue'
import TxChart from '../../charts/src/chart/src/TxChart.vue'
import TxGrid from '../../charts/src/grid/src/TxGrid.vue'
import TxLineSeries from '../../charts/src/series/src/TxLineSeries.vue'
import TxAreaSeries from '../../charts/src/series/src/TxAreaSeries.vue'
import TxBarSeries from '../../charts/src/series/src/TxBarSeries.vue'
import TxScatterSeries from '../../charts/src/series/src/TxScatterSeries.vue'
import TxSlider from '../../slider/src/TxSlider.vue'
import { toneColor, useMetricContext } from './context'
const props = withDefaults(defineProps<{ series?: MotionMetricSeries[]; mode?: 'line' | 'area' | 'bar' | 'dual' | 'stacked' | 'step' | 'striped' | 'pixel' | 'signal'; height?: number; average?: boolean; threshold?: number; scrubber?: boolean; monochrome?: boolean }>(), { mode: 'area', height: 160, scrubber: true })
const ctx = useMetricContext()
const patternId = `metric-pattern-${useId()}`
const rows = computed(() => (props.series ?? []).map((series, seriesIndex) => ({
  ...series,
  color: props.monochrome ? 'var(--tx-text-color-primary)' : toneColor(series.tone, seriesIndex),
  points: series.points.map((point, index) => ({ ...point, x: index })),
})))
const points = computed(() => rows.value[0]?.points ?? [])
const count = computed(() => Math.max(1, ...rows.value.map(row => row.points.length)))
const index = computed(() => Math.max(0, Math.min(count.value - 1, ctx.index.value)))
const reference = computed(() => props.threshold ?? (props.average && points.value.length ? points.value.reduce((sum, point) => sum + point.value, 0) / points.value.length : undefined))
const maximum = computed(() => Math.max(1, reference.value ?? 0, ...(props.mode === 'stacked' ? Array.from({ length: count.value }, (_, i) => rows.value.reduce((sum, row) => sum + (row.points[i]?.value ?? 0), 0)) : rows.value.flatMap(row => row.points.map(point => point.value)))))
const minimum = computed(() => Math.min(0, ...rows.value.flatMap(row => row.points.map(point => point.value))))
const domain = computed<[number, number]>(() => [minimum.value, maximum.value])
const referencePoints = computed(() => reference.value === undefined ? [] : [{ x: 0, value: reference.value }, { x: count.value - 1, value: reference.value }])
const special = computed(() => ['step', 'striped', 'pixel', 'signal'].includes(props.mode))
const crosshair = computed(() => [{ x: index.value, label: points.value[index.value]?.label ?? '', value: minimum.value }, { x: index.value, label: points.value[index.value]?.label ?? '', value: maximum.value }])
function onPointer(event: PointerEvent): void {
  if (ctx.disabled.value || !points.value.length) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  ctx.select(Math.max(0, Math.min(count.value - 1, Math.floor((event.clientX - bounds.left) / bounds.width * count.value))))
}
function pointTitle(point: MotionMetricPoint): string { return `${point.label}: ${ctx.format(point.value)}` }
function barHeight(value: number): number { return Math.max(0, value / maximum.value * 116) }
</script>
<template>
  <figure class="tx-mm-plot" :class="`tx-mm-plot--${mode}`">
    <div v-if="rows.length > 1" class="tx-mm-legend">
      <span v-for="row in rows" :key="row.id"><i :style="{ background: row.color }" />{{ row.label }}</span>
    </div>
    <div v-if="points.length" class="tx-mm-plot__canvas" @pointermove="onPointer">
      <svg v-if="special" viewBox="0 0 600 148" :style="{ height: `${height}px` }" role="img" :aria-label="rows.map(row => row.label).join(', ')">
        <defs><pattern :id="patternId" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" stroke-width="2" /></pattern></defs>
        <line v-for="y in [20, 65, 110]" :key="y" x1="0" :y1="y" x2="600" :y2="y" class="tx-mm-plot__grid" />
        <g v-for="(point, i) in points" :key="`${point.label}-${i}`" :class="{ 'is-selected': i === index }">
          <template v-if="mode === 'pixel'">
            <rect v-for="n in Math.round(barHeight(point.value) / 5) * 4" :key="n" :x="i * 600 / count + ((n - 1) % 4) * (600 / count - 8) / 4" :y="130 - Math.ceil(n / 4) * 5" :width="Math.max(1, (600 / count - 8) / 4 - 2)" height="3" :fill="rows[0]?.color" :opacity="0.3 + Math.ceil(n / 4) / 30"><title>{{ pointTitle(point) }}</title></rect>
          </template>
          <template v-else>
            <rect :x="i * 600 / count + 4" :y="130 - barHeight(point.value)" :width="Math.max(1, 600 / count - 8)" :height="barHeight(point.value)" rx="4" :fill="mode === 'step' ? 'var(--tx-fill-color-dark)' : mode === 'signal' ? toneColor(point.tone, 0) : i === index ? rows[0]?.color : 'var(--tx-fill-color)'" />
            <rect v-if="mode === 'step'" :x="i * 600 / count + 4" :y="130 - barHeight(point.value)" :width="600 / count - 8" height="4" :fill="rows[0]?.color" />
            <rect v-else-if="mode === 'striped'" :x="i * 600 / count + 4" :y="130 - barHeight(point.value)" :width="Math.max(1, 600 / count - 8)" :height="barHeight(point.value)" rx="4" :fill="`url(#${patternId})`" opacity="0.25" />
          </template>
        </g>
        <line v-if="reference !== undefined" x1="0" :y1="130 - barHeight(reference)" x2="600" :y2="130 - barHeight(reference)" stroke="var(--tx-color-warning)" stroke-dasharray="4 4" />
      </svg>
      <TxChart v-else :width="600" :height="height" :padding="{ top: 14, right: 12, bottom: 14, left: 12 }" :x-domain="mode === 'bar' || mode === 'dual' || mode === 'stacked' ? points.map(point => point.label) : [0, Math.max(1, count - 1)]" :x-type="mode === 'bar' || mode === 'dual' || mode === 'stacked' ? 'band' : 'linear'" :y-domain="domain" :y-nice="false" :aria-description="rows.map(row => row.label).join(', ')">
        <TxGrid :y="true" :ticks="3" />
        <template v-for="row in rows" :key="row.id">
          <TxBarSeries v-if="mode === 'bar' || mode === 'dual' || mode === 'stacked'" :data="row.points" x="label" y="value" :color="row.color" :radius="4" :stack="mode === 'stacked' ? 'metric' : undefined" />
          <TxAreaSeries v-else-if="mode === 'area'" :data="row.points" x="x" y="value" curve="monotone" :color="row.color" />
          <TxLineSeries v-else :data="row.points" x="x" y="value" curve="monotone" :color="row.color" :show-symbol="count < 8" />
          <TxScatterSeries v-if="row.points[index] && (mode === 'line' || mode === 'area')" :data="[row.points[index]!]" x="x" y="value" :color="row.color" :r="5" />
        </template>
        <TxLineSeries v-if="reference !== undefined && (mode === 'line' || mode === 'area')" :data="referencePoints" x="x" y="value" color="var(--tx-color-warning)" dashed />
        <TxLineSeries :data="crosshair" :x="mode === 'bar' || mode === 'dual' || mode === 'stacked' ? 'label' : 'x'" y="value" color="var(--tx-text-color-regular)" dashed />
      </TxChart>
      <output class="tx-mm-plot__tooltip" :style="{ left: `${Math.max(12, Math.min(88, (index + 0.5) / count * 100))}%` }">
        <span>{{ points[index]?.label }}</span>
        <span v-for="row in rows" :key="row.id">{{ row.label }}: {{ ctx.format(row.points[index]?.value, row.unit) }}</span>
      </output>
    </div>
    <p v-else class="tx-mm-empty">
{{ ctx.labels.value.empty }}
</p>
    <div class="tx-mm-plot__ticks">
<span>{{ points[0]?.label }}</span><span v-if="reference !== undefined">{{ ctx.labels.value.average }} {{ ctx.format(reference) }}</span><span>{{ points[points.length - 1]?.label }}</span>
</div>
    <TxSlider v-if="points.length && scrubber !== false" :model-value="index" :max="count - 1" :aria-label="ctx.labels.value.scrubber" :disabled="ctx.disabled.value" :thumb-surface="false" @update:model-value="ctx.select($event)" />
  </figure>
</template>
