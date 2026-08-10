<script lang="ts" name="ToolChartCard" setup>
import { TxButton } from '@talex-touch/tuffex'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'

/**
 * Renders a validated chart spec produced by the `tuff_render_chart` tool.
 *
 * The spec is declarative and was checked in the main process, so nothing the
 * model wrote is executed here — this maps fixed fields onto ECharts options.
 */
export interface ToolChartSpec {
  type: string
  title?: string
  labels: string[]
  series: Array<{ name?: string; values: number[] }>
  xLabel?: string
  yLabel?: string
  stacked?: boolean
  showValues?: boolean
}

const props = withDefaults(
  defineProps<{
    spec: ToolChartSpec
    /**
     * Entry animation. The transcript virtualizes rows, so a chart scrolled
     * away and back REMOUNTS — replaying the draw-in every time read as the
     * chart "reloading". The host passes true only for the original live
     * render; remounts draw the settled picture in one frame.
     */
    animate?: boolean
  }>(),
  { animate: false }
)

const { t } = useI18n()

const hostRef = ref<HTMLElement | null>(null)
// `shallowRef`: an ECharts instance is a large mutable object and making it
// reactive would proxy its whole internal graph.
const chart = shallowRef<{
  setOption: (option: unknown, notMerge?: boolean) => void
  resize: () => void
  dispose: () => void
} | null>(null)
const failed = ref(false)
let observer: ResizeObserver | null = null

// ============================================================================
// Workbench state — the chart is a surface to work *on*, not a picture:
// series filtering, a view switch, a zoom window, and inline data CRUD. All
// of it view-local: the model's spec stays the source record, edits live as
// an exploration layer on top.
// ============================================================================

/** Matches ECharts' default palette order, for the series chips. */
const SERIES_COLORS = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272']

const CARTESIAN = new Set(['bar', 'line', 'area', 'scatter'])

const isCartesian = computed(() => CARTESIAN.has(props.spec.type))

/** null = the spec's own type; only the cartesian family may switch views. */
const view = ref<'line' | 'bar' | 'area' | null>(null)
const VIEW_OPTIONS = ['line', 'bar', 'area'] as const

/** Hidden series, by index into the spec's series array. */
const hiddenSeries = reactive(new Set<number>())

function toggleSeries(index: number): void {
  if (hiddenSeries.has(index)) hiddenSeries.delete(index)
  else if (hiddenSeries.size < props.spec.series.length - 1) hiddenSeries.add(index)
}

/** Drives the data-editing dialog, which flips open from the toolbar button. */
const editing = ref(false)

/** The editable copy; created lazily so an untouched chart carries no fork. */
const draft = ref<{ labels: string[]; series: Array<{ name?: string; values: number[] }> } | null>(
  null
)

function ensureDraft(): NonNullable<typeof draft.value> {
  draft.value ??= {
    labels: [...props.spec.labels],
    series: props.spec.series.map((entry) => ({ ...entry, values: [...entry.values] }))
  }
  return draft.value
}

const newLabel = ref('')

function addRow(): void {
  const label = newLabel.value.trim()
  if (!label) return
  const data = ensureDraft()
  data.labels.push(label)
  for (const entry of data.series) entry.values.push(0)
  newLabel.value = ''
}

function removeRow(index: number): void {
  const data = ensureDraft()
  data.labels.splice(index, 1)
  for (const entry of data.series) entry.values.splice(index, 1)
}

function setCell(seriesIndex: number, rowIndex: number, raw: string): void {
  const numeric = Number(raw)
  const data = ensureDraft()
  const entry = data.series[seriesIndex]
  if (entry) entry.values[rowIndex] = Number.isFinite(numeric) ? numeric : 0
}

function setLabel(rowIndex: number, raw: string): void {
  ensureDraft().labels[rowIndex] = raw
}

/** What actually renders: draft over spec, minus hidden series, view applied. */
const effectiveSpec = computed<ToolChartSpec>(() => {
  const base = draft.value ?? props.spec
  return {
    ...props.spec,
    type: view.value && isCartesian.value ? view.value : props.spec.type,
    labels: base.labels,
    series: base.series.filter((_, index) => !hiddenSeries.has(index))
  }
})

/** The rows the edit table shows — always the full, unfiltered data. */
const tableSeries = computed(() => (draft.value ?? props.spec).series)
const tableLabels = computed(() => (draft.value ?? props.spec).labels)

