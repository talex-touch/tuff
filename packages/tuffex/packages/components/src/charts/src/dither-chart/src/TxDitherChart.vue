<!-- Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import type { DitherChartProps, DitherDataset, DitherHover, DitherSeries } from './types'
import type { DitherRenderInput } from './use-dither-canvas'
import type { ScaleKind } from '../../core/types'
import { computed, provide, reactive, ref, useId, watch } from 'vue'
import TxTextMorph from '../../../../text-morph/src/TxTextMorph.vue'
import { chartContextKey, createChartContext } from '../../core/context'
import TxChartTooltip from '../../tooltip/src/TxChartTooltip.vue'
import DitherPatternDefs from './DitherPatternDefs.vue'
import { clamp, createDitherScene, seriesValue } from './geometry'
import { useDitherCanvas } from './use-dither-canvas'

defineOptions({ name: 'TxDitherChart' })
const numericFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const props = withDefaults(defineProps<DitherChartProps>(), {
  variant: 'dither-donut', pattern: 'pixel', periods: () => [],
  series: () => [], nodes: () => [], cells: () => [],
  title: '', description: '', labels: () => ({}), height: 180,
  compact: false, animated: true, size: 'md', showLegend: true, indicator: 'dot',
})
const emit = defineEmits<{
  'update:period': [value: string]
  'update:activeKeys': [value: string[]]
  'update:selectedSeries': [value: string]
  'update:hover': [value: DitherHover | null]
  'update:dateCursor': [value: number | null]
  'period-change': [value: string]
  'select': [value: DitherHover]
}>()
defineSlots<{
  header?: (props: { total: number, period: string }) => unknown
  tooltip?: (props: { hover: DitherHover | null }) => unknown
  footer?: (props: { dataset: DitherDataset }) => unknown
}>()
const id = `tx-dither-${useId().replace(/:/g, '')}`
const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const width = ref(360)
const height = computed(() => Math.max(32, props.height))
const localPeriod = ref(props.periods[0]?.id ?? '')
const period = computed(() => props.period ?? localPeriod.value)
const dataset = computed<DitherDataset>(() => {
  const selected = props.periods.find(item => item.id === period.value)
  return { series: selected?.series ?? props.series, nodes: selected?.nodes ?? props.nodes, cells: selected?.cells ?? props.cells }
})
const localKeys = ref<readonly string[] | undefined>()
const activeKeys = computed(() => props.activeKeys ?? localKeys.value)
const localSelection = ref('')
const selectedSeries = computed(() => props.selectedSeries ?? localSelection.value)
const localHover = ref<DitherHover | null>(null)
const hover = computed(() => props.hover === undefined ? localHover.value : props.hover)
const localCursor = ref<number | null>(null)
const dateCursor = computed(() => props.dateCursor === undefined ? localCursor.value : props.dateCursor)
const pointer = reactive({ x: 0, y: 0, inside: false })
const sceneInput = computed(() => ({ variant: props.variant, dataset: dataset.value, width: width.value, height: height.value, selectedSeries: selectedSeries.value, activeKeys: activeKeys.value, maxValue: props.maxValue, hover: props.variant === 'dither-scatter' ? hover.value : undefined }))
const scene = computed(() => createDitherScene(sceneInput.value))
// Lazy: constructing Canvas paths happens only in a client pointer handler.
const hitPaths = computed(() => typeof Path2D === 'undefined' ? [] : scene.value.shapes.map(shape => ({ shape, path: new Path2D(shape.path) })))
const renderInput = computed<DitherRenderInput>(() => ({ ...sceneInput.value, animated: props.animated, pattern: props.pattern, hover: hover.value, pointer }))
const { ready: canvasReady, active } = useDitherCanvas(canvas, stage, renderInput, width)
const context = createChartContext({
  width, height, padding: computed(() => ({ top: 0, right: 0, bottom: 0, left: 0 })),
  xType: ref<ScaleKind>('linear'), xDomain: ref(undefined), yDomain: ref(undefined), yNice: ref(true), container: stage,
})
// The shared core's legacy counter is not used for any new SVG identifier.
context.clipId = `${id}-clip`
provide(chartContextKey, context)
const copy = computed(() => ({ empty: 'No data', period: 'Period', series: 'Series', chart: 'Dither chart', total: 'Total', capacity: 'Capacity', less: 'Less', more: 'More', cursor: 'Date cursor', ...props.labels }))
const isDonut = computed(() => ['dither-donut', 'dither-device', 'plan-card'].includes(props.variant))
const isSelector = computed(() => ['dither-gauge', 'dither-radial', 'dither-storage', 'dither-sparkline-matrix'].includes(props.variant))
const isTime = computed(() => ['dither-growth', 'members-growth', 'dither-revenue', 'dither-sparkline-matrix'].includes(props.variant))
const isCard = computed(() => ['plan-card', 'payments', 'members-growth'].includes(props.variant))
const selected = computed(() => dataset.value.series?.find(item => item.id === selectedSeries.value) ?? dataset.value.series?.find(item => !activeKeys.value || activeKeys.value.includes(item.id)))
const probes = computed(() => {
  const items = props.variant === 'dither-traffic' || props.variant === 'dither-scatter' ? dataset.value.nodes : dataset.value.series
  return items?.length ? items.map((item, index) => ({ id: item.id, color: item.color ?? `color-mix(in srgb, var(--tx-text-color-primary, #303133) ${Math.max(35, 100 - index * 14)}%, transparent)` })) : [{ id: 'cells', color: 'var(--tx-text-color-primary, #303133)' }]
})
const cursor = computed(() => dateCursor.value === null ? undefined : scene.value.cursorPoints[clamp(Math.round(dateCursor.value), 0, Math.max(0, scene.value.cursorPoints.length - 1))])
const currentHover = computed(() => cursor.value?.datum ?? hover.value)
const summary = computed(() => currentHover.value?.value ?? scene.value.total)
const summaryLabel = computed(() => currentHover.value?.label ?? copy.value.total)
const empty = computed(() => !scene.value.shapes.some(shape => shape.datum))
const tooltipRows = computed(() => currentHover.value ? [{ name: currentHover.value.label, value: format(currentHover.value.value, currentHover.value.label, dataset.value.series?.find(item => item.id === currentHover.value?.seriesId)), color: 'var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff))' }] : [])
const tooltipOpen = computed(() => currentHover.value !== null && (pointer.inside || cursor.value !== undefined))

