<script setup lang="ts">
// Adapted from Amicro mono-charts (MIT).
// Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { MonoChartData, MonoChartEmits, MonoChartHit, MonoChartProps } from './types'
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { useMotionActivity } from '../../../../../../utils/motion-activity'
import { placeTooltip } from '../../tooltip/src/position'
import { loadGitHubActivity } from './activity-source'
import { buildMonoGeometry } from './geometry'

defineOptions({ name: 'TxMonoChart' })
const props = withDefaults(defineProps<MonoChartProps>(), {
  variant: 'mono-rounded-line', data: () => ({}), width: 560,
  ariaLabel: 'Mono chart', compact: false, controls: true,
  showTooltip: true, showLegend: true, showMonths: true, months: 12, cellSize: 11,
  open: undefined, showLine: undefined, defaultOpen: false, locale: 'en-US',
})
const emit = defineEmits<MonoChartEmits>()
defineSlots<{
  header?: (props: { metric: string | number, data: MonoChartData }) => unknown
  tooltip?: (props: { hit: MonoChartHit }) => unknown
  center?: (props: { value: string | number, label: string, hit: MonoChartHit | null }) => unknown
  repository?: (props: { repo: NonNullable<MonoChartData['repos']>[number] }) => unknown
  avatar?: (props: { repo: NonNullable<MonoChartData['repos']>[number], collapsed: boolean }) => unknown
  footer?: (props: { data: MonoChartData }) => unknown
}>()
const host = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const tooltip = ref<HTMLElement | null>(null)
const { active, visible } = useMotionActivity(host)
const uid = `tx-mono-${useId().replace(/[^\w-]/g, '')}`
const height = computed(() => Math.max(100, props.height ?? (props.compact ? 150 : 210)))
const width = computed(() => Math.max(180, props.width))
const localMode = ref<'single' | 'dual'>('dual')
const localLayout = ref<'col' | 'row'>('col')
const localCurve = ref<'monotone' | 'natural'>('monotone')
const localLine = ref(true)
const localPeriod = ref('')
const localOpen = ref(props.defaultOpen)
const seriesMode = computed({ get: () => props.seriesMode ?? localMode.value, set: (value) => { localMode.value = value; emit('update:seriesMode', value) } })
const layout = computed({ get: () => props.layout ?? localLayout.value, set: (value) => { localLayout.value = value; emit('update:layout', value) } })
const curve = computed({ get: () => props.curve ?? localCurve.value, set: (value) => { localCurve.value = value; emit('update:curve', value) } })
const showLine = computed({ get: () => props.showLine ?? localLine.value, set: (value) => { localLine.value = value; emit('update:showLine', value) } })
const period = computed({ get: () => props.period ?? (localPeriod.value || props.periods?.[0]?.value || ''), set: (value) => { localPeriod.value = value; emit('update:period', value) } })
const open = computed({ get: () => props.open ?? localOpen.value, set: (value) => { localOpen.value = value; emit('update:open', value) } })
const labels = computed(() => ({
  single: 'Single', dual: 'Dual', col: 'Col', row: 'Row', monotone: 'Monotone', natural: 'Natural',
  showLine: 'Spline on', hideLine: 'Spline off', repositories: 'Top contributions in',
  expand: 'Show repositories', collapse: 'Hide repositories', empty: 'No data',
  loading: 'Loading activity', error: 'Activity could not be loaded', retry: 'Retry',
  less: 'Less', more: 'More', target: 'Target', open: 'Open', high: 'High', low: 'Low', close: 'Close',
  x: 'X', y: 'Y', z: 'Z', min: 'Min', max: 'Max', delta: 'Delta', balance: 'Balance', ...props.labels,
}))
const fetched = ref<Pick<MonoChartData, 'contributions' | 'repos'>>({})
const sourceState = ref<'idle' | 'loading' | 'error' | 'ready'>('idle')
let controller: AbortController | undefined
let generation = 0
const sourceKey = computed(() => props.variant === 'github-activity' && props.username && (props.data.contributions === undefined || props.data.repos === undefined) ? props.username : '')
let loadedKey = ''
function cancelSource(): void {
  generation++
  controller?.abort()
  controller = undefined
  if (sourceState.value === 'loading') sourceState.value = 'idle'
}
async function loadSource(): Promise<void> {
  const username = sourceKey.value
  if (!username || !visible.value || loadedKey === username || controller) return
  const token = ++generation
  const request = new AbortController()
  controller = request
  sourceState.value = 'loading'
  try {
    const data = await (props.activityLoader ?? loadGitHubActivity)(username, request.signal)
    if (token !== generation || request.signal.aborted) return
    fetched.value = data
    loadedKey = username
    sourceState.value = 'ready'
    emit('load', data)
  }
  catch (error) {
    if (token !== generation || request.signal.aborted) return
    sourceState.value = 'error'
    emit('error', error instanceof Error ? error : new Error(String(error)))
  }
  finally {
    if (controller === request) controller = undefined
  }
}
watch([sourceKey, () => props.activityLoader], () => {
  cancelSource()
  fetched.value = {}
  loadedKey = ''
  sourceState.value = 'idle'
  void loadSource()
})
watch(visible, (value) => {
  if (value) { if (sourceState.value !== 'error') void loadSource() }
  else { cancelSource(); clearHover() }
})
onDeactivated(cancelSource)
onBeforeUnmount(cancelSource)
function retrySource(): void {
  loadedKey = ''
  sourceState.value = 'idle'
  void loadSource()
}
/** One comparator for series timestamps, contribution days, candles and range bands. */
function coordinate(value: string | number): number {
  if (typeof value === 'number') return value
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? Date.parse(value) : Number(value)
}
const data = computed<MonoChartData>(() => {
  const base = { ...props.data, ...props.periodData?.[period.value] }
  const merged = { ...base, contributions: base.contributions ?? fetched.value.contributions, repos: base.repos ?? fetched.value.repos }
  const range = props.periods?.find(item => item.value === period.value)?.range
  if (!range) return merged
  const from = coordinate(range[0])
  const to = coordinate(range[1])
  const inside = (value: string | number) => coordinate(value) >= from && coordinate(value) <= to
  return {
    ...merged, categories: merged.categories?.filter(inside),
    series: merged.series?.map(series => ({ ...series, data: series.data.filter(point => inside(point.x)) })),
    contributions: merged.contributions?.filter(day => inside(day.date)),
    candles: merged.candles?.filter(candle => inside(candle.x)), ranges: merged.ranges?.filter(range => inside(range.x)),
  }
})
const activityAccent = computed(() => Array.isArray(props.accent) && props.accent.length < 5 ? ['transparent', ...props.accent] : props.accent)
const monthNames = computed(() => {
  const formatter = new Intl.DateTimeFormat(props.locale, { month: 'short', timeZone: 'UTC' })
  return Array.from({ length: 12 }, (_, month) => formatter.format(new Date(Date.UTC(2026, month, 1))))
})
const displayYear = computed(() => props.year ?? Number(data.value.contributions?.at(-1)?.date.slice(0, 4)))
const geometry = computed(() => buildMonoGeometry({
  variant: props.variant, data: data.value, width: width.value, height: height.value,
  seriesMode: seriesMode.value, layout: layout.value, curve: curve.value, showLine: showLine.value,
  cellSize: props.cellSize, months: props.months, showMonths: props.showMonths, accent: activityAccent.value,
  monthNames: props.variant.startsWith('mono-activity-') || props.variant === 'github-activity' ? monthNames.value : [],
  labels: labels.value,
}))
const hitIndex = computed(() => new Map(geometry.value.hits.map(hit => [hit.key, hit])))
const selected = ref<string | null>(null)
const hovered = computed(() => selected.value ? hitIndex.value.get(selected.value) ?? null : null)
const pointer = ref({ x: 0, y: 0 })
const placement = ref({ left: 0, top: 0 })
const format = (value: number | string) => typeof value === 'number' ? props.formatValue?.(value) ?? String(value) : value
const metric = computed(() => data.value.metric ?? geometry.value.total)
const centerValue = computed(() => hovered.value?.value ?? props.centerMetric ?? (props.variant === 'mono-rounded-donut' ? geometry.value.total : data.value.items?.[0]?.value ?? geometry.value.total))
const centerLabel = computed(() => hovered.value?.label ?? props.centerLabel ?? data.value.metricLabel ?? '')
const accent = computed(() => props.accentColor ?? (props.variant === 'mono-activity-blue' ? 'blue' : props.variant === 'mono-activity-purple' ? 'purple' : props.variant === 'github-activity' || props.variant === 'mono-activity-green' ? 'green' : 'mono'))
const style = computed(() => ({
  '--tx-mono-gradient': `url(#${uid}-gradient)`,
  '--tx-mono-accent': accent.value === 'blue' ? 'var(--tx-chart-categorical-1, #4290f0)' : accent.value === 'purple' ? 'var(--tx-chart-categorical-4, #8d58ee)' : accent.value === 'green' ? 'var(--tx-chart-semantic-success, #00a63e)' : 'var(--tx-mono-ink, var(--tx-text-color-primary, #303133))',
}))
async function place(): Promise<void> {
  await nextTick()
  if (!host.value || !tooltip.value || !hovered.value) return
  placement.value = placeTooltip({ pointerX: pointer.value.x, pointerY: pointer.value.y, tooltipWidth: tooltip.value.offsetWidth, tooltipHeight: tooltip.value.offsetHeight, containerWidth: host.value.clientWidth, containerHeight: host.value.clientHeight, offset: 10, follow: 'both' })
}
function hoverMark(key: string | undefined, event?: PointerEvent): void {
  if (!key || !hitIndex.value.has(key)) return
  selected.value = key
  if (host.value && event) {
    const bounds = host.value.getBoundingClientRect()
    pointer.value = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  else if (svg.value && host.value) {
    const bounds = svg.value.getBoundingClientRect()
    const hostBounds = host.value.getBoundingClientRect()
    const hit = hitIndex.value.get(key)!
    pointer.value = { x: bounds.left - hostBounds.left + hit.x / width.value * bounds.width, y: bounds.top - hostBounds.top + hit.y / height.value * bounds.height }
  }
  emit('hover', hovered.value)
  void place()
}
function clearHover(): void {
  if (selected.value !== null) { selected.value = null; emit('hover', null) }
}
function selectMark(key: string | undefined): void {
  const hit = key ? hitIndex.value.get(key) : undefined
  if (hit) emit('select', hit)
}
function navigate(event: KeyboardEvent): void {
  const hits = geometry.value.hits
  if (!hits.length) return
  if (event.key === 'Escape') { clearHover(); return }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (hovered.value) emit('select', hovered.value)
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = hits.findIndex(hit => hit.key === selected.value)
  const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? hits.length - 1 : current < 0 ? backwards ? hits.length - 1 : 0 : (current + (backwards ? -1 : 1) + hits.length) % hits.length
  hoverMark(hits[next]!.key)
}
watch(geometry, clearHover)
const legend = computed(() => data.value.items?.map((item, index) => ({ key: `item-${index}`, name: item.label, value: item.value })) ?? data.value.series?.map((series, index) => ({ key: `spark-${index}`, name: series.name, value: series.metric ?? series.data.at(-1)?.value ?? '' })) ?? [])
</script>

<template>
  <section ref="host" class="tx-mono-chart" :class="{ 'is-active': active, 'is-compact': compact }" :data-variant="variant" :style="style">
    <header v-if="title || !compact || $slots.header || controls || periods?.length" class="tx-mono-chart__header">
      <slot name="header" :metric="metric" :data="data">
        <div v-if="title || !compact" class="tx-mono-chart__summary">
          <span v-if="title" class="tx-mono-chart__title">{{ title }}</span>
          <strong class="tx-mono-chart__metric">{{ format(metric) }}</strong>
          <span v-if="data.metricLabel" class="tx-mono-chart__detail">{{ data.metricLabel }}</span>
          <span v-if="data.change" class="tx-mono-chart__detail">{{ data.change }}</span>
          <span v-if="displayYear && variant === 'github-activity'" class="tx-mono-chart__detail">{{ displayYear }}</span>
        </div>
      </slot>
      <div class="tx-mono-chart__controls">
        <div v-if="controls && variant === 'mono-rounded-line'" class="tx-mono-chart__switch">
          <button v-for="mode in (['single', 'dual'] as const)" :key="mode" type="button" :aria-pressed="seriesMode === mode" @click="seriesMode = mode">
{{ labels[mode] }}
</button>
        </div>
        <div v-if="controls && variant === 'mono-rounded-bar'" class="tx-mono-chart__switch">
          <button v-for="value in (['col', 'row'] as const)" :key="value" type="button" :aria-pressed="layout === value" @click="layout = value">
{{ labels[value] }}
</button>
        </div>
        <div v-if="controls && variant === 'mono-rounded-area'" class="tx-mono-chart__switch">
          <button v-for="value in (['monotone', 'natural'] as const)" :key="value" type="button" :aria-pressed="curve === value" @click="curve = value">
{{ labels[value] }}
</button>
        </div>
        <button v-if="controls && variant === 'mono-rounded-composed'" type="button" :aria-pressed="showLine" @click="showLine = !showLine">
{{ showLine ? labels.showLine : labels.hideLine }}
</button>
        <div v-if="periods?.length" class="tx-mono-chart__switch">
          <button v-for="item in periods" :key="item.value" type="button" :aria-pressed="period === item.value" @click="period = item.value">
{{ item.label }}
</button>
        </div>
      </div>
    </header>
    <div class="tx-mono-chart__stage">
      <svg ref="svg" :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" role="group" :aria-label="ariaLabel" :aria-describedby="hovered && showTooltip ? `${uid}-readout` : undefined" tabindex="0" @keydown="navigate" @blur="clearHover" @pointerleave="clearHover">
        <title>{{ ariaLabel }}</title>
        <defs>
          <linearGradient :id="`${uid}-gradient`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--tx-mono-ink, var(--tx-text-color-primary, #303133))" stop-opacity="0.35" />
            <stop offset="100%" stop-color="var(--tx-mono-ink, var(--tx-text-color-primary, #303133))" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <component :is="mark.tag" v-for="(mark, index) in geometry.marks" :key="index" v-bind="mark.attrs" :pointer-events="mark.hit ? undefined : 'none'" :class="[mark.className, { 'tx-mono-chart__mark': mark.hit, 'is-highlighted': mark.hit && selected === mark.hit }]" :data-hit="mark.hit" @pointerenter="hoverMark(mark.hit, $event)" @pointermove="hoverMark(mark.hit, $event)" @click="selectMark(mark.hit)">{{ mark.text }}</component>
        <g v-if="hovered && variant === 'mono-rounded-scatter'" pointer-events="none" stroke="var(--tx-chart-grid-line, var(--tx-border-color-light))" stroke-dasharray="3 3">
          <line :x1="hovered.x" :x2="hovered.x" y1="18" :y2="height - 40" />
          <line x1="46" :x2="width - 20" :y1="hovered.y" :y2="hovered.y" />
        </g>
        <g v-if="geometry.center" class="tx-mono-chart__center" pointer-events="none">
          <foreignObject :x="geometry.center.x - 55" :y="geometry.center.y - 16" width="110" height="55">
            <div xmlns="http://www.w3.org/1999/xhtml" class="tx-mono-chart__center-content">
              <slot name="center" :value="centerValue" :label="centerLabel" :hit="hovered"><strong>{{ format(centerValue) }}</strong><span>{{ centerLabel }}</span></slot>
            </div>
          </foreignObject>
        </g>
        <text v-if="!geometry.hits.length && sourceState !== 'loading'" :x="width / 2" :y="height / 2" text-anchor="middle" class="tx-mono-chart__axis">{{ labels.empty }}</text>
      </svg>
    </div>
    <div v-if="sourceState === 'loading'" class="tx-mono-chart__status" role="status">
{{ labels.loading }}
</div>
    <div v-else-if="sourceState === 'error'" class="tx-mono-chart__status" role="status">
{{ labels.error }} <button type="button" @click="retrySource">
{{ labels.retry }}
</button>
</div>
    <div v-if="hovered && showTooltip" :id="`${uid}-readout`" ref="tooltip" class="tx-mono-chart__tooltip" role="status" :style="{ left: `${placement.left}px`, top: `${placement.top}px` }">
      <slot name="tooltip" :hit="hovered">
<strong>{{ hovered.label }}</strong><span v-for="(row, index) in hovered.rows" :key="index"><span>{{ row.name }}</span><b>{{ format(row.value) }}</b></span>
</slot>
    </div>
    <div v-if="showLegend && legend.length && ['mono-rounded-donut', 'mono-rounded-radial-group', 'mono-rounded-radial-gauge', 'mono-rounded-polar'].includes(variant)" class="tx-mono-chart__legend">
      <button v-for="item in legend" :key="item.key" type="button" @pointerenter="hoverMark(item.key)" @focus="hoverMark(item.key)" @blur="clearHover" @pointerleave="clearHover" @click="selectMark(item.key)">
{{ item.name }} <span>{{ format(item.value) }}</span>
</button>
    </div>
    <div v-if="variant.startsWith('mono-activity-') || variant === 'github-activity'" class="tx-mono-chart__density">
      <span>{{ labels.less }}</span><i v-for="level in 5" :key="level" :style="{ opacity: Array.isArray(activityAccent) ? 1 : [0.08, 0.3, 0.52, 0.76, 1][level - 1], background: Array.isArray(activityAccent) ? activityAccent[level - 1] : activityAccent ?? 'var(--tx-mono-accent)' }" /><span>{{ labels.more }}</span>
    </div>
    <div v-if="variant === 'github-activity' && data.repos?.length" class="tx-mono-chart__repositories">
      <button type="button" class="tx-mono-chart__repo-toggle" :aria-expanded="open" :aria-controls="`${uid}-repos`" :aria-label="open ? labels.collapse : labels.expand" @click="open = !open">
        <span>{{ labels.repositories }}</span><span v-if="!open" class="tx-mono-chart__avatars"><span v-for="repo in data.repos.slice(0, 3)" :key="repo.name"><slot name="avatar" :repo="repo" :collapsed="true"><img v-if="repo.logo" :src="repo.logo" alt="">{{ repo.logo ? '' : repo.name.slice(0, 1) }}</slot></span></span><span aria-hidden="true">{{ open ? '−' : '+' }}</span>
      </button>
      <div :id="`${uid}-repos`" class="tx-mono-chart__repo-panel" :class="{ 'is-open': open }" :inert="!open" :aria-hidden="!open">
        <ul>
<li v-for="repo in data.repos" :key="repo.name">
<slot name="repository" :repo="repo">
<component :is="repo.href ? 'a' : 'div'" :href="repo.href" :target="repo.href ? '_blank' : undefined" :rel="repo.href ? 'noopener noreferrer' : undefined">
<slot name="avatar" :repo="repo" :collapsed="false">
<img v-if="repo.logo" :src="repo.logo" alt=""><span v-else class="tx-mono-chart__avatar-initial" aria-hidden="true">{{ repo.name.slice(0, 1) }}</span>
</slot><span>{{ repo.name }}</span><strong>{{ repo.count }}</strong>
</component>
</slot>
</li>
</ul>
      </div>
    </div>
    <slot name="footer" :data="data" />
  </section>
</template>

<style scoped lang="scss">
.tx-mono-chart {
  position: relative; min-width: 0; padding: 16px; border-radius: 24px;
  background: var(--tx-bg-color, #fff); color: var(--tx-text-color-primary, #303133);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed); font-size: 13px;
  &.is-compact { padding: 12px; border-radius: 20px; }
  &__header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  &__summary { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; }
  &__title { flex-basis: 100%; font-weight: 500; }
  &__metric { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  &__detail { color: var(--tx-text-color-regular, #606266); font-size: 12px; }
  &__controls, &__switch { display: flex; flex-wrap: wrap; gap: 3px; }
  &__switch { padding: 3px; border-radius: 16px; background: var(--tx-fill-color-light, #f5f7fa); }
  button { appearance: none; border: 0; padding: 5px 9px; border-radius: 13px; font: inherit; color: var(--tx-text-color-regular, #606266); background: transparent; cursor: pointer; }
  button[aria-pressed='true'] { color: var(--tx-text-color-primary, #303133); background: var(--tx-bg-color, #fff); box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed); }
  button:hover { color: var(--tx-text-color-primary, #303133); background: var(--tx-fill-color, #f0f2f5); }
  button:focus-visible, svg:focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: 2px; }
  &__stage { min-width: 0; border-radius: 8px; background: var(--tx-fill-color-lighter, #fafafa); }
  &__stage > svg { display: block; width: 100%; height: auto; max-height: 360px; }
  &__axis { fill: var(--tx-chart-text-primary, var(--tx-text-color-regular, #606266)); font: 11px sans-serif; }
  &__tile-label { font: 11px sans-serif; }
  &__mark { cursor: pointer; transform-box: fill-box; transform-origin: center; }
  &__mark.is-highlighted { filter: drop-shadow(0 0 2px var(--tx-chart-grid-line, var(--tx-border-color, #dcdfe6))); }
  &__center-content { display: flex; flex-direction: column; text-align: center; gap: 4px; font-size: 12px; }
  &__center-content strong { font-size: 18px; font-weight: 600; }
  &__center-content span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__tooltip { pointer-events: none; position: absolute; z-index: 2; max-width: calc(100% - 20px); padding: 8px 10px; border-radius: 10px; color: var(--tx-text-color-primary, #303133); background: var(--tx-bg-color, #fff); box-shadow: 0 0 0 1px var(--tx-border-color, #dcdfe6), 2px 4px 12px var(--tx-chart-grid-line, #dcdfe6); display: flex; flex-direction: column; gap: 5px; }
  &__tooltip > span { display: flex; gap: 20px; justify-content: space-between; }
  &__tooltip b, &__tooltip strong { font-weight: 500; }
  &__legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; }
  &__legend button { display: flex; gap: 6px; font-size: 12px; }
  &__density { display: flex; gap: 4px; justify-content: flex-end; align-items: center; margin-top: 8px; font-size: 12px; }
  &__density i { width: 10px; height: 10px; border-radius: 2px; background: var(--tx-mono-accent); }
  &__repositories { margin-top: 12px; border-radius: 12px; background: var(--tx-fill-color-light, #f5f7fa); }
  button.tx-mono-chart__repo-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; text-align: left; }
  &__repo-toggle > span:first-child { flex: 1; }
  &__avatars { display: flex; }
  &__avatars > span { width: 26px; height: 26px; margin-left: -5px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--tx-fill-color, #f0f2f5); box-shadow: 0 0 0 2px var(--tx-bg-color, #fff); }
  &__avatars img { width: 100%; height: 100%; object-fit: cover; }
  &__repo-panel { display: grid; grid-template-rows: 0fr; visibility: hidden; }
  &__repo-panel.is-open { grid-template-rows: 1fr; visibility: visible; }
  &__repo-panel ul { min-height: 0; overflow: hidden; list-style: none; margin: 0; padding: 0 8px; }
  &__repo-panel li > a, &__repo-panel li > div { display: flex; align-items: center; gap: 8px; color: inherit; padding: 8px; text-decoration: none; }
  &__repo-panel li img { width: 24px; height: 24px; border-radius: 50%; }
  &__repo-panel li span { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  &__repo-panel li span.tx-mono-chart__avatar-initial { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--tx-fill-color, #f0f2f5); }
  &__repo-panel li strong { font-weight: 500; }
  &__status { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 8px; }
}
@media (prefers-reduced-motion: no-preference) {
  .tx-mono-chart.is-active .tx-mono-chart__repo-panel { transition: grid-template-rows 320ms ease; }
  .tx-mono-chart.is-active .tx-mono-chart__mark { transition: transform 200ms ease; }
  .tx-mono-chart[data-variant='mono-rounded-donut'] .tx-mono-chart__mark.is-highlighted { transform-box: view-box; transform: scale(1.05); }
  .tx-mono-chart[data-variant^='mono-activity-'] .tx-mono-chart__mark.is-highlighted,
  .tx-mono-chart[data-variant='github-activity'] .tx-mono-chart__mark.is-highlighted { transform: scale(1.35); }
  .tx-mono-chart[data-variant='mono-rounded-heatmap'] .tx-mono-chart__mark.is-highlighted { transform: scale(1.1); }
  .tx-mono-chart[data-variant='mono-rounded-pyramid'] .tx-mono-chart__mark.is-highlighted { transform: scale(1.05); }
  .tx-mono-chart[data-variant='mono-rounded-treemap'] .tx-mono-chart__mark.is-highlighted { transform: scale(1.02); }
}
</style>