/** Shell tokens read off the live element, so both themes render true. */
interface ChartInk {
  primary: string
  secondary: string
  hairline: string
}

function buildOption(
  spec: ToolChartSpec,
  ink: ChartInk,
  animate: boolean
): Record<string, unknown> {
  const label = spec.showValues ? { label: { show: true, fontSize: 10 } } : {}
  const legend =
    spec.series.length > 1
      ? { legend: { bottom: 0, textStyle: { fontSize: 11, color: ink.secondary } } }
      : {}
  const common = {
    animation: animate,
    backgroundColor: 'transparent',
    textStyle: { color: ink.secondary },
    ...(spec.title
      ? {
          title: {
            text: spec.title,
            left: 'center',
            textStyle: { fontSize: 13, color: ink.primary }
          }
        }
      : {}),
    tooltip: {},
    ...legend
  }

  // Radial and single-value families each need their own coordinate system, so
  // they are built whole rather than layered onto the cartesian defaults.
  if (spec.type === 'pie' || spec.type === 'doughnut') {
    // One ring only: later series would silently stack on top of each other.
    const values = spec.series[0]?.values ?? []
    return {
      ...common,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: spec.type === 'doughnut' ? ['42%', '68%'] : '62%',
          data: spec.labels.map((name, index) => ({ name, value: values[index] ?? 0 })),
          ...label
        }
      ]
    }
  }

  if (spec.type === 'radar') {
    const max = Math.max(...spec.series.flatMap((entry) => entry.values), 0) || 1
    return {
      ...common,
      radar: { indicator: spec.labels.map((name) => ({ name, max })) },
      series: [
        {
          type: 'radar',
          data: spec.series.map((entry) => ({ name: entry.name, value: entry.values }))
        }
      ]
    }
  }

  if (spec.type === 'funnel') {
    const values = spec.series[0]?.values ?? []
    return {
      ...common,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'funnel',
          data: spec.labels.map((name, index) => ({ name, value: values[index] ?? 0 })),
          ...label
        }
      ]
    }
  }

  if (spec.type === 'gauge') {
    // A gauge shows one reading; the first value is it.
    const value = spec.series[0]?.values[0] ?? 0
    return {
      ...common,
      legend: undefined,
      series: [
        {
          type: 'gauge',
          detail: { fontSize: 16, valueAnimation: true },
          data: [{ value, name: spec.series[0]?.name ?? spec.labels[0] ?? '' }]
        }
      ]
    }
  }

  if (spec.type === 'heatmap') {
    const rows = spec.series.map((entry) => entry.name ?? '')
    const data = spec.series.flatMap((entry, y) => entry.values.map((value, x) => [x, y, value]))
    const max = Math.max(...spec.series.flatMap((entry) => entry.values), 0) || 1
    return {
      ...common,
      legend: undefined,
      grid: { left: 60, right: 16, top: spec.title ? 48 : 24, bottom: 56 },
      xAxis: { type: 'category', data: spec.labels },
      yAxis: { type: 'category', data: rows },
      visualMap: { min: 0, max, calculable: true, orient: 'horizontal', left: 'center', bottom: 0 },
      series: [{ type: 'heatmap', data, ...label }]
    }
  }

  // Cartesian family: bar, line, area (a filled line) and scatter.
  const axisInk = {
    axisLabel: { color: ink.secondary },
    axisLine: { lineStyle: { color: ink.hairline } },
    splitLine: { lineStyle: { color: ink.hairline } },
    nameTextStyle: { color: ink.secondary }
  }
  const legendPresent = spec.series.length > 1
  // The zoom window is the range/time filter: wheel to zoom, drag the rail to
  // pan. Only once there are enough points for a window to mean anything.
  const zoomPresent = spec.labels.length > 6
  return {
    ...common,
    tooltip: { trigger: 'axis' },
    ...(zoomPresent
      ? {
          dataZoom: [
            { type: 'inside' },
            { type: 'slider', height: 14, bottom: legendPresent ? 22 : 2, brushSelect: false }
          ]
        }
      : {}),
    grid: {
      left: 48,
      right: 16,
      top: spec.title ? 48 : 24,
      bottom: 28 + (legendPresent ? 16 : 0) + (zoomPresent ? 20 : 0)
    },
    xAxis: {
      type: 'category',
      data: spec.labels,
      ...axisInk,
      ...(spec.xLabel ? { name: spec.xLabel } : {})
    },
    yAxis: { type: 'value', ...axisInk, ...(spec.yLabel ? { name: spec.yLabel } : {}) },
    series: spec.series.map((entry) => ({
      type: spec.type === 'area' ? 'line' : spec.type,
      ...(entry.name ? { name: entry.name } : {}),
      data: entry.values,
      ...(spec.type === 'line' || spec.type === 'area' ? { smooth: true } : {}),
      ...(spec.type === 'area' ? { areaStyle: {} } : {}),
      ...(spec.stacked && spec.type !== 'scatter' ? { stack: 'total' } : {}),
      ...label
    }))
  }
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