function format(value: number, label: string, series?: DitherSeries): string {
  return props.formatValue?.(value, label, series) ?? `${numericFormat.format(value)}${series?.unit ? ` ${series.unit}` : ''}`
}

function updateHover(value: DitherHover | null): void {
  localHover.value = value
  emit('update:hover', value)
}

function updateCursor(value: number | null, fromPointer = false): void {
  localCursor.value = value
  emit('update:dateCursor', value)
  const point = value === null ? undefined : scene.value.cursorPoints[value]
  if (point) {
    if (!fromPointer) {
      pointer.x = point.x
      pointer.y = point.y
    }
    context.pointer.x = point.x
    context.pointer.y = point.y
    updateHover(point.datum)
  }
}

function choosePeriod(value: string): void {
  localPeriod.value = value
  updateCursor(null)
  updateHover(null)
  emit('update:period', value)
  emit('period-change', value)
}

function chooseSeries(item: DitherSeries): void {
  if (isSelector.value) {
    localSelection.value = item.id
    emit('update:selectedSeries', item.id)
  } else {
    const all = dataset.value.series?.map(entry => entry.id) ?? []
    const current = activeKeys.value ? [...activeKeys.value] : all
    const next = current.includes(item.id) ? current.filter(key => key !== item.id) : [...current, item.id]
    localKeys.value = next
    emit('update:activeKeys', next)
  }
  updateCursor(null)
  updateHover(null)
}

function focusSeries(item: DitherSeries): void {
  pointer.inside = true
  context.pointer.inside = true
  updateHover({ id: item.id, seriesId: item.id, label: item.label, value: seriesValue(item) })
}

function focusCategory(label: string): void {
  const point = scene.value.cursorPoints.find(item => item.datum.label === label)
  if (!point) return
  pointer.x = point.x
  pointer.y = point.y
  pointer.inside = true
  context.pointer.x = point.x
  context.pointer.y = point.y
  context.pointer.inside = true
  updateHover(point.datum)
}

function leave(): void {
  pointer.inside = false
  context.pointer.inside = false
  updateHover(null)
  updateCursor(null)
}