function readInk(host: HTMLElement): ChartInk {
  const style = getComputedStyle(host)
  return {
    primary:
      style.getPropertyValue('--shell-text-primary').trim() || (isDark() ? '#f5f5f7' : '#1c1c1e'),
    secondary: style.getPropertyValue('--shell-text-secondary').trim() || '#6b7280',
    hairline: style.getPropertyValue('--shell-border').trim() || (isDark() ? '#333335' : '#e4e4e7')
  }
}

/** Once the reader works the chart, updates morph instead of re-drawing. */
const interacted = computed(
  () => draft.value !== null || hiddenSeries.size > 0 || view.value !== null
)

async function render(reinit = false): Promise<void> {
  const host = hostRef.value
  if (!host) return

  try {
    // Imported on demand: charts are rare in a conversation and echarts is
    // heavy enough that the home surface should not pay for it up front.
    const echarts = await import('echarts')
    const option = buildOption(
      effectiveSpec.value,
      readInk(host),
      props.animate || interacted.value
    )
    if (chart.value && !reinit) {
      // In-place update: filtering, edits and view switches morph the marks.
      chart.value.setOption(option, true)
    } else {
      chart.value?.dispose()
      // The dark theme supplies series palettes; every piece of *text* is
      // overridden from the shell tokens so the chart reads in both themes.
      const instance = echarts.init(host, isDark() ? 'dark' : undefined, { renderer: 'canvas' })
      instance.setOption(option)
      chart.value = instance as unknown as typeof chart.value
    }
    failed.value = false
  } catch {
    failed.value = true
  }
}

/** The app flips `.dark` on <html>; charts re-render in the new palette. */
let themeObserver: MutationObserver | null = null

onMounted(() => {
  void render()
  if (typeof ResizeObserver !== 'undefined' && hostRef.value) {
    observer = new ResizeObserver(() => chart.value?.resize())
    observer.observe(hostRef.value)
  }
  if (typeof MutationObserver !== 'undefined') {
    // A theme flip swaps the palette, which needs a fresh init.
    themeObserver = new MutationObserver(() => void render(true))
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
  }
})