function move(event: PointerEvent): void {
  const element = stage.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  pointer.x = clamp((event.clientX - rect.left) / Math.max(1, rect.width)) * width.value
  pointer.y = clamp((event.clientY - rect.top) / Math.max(1, rect.height)) * height.value
  pointer.inside = true
  context.pointer.x = pointer.x
  context.pointer.y = pointer.y
  context.pointer.inside = true
  if (isTime.value) {
    let closest = -1; let distance = Infinity
    scene.value.cursorPoints.forEach((point, index) => {
      const delta = Math.abs(point.x - pointer.x)
      if (delta < distance) { closest = index; distance = delta }
    })
    updateCursor(closest >= 0 ? closest : null, true)
    return
  }
  if (props.variant === 'dither-scatter') {
    const closest = scene.value.cursorPoints.reduce<typeof scene.value.cursorPoints[number] | undefined>((found, point) => !found || Math.abs(point.x - pointer.x) < Math.abs(found.x - pointer.x) ? point : found, undefined)
    updateHover(closest?.datum ?? null)
    return
  }
  const ctx = canvas.value?.getContext('2d')
  if (!ctx || typeof Path2D === 'undefined') return
  let found: DitherHover | null = null
  for (let index = hitPaths.value.length - 1; index >= 0; index--) {
    const { shape, path } = hitPaths.value[index]!
    if (!shape.datum || shape.stroke) continue
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const hit = ctx.isPointInPath(path, pointer.x - (shape.translate?.[0] ?? 0), pointer.y - (shape.translate?.[1] ?? 0))
    ctx.restore()
    if (hit) { found = shape.datum; break }
  }
  updateHover(found)
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { leave(); return }
  const values = isTime.value ? scene.value.cursorPoints.map(point => point.datum) : scene.value.shapes.filter(shape => shape.datum).map(shape => shape.datum!)
  if (!values.length) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (currentHover.value) emit('select', currentHover.value)
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = isTime.value ? dateCursor.value ?? -1 : values.findIndex(value => value.id === hover.value?.id && value.seriesId === hover.value?.seriesId)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : clamp(current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1), 0, values.length - 1)
  pointer.inside = true
  context.pointer.inside = true
  if (isTime.value) updateCursor(index)
  else updateHover(values[index]!)
}

watch(dateCursor, (value) => {
  const point = value === null ? undefined : scene.value.cursorPoints[value]
  if (!point) return
  context.pointer.x = point.x
  context.pointer.y = point.y
}, { flush: 'post' })

watch(() => props.periods, (periods) => {
  if (!periods.some(item => item.id === localPeriod.value)) localPeriod.value = periods[0]?.id ?? ''
}, { deep: true })
watch(dataset, () => {
  if (dateCursor.value !== null && dateCursor.value >= scene.value.cursorPoints.length) updateCursor(null)
}, { flush: 'post' })
defineExpose({ scene, dataset, period, selectedSeries, dateCursor })
</script>