watch(effectiveSpec, () => void render())

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  themeObserver?.disconnect()
  themeObserver = null
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div class="ToolChartCard">
    <div v-if="!failed" class="ToolChartCard-Toolbar">
      <div class="ToolChartCard-Chips">
        <button
          v-for="(entry, index) in tableSeries"
          :key="index"
          class="ToolChartCard-Chip"
          :class="{ 'is-off': hiddenSeries.has(index) }"
          type="button"
          :aria-pressed="!hiddenSeries.has(index)"
          @click="toggleSeries(index)"
        >
          <span
            class="ToolChartCard-ChipDot"
            :style="{ background: SERIES_COLORS[index % SERIES_COLORS.length] }"
          />
          <span>{{ entry.name || `#${index + 1}` }}</span>
        </button>
      </div>

      <div class="ToolChartCard-Tools">
        <div v-if="isCartesian" class="ToolChartCard-Views" role="group">
          <button
            v-for="option in VIEW_OPTIONS"
            :key="option"
            class="ToolChartCard-View"
            :class="{ 'is-active': (view ?? spec.type) === option }"
            type="button"
            @click="view = option === spec.type ? null : option"
          >
            {{ t(`home.chartView.${option}`) }}
          </button>
        </div>
        <FlipDialog
          v-model="editing"
          :header-title="t('home.chartEdit')"
          :header-desc="spec.title"
          size="md"
          max-height="min(72dvh, 640px)"
        >
          <template #reference>
            <button
              class="ToolChartCard-Edit"
              :class="{ 'is-active': editing }"
              type="button"
              aria-haspopup="dialog"
              :aria-expanded="editing"
            >
              <span class="i-ri-table-line" />
              <span>{{ t('home.chartEdit') }}</span>
            </button>
          </template>

          <template #header-actions="{ close }">
            <TxButton variant="flat" size="sm" @click="close">
              {{ t('home.chartDone') }}
            </TxButton>
          </template>

          <template #default>
            <div class="ToolChartCard-Editor">
              <table class="ToolChartCard-Table">
                <thead>
                  <tr>
                    <th>{{ t('home.chartLabel') }}</th>
                    <th v-for="(entry, index) in tableSeries" :key="index">
                      {{ entry.name || `#${index + 1}` }}
                    </th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(label, rowIndex) in tableLabels" :key="rowIndex">
                    <td>
                      <input
                        class="ToolChartCard-Input"
                        :value="label"
                        @change="setLabel(rowIndex, ($event.target as HTMLInputElement).value)"
                      />
                    </td>
                    <td v-for="(entry, seriesIndex) in tableSeries" :key="seriesIndex">
                      <input
                        class="ToolChartCard-Input is-number"
                        type="number"
                        :value="entry.values[rowIndex] ?? 0"
                        @change="
                          setCell(seriesIndex, rowIndex, ($event.target as HTMLInputElement).value)
                        "
                      />
                    </td>
                    <td>
                      <button
                        class="ToolChartCard-RowBtn"
                        type="button"
                        :aria-label="t('home.chartRemove')"
                        @click="removeRow(rowIndex)"
                      >
                        <span class="i-ri-delete-bin-line" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <form class="ToolChartCard-AddRow" @submit.prevent="addRow">
                <input
                  v-model="newLabel"
                  class="ToolChartCard-Input"
                  :placeholder="t('home.chartAddPlaceholder')"
                />
                <button class="ToolChartCard-AddBtn" type="submit" :disabled="!newLabel.trim()">
                  <span class="i-ri-add-line" />
                  <span>{{ t('home.chartAdd') }}</span>
                </button>
              </form>
            </div>
          </template>
        </FlipDialog>
      </div>
    </div>

    <div v-show="!failed" ref="hostRef" class="ToolChartCard-Canvas" />

    <p v-if="failed" class="ToolChartCard-Failed" role="alert">
      {{ $t('home.chartFailed') }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.ToolChartCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.ToolChartCard-Toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.ToolChartCard-Chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ToolChartCard-Chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-secondary);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;
  transition:
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--shell-border-strong);
  }

  &.is-off {
    opacity: 0.45;

    .ToolChartCard-ChipDot {
      background: var(--shell-text-muted) !important;
    }
  }
}

.ToolChartCard-ChipDot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.ToolChartCard-Tools {
  display: flex;
  gap: 6px;
  align-items: center;
}

.ToolChartCard-Views {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
}

.ToolChartCard-View {
  height: 20px;
  padding: 0 9px;
  border: none;
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-muted);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.ToolChartCard-Edit {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-secondary);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    border-color: var(--shell-border-strong);
  }

  &.is-active {
    border-color: var(--shell-primary-border);
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

.ToolChartCard-Canvas {
  width: 100%;
  height: 260px;
}

// Lives in the flip dialog body, which carries no padding of its own.
.ToolChartCard-Editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 16px 16px;
}

.ToolChartCard-Table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--shell-fs-caption);

  th {
    padding: 2px 6px;
    color: var(--shell-text-muted);
    font-weight: 500;
    text-align: left;
  }

  td {
    padding: 2px 6px 2px 0;
  }
}

.ToolChartCard-Input {
  width: 100%;
  min-width: 64px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: var(--shell-primary);
  }

  &.is-number {
    text-align: right;
  }
}

.ToolChartCard-RowBtn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  cursor: pointer;

  &:hover {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }
}

.ToolChartCard-AddRow {
  display: flex;
  gap: 6px;
  align-items: center;

  .ToolChartCard-Input {
    max-width: 220px;
  }
}

.ToolChartCard-AddBtn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: var(--shell-surface);
  }
}

.ToolChartCard-Failed {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}
</style>