<template>
  <section class="tx-dither-chart" :class="[`tx-dither-chart--${size}`, { 'is-compact': compact, 'is-card': isCard, 'is-donut': isDonut }]" :data-variant="variant" :data-pattern="pattern" :data-motion-active="active">
    <header v-if="!compact" class="tx-dither-chart__header">
      <slot name="header" :total="scene.total" :period="period">
        <div>
          <h3 v-if="title">
{{ title }}
</h3>
          <p v-if="description">
{{ description }}
</p>
          <div class="tx-dither-chart__summary">
            <TxTextMorph :text="format(summary, summaryLabel, selected)" :disabled="!active" numbers />
            <span>{{ summaryLabel }}</span>
            <span v-if="selected?.change">{{ selected.change }}</span>
          </div>
          <span v-if="variant === 'dither-storage' && selected?.capacity !== undefined" class="tx-dither-chart__capacity">{{ copy.capacity }}: {{ format(selected.capacity, copy.capacity, selected) }}</span>
        </div>
      </slot>
    </header>
    <div v-if="!compact && periods.length && !isCard" class="tx-dither-chart__periods" role="group" :aria-label="copy.period">
      <button v-for="item in periods" :key="item.id" type="button" :aria-pressed="period === item.id" @click="choosePeriod(item.id)">
{{ item.label }}
</button>
    </div>
    <div class="tx-dither-chart__body">
      <div class="tx-dither-chart__plot-wrap" :class="{ 'has-ticks': !compact && scene.ticks.length, 'is-sparkline': variant === 'dither-sparkline-matrix' }">
        <div v-if="!compact && scene.ticks.length" class="tx-dither-chart__y-axis" :style="{ height: `${height}px` }" aria-hidden="true">
          <span v-for="tick in scene.ticks" :key="tick.value" :style="{ top: `${tick.y / height * 100}%` }" :title="format(tick.value, '', selected)">{{ format(tick.value, '', selected) }}</span>
        </div>
        <div ref="stage" class="tx-dither-chart__stage" :style="{ height: `${height}px` }" role="group" tabindex="0" :aria-label="title || copy.chart" :aria-describedby="`${id}-description`" @pointermove="move" @pointerleave="leave" @keydown="keydown" @blur="leave" @click="currentHover && emit('select', currentHover)">
          <span v-for="probe in probes" :key="probe.id" data-dither-color class="tx-dither-chart__color-probe" :style="{ color: probe.color }" />
          <span data-dither-label-color class="tx-dither-chart__color-probe" style="color: var(--tx-bg-color, #fff)" />
          <svg class="tx-dither-chart__svg" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="title || copy.chart">
            <title>{{ title || copy.chart }}</title>
            <DitherPatternDefs v-for="(probe, index) in probes" :key="probe.id" :prefix="`${id}-${index}`" :style="{ color: probe.color }" />
            <g :opacity="canvasReady ? 0 : 1">
              <path v-for="shape in scene.shapes" :key="shape.key" :d="shape.path" :style="{ color: probes[Math.max(0, shape.seriesIndex)]?.color }" :transform="shape.translate ? `translate(${shape.translate[0]} ${shape.translate[1]})` : undefined" :fill="shape.stroke ? 'none' : shape.texture === 'track' || pattern === 'noise' ? 'currentColor' : `url(#${id}-${Math.max(0, shape.seriesIndex)}-${pattern})`" :stroke="shape.stroke ? 'currentColor' : undefined" :stroke-width="shape.stroke ? 2.5 : undefined" :filter="pattern === 'noise' && shape.texture !== 'track' ? `url(#${id}-${Math.max(0, shape.seriesIndex)}-noise)` : undefined" :opacity="shape.opacity * (hover && shape.datum && shape.datum.seriesId !== hover.seriesId && shape.datum.id !== hover.id ? 0.3 : 1)" />
            </g>
            <g v-if="!compact && !isDonut && !['dither-storage', 'dither-uptime', 'dither-heatmap', 'dither-heatmap-grid'].includes(variant)" class="tx-dither-chart__grid">
              <path v-for="tick in scene.ticks" :key="tick.value" :d="`M0 ${tick.y}H${width}`" />
            </g>
            <g v-if="variant === 'dither-traffic' && !canvasReady" class="tx-dither-chart__node-labels">
              <text v-for="label in scene.labels" :key="label.text" :x="label.x" :y="label.y" text-anchor="middle" dominant-baseline="central">{{ label.text }}</text>
            </g>
          </svg>
          <canvas ref="canvas" class="tx-dither-chart__canvas" :class="{ 'is-visible': canvasReady }" aria-hidden="true" />
          <svg v-if="cursor" class="tx-dither-chart__cursor" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
            <path :d="`M${cursor.x} 0V${height}`" />
            <circle :cx="cursor.x" :cy="cursor.y" r="4" />
          </svg>
          <div v-if="empty" class="tx-dither-chart__empty">
{{ copy.empty }}
</div>
          <div v-if="variant === 'dither-radial' && selected" class="tx-dither-chart__radial-value" aria-hidden="true">
            <TxTextMorph :text="`${Math.round(seriesValue(selected) / Math.max(1, selected.capacity ?? 100) * 100)}%`" :disabled="!active" numbers />
            <span>{{ selected.label }}</span>
          </div>
          <TxChartTooltip :open="tooltipOpen" :title="currentHover?.label" :rows="tooltipRows">
            <template v-if="$slots.tooltip || indicator !== 'dot'" #default>
              <slot name="tooltip" :hover="currentHover">
                <span class="tx-dither-chart__tooltip-indicator" :class="`is-${indicator}`" />
                <span>{{ currentHover?.label }}: {{ currentHover ? format(currentHover.value, currentHover.label, selected) : '' }}</span>
              </slot>
            </template>
          </TxChartTooltip>
        </div>
        <div v-if="!compact && scene.labels.length && variant !== 'dither-traffic'" class="tx-dither-chart__axis" :style="{ height: '24px' }">
          <template v-for="(label, index) in scene.labels" :key="`${label.text}-${index}`">
            <button v-if="['dither-stacked', 'payments', 'dither-bar'].includes(variant)" type="button" :style="{ left: `${label.x / width * 100}%` }" @pointerenter="focusCategory(label.text)" @pointerleave="leave" @focus="focusCategory(label.text)" @blur="leave" @click="currentHover && emit('select', currentHover)">
{{ label.text }}
</button>
            <span v-else :style="{ left: `${label.x / width * 100}%`, transform: label.anchor === 'start' ? 'none' : label.anchor === 'end' ? 'translateX(-100%)' : 'translateX(-50%)' }">{{ label.text }}</span>
          </template>
        </div>
        <div v-if="!compact && isTime && scene.cursorPoints.length" class="tx-dither-chart__scrubber">
          <label :for="`${id}-cursor`">{{ copy.cursor }}</label>
          <input :id="`${id}-cursor`" type="range" min="0" :max="scene.cursorPoints.length - 1" :value="dateCursor ?? 0" @input="updateCursor(Number(($event.target as HTMLInputElement).value))">
        </div>
      </div>
      <div v-if="!compact && showLegend && dataset.series?.length" class="tx-dither-chart__legend" :class="{ 'is-matrix': variant === 'dither-sparkline-matrix' }" role="group" :aria-label="copy.series">
        <button v-for="(item, index) in dataset.series" :key="item.id" type="button" :aria-pressed="isSelector ? selected?.id === item.id : !activeKeys || activeKeys.includes(item.id)" @click="chooseSeries(item)" @pointerenter="focusSeries(item)" @pointerleave="leave" @focus="focusSeries(item)" @blur="leave">
          <span class="tx-dither-chart__indicator" :class="`is-${indicator}`" :style="indicator === 'dashed' ? { color: probes[index]?.color } : { backgroundColor: probes[index]?.color }" />
          <span class="tx-dither-chart__legend-label">{{ item.label }}</span>
          <span>{{ format(seriesValue(item), item.label, item) }}</span>
          <span v-if="isDonut && scene.total > 0">{{ activeKeys && !activeKeys.includes(item.id) ? 0 : Math.round(seriesValue(item) / scene.total * 100) }}%</span>
        </button>
      </div>
    </div>
    <div v-if="!compact && isCard && periods.length" class="tx-dither-chart__periods" role="group" :aria-label="copy.period">
      <button v-for="item in periods" :key="item.id" type="button" :aria-pressed="period === item.id" @click="choosePeriod(item.id)">
{{ item.label }}
</button>
    </div>
    <div v-if="!compact && ['dither-heatmap', 'dither-heatmap-grid', 'dither-uptime'].includes(variant)" class="tx-dither-chart__intensity" aria-hidden="true">
<span>{{ copy.less }}</span><i v-for="level in 5" :key="level" :style="{ opacity: 0.15 + (level - 1) * 0.2 }" /><span>{{ copy.more }}</span>
</div>
    <p :id="`${id}-description`" class="tx-dither-chart__sr-only">
{{ description || title || copy.chart }}. {{ copy.total }}: {{ format(scene.total, copy.total) }}
</p>
    <div class="tx-dither-chart__sr-only" role="status" aria-live="polite">
{{ currentHover ? `${currentHover.label}: ${format(currentHover.value, currentHover.label, selected)}` : `${copy.total}: ${format(scene.total, copy.total)}` }}
</div>
    <slot name="footer" :dataset="dataset" />
  </section>
</template>

<style lang="scss" scoped>
.tx-dither-chart {
  --tx-dither-pad: 16px;
  --tx-dither-gap: 12px;
  width: 100%; min-width: 0; box-sizing: border-box; padding: var(--tx-dither-pad);
  background: var(--tx-bg-color, #fff); color: var(--tx-text-color-primary, #303133);
  border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
  font-size: 13px; line-height: 1.5;
  &--xs { --tx-dither-pad: 6px; --tx-dither-gap: 6px; }
  &--sm { --tx-dither-pad: 10px; --tx-dither-gap: 8px; }
  &--lg { --tx-dither-pad: 20px; --tx-dither-gap: 16px; }
  &.is-compact { padding: 4px; box-shadow: none; background: transparent; }
  &__header { margin-bottom: var(--tx-dither-gap); }
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 600; }
  p, &__capacity { font-size: 12px; color: var(--tx-text-color-regular, #606266); }
  &__summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-top: 4px; font-variant-numeric: tabular-nums; }
  &__summary > :first-child { font-size: 24px; font-weight: 600; }
  &__periods { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: var(--tx-dither-gap); }
  &__periods button, &__legend button { appearance: none; border: 0; color: var(--tx-text-color-regular, #606266); background: transparent; font: inherit; cursor: pointer; border-radius: 7px; padding: 5px 8px; }
  &__periods button[aria-pressed='true'], &__legend button[aria-pressed='true'] { background: var(--tx-fill-color-light, #f5f7fa); color: var(--tx-text-color-primary, #303133); }
  button:hover { background: var(--tx-fill-color, #f0f2f5); }
  button:focus-visible, &__stage:focus-visible { outline: 2px solid var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); outline-offset: 2px; }
  &__body { display: flex; flex-direction: column; gap: var(--tx-dither-gap); }
  &__plot-wrap { position: relative; min-width: 0; flex: 1; }
  &__plot-wrap.has-ticks { padding-left: 42px; }
  &__y-axis { position: absolute; left: 0; top: 0; width: 36px; color: var(--tx-chart-text-primary, var(--tx-text-color-regular, #606266)); font-size: 12px; }
  &__y-axis span { position: absolute; right: 0; transform: translateY(-50%); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  &:has(.is-sparkline) &__legend { order: -1; }
  &__stage { position: relative; width: 100%; touch-action: pan-y; isolation: isolate; }
  &__svg, &__canvas, &__cursor { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  &__canvas { opacity: 0; }
  &__canvas.is-visible { opacity: 1; }
  &__cursor { z-index: 1; fill: var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); stroke: var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); }
  &__cursor path { fill: none; opacity: 0.55; }
  &__cursor circle { stroke: var(--tx-bg-color, #fff); stroke-width: 2; }
  &__grid path { stroke: var(--tx-chart-grid-line, var(--tx-border-color, #dcdfe6)); stroke-dasharray: 3 3; fill: none; }
  &__node-labels text { font-size: 13px; font-weight: 500; fill: var(--tx-text-color-primary, #303133); paint-order: stroke; stroke: var(--tx-bg-color, #fff); stroke-width: 3; }
  &__axis { position: relative; color: var(--tx-text-color-regular, #606266); font-size: 12px; }
  &__axis span { position: absolute; white-space: nowrap; max-width: 25%; overflow: hidden; text-overflow: ellipsis; }
  &__axis button { position: absolute; transform: translateX(-50%); white-space: nowrap; max-width: 25%; overflow: hidden; text-overflow: ellipsis; appearance: none; border: 0; border-radius: 4px; color: inherit; background: transparent; font: inherit; cursor: pointer; }
  &__legend { display: flex; flex-wrap: wrap; gap: 4px; }
  &__legend button { display: flex; align-items: center; gap: 8px; }
  &__legend button[aria-pressed='false'] { text-decoration: line-through; }
  &__legend-label { flex: 1; text-align: start; }
  &__indicator, &__tooltip-indicator { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; background: var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); }
  .is-line { width: 12px; height: 2px; border-radius: 0; }
  .is-dashed { width: 12px; height: 2px; border-radius: 0; background: transparent; border-top: 2px dashed currentColor; }
  &__scrubber { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  &__scrubber input { flex: 1; min-width: 0; cursor: ew-resize; accent-color: var(--tx-chart-categorical-1, var(--tx-color-primary, #409eff)); }
  &__radial-value, &__empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
  &__radial-value > :first-child { font-size: 24px; font-weight: 600; }
  &__intensity { display: flex; justify-content: flex-end; align-items: center; gap: 4px; font-size: 12px; margin-top: 8px; }
  &__intensity i { width: 10px; height: 10px; background: var(--tx-text-color-primary, #303133); }
  &__sr-only, &__color-probe { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  &.is-card &__header { padding-bottom: var(--tx-dither-gap); border-bottom: 1px solid var(--tx-border-color-light, #e4e7ed); }
  &.is-card &__periods { justify-content: center; margin: var(--tx-dither-gap) 0 0; }
  &__legend.is-matrix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  &__legend.is-matrix button { flex-wrap: wrap; }
  &.is-donut &__legend { flex-direction: column; }
  @media (min-width: 480px) {
    &.is-donut &__body { flex-direction: row; align-items: center; }
    &.is-donut &__plot-wrap { flex: 0 1 45%; }
    &.is-donut &__legend { flex: 1; min-width: 0; }
  }
}
</style>
