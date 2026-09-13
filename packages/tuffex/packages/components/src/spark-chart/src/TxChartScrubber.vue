<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// The stage that wraps a chart: pointer→index mapping, the cursor hairline and
// the edge-clamped tooltip. Deliberately DOM-only — upstream paints none of
// this into the canvas either, which is what keeps the tooltip selectable and
// the cursor crisp at any device pixel ratio.

import type { ChartScrubberEmits, ChartScrubberProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clampAnchorCenter, indexFromPointerX, plotX, ratioFromIndex } from './geometry'

defineOptions({ name: 'TxChartScrubber' })

const props = withDefaults(defineProps<ChartScrubberProps>(), {
  activeIndex: undefined,
  rows: undefined,
  timeLabel: undefined,
  tooltip: true,
  anchorMargin: 8,
  disabled: false,
})

const emit = defineEmits<ChartScrubberEmits>()

defineSlots<{
  /** The chart itself. */
  default?: () => unknown
  /** Replaces the whole tooltip body. */
  tooltip?: (props: { index: number, rows: ChartScrubberProps['rows'] }) => unknown
}>()

const internalIndex = ref<number | null>(null)
// `activeIndex` left undefined means the host does not care about the pointer
// transient; the component owns it and still reports through `@scrub`.
const isControlled = computed(() => props.activeIndex !== undefined)
const activeIndex = computed<number | null>(() =>
  isControlled.value ? (props.activeIndex ?? null) : internalIndex.value,
)

const stageEl = ref<HTMLElement | null>(null)
const anchorEl = ref<HTMLElement | null>(null)
const stageWidth = ref(0)
const anchorWidth = ref(0)
const plotInset = ref({ left: 0, right: 0 })

/** Sample progress (0–1) inside the plot box, used before the stage is measured. */
const cursorRatio = computed(() => ratioFromIndex(activeIndex.value ?? 0, props.pointCount))
const cursorLeft = computed(() => `${plotX(activeIndex.value ?? 0, props.pointCount, plotInset.value, stageWidth.value)}px`)
const anchorLeft = computed(() => {
  const center = plotX(activeIndex.value ?? 0, props.pointCount, plotInset.value, stageWidth.value)
  if (!stageWidth.value || !anchorWidth.value)
    return `${cursorRatio.value * 100}%`
  return `${clampAnchorCenter(center, anchorWidth.value / 2, stageWidth.value, props.anchorMargin)}px`
})
const announcement = computed(() => activeIndex.value === null
  ? ''
  : [props.timeLabel, ...(props.rows ?? []).map(row => `${row.label}: ${row.value}`)]
      .filter((part): part is string => Boolean(part))
      .join(', '),
)

function commit(next: number | null): void {
  if (next === activeIndex.value)
    return

  if (!isControlled.value)
    internalIndex.value = next

  emit('update:activeIndex', next)
  if (next === null)
    emit('leave')
  else
    emit('scrub', next)
}

/**
 * The chart publishes its own horizontal gutters as `--tx-bui-plot-left/right`
 * on the element the scrubber wraps, so the crosshair and the drawn samples
 * cannot drift apart when a host pads its chart.
 */
function measure(): void {
  const stage = stageEl.value
  if (!stage)
    return
  const rect = readRect(stage)
  stageWidth.value = rect.width
  anchorWidth.value = readRect(anchorEl.value).width

  const chart = stage.firstElementChild as HTMLElement | null
  const offset = chart ? readRect(chart).left - rect.left : 0
  const style = chart && typeof getComputedStyle === 'function' ? getComputedStyle(chart) : null
  plotInset.value = {
    left: offset + readNumber(style?.getPropertyValue('--tx-bui-plot-left')),
    right: readNumber(style?.getPropertyValue('--tx-bui-plot-right')),
  }
}

function readRect(el: HTMLElement | null): { left: number, width: number } {
  if (!el)
    return { left: 0, width: 0 }
  const rect = el.getBoundingClientRect()
  return { left: rect.left, width: rect.width }
}

function readNumber(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function indexFromPointer(event: PointerEvent): number {
  const stage = event.currentTarget as HTMLElement | null
  if (!stage)
    return 0
  return indexFromPointerX(event.clientX, readRect(stage), props.pointCount, plotInset.value)
}

function handlePointer(event: PointerEvent): void {
  if (props.disabled || props.pointCount <= 0)
    return
  commit(indexFromPointer(event))
}

function handleLeave(): void {
  commit(null)
}

let observer: ResizeObserver | null = null

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && stageEl.value) {
    observer = new ResizeObserver(measure)
    observer.observe(stageEl.value)
  }
})

// The anchor only exists while a tooltip is showing, and its width follows the
// rows it is handed, so both are re-read once a tooltip lands.
watch(anchorEl, (el) => {
  if (el && typeof ResizeObserver !== 'undefined') {
    observer ??= new ResizeObserver(measure)
    observer.observe(el)
  }
  nextTick(measure)
})

watch(() => props.rows, () => nextTick(measure))
watch(() => props.pointCount, () => nextTick(measure))

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div
    ref="stageEl"
    class="tx-bui-chart-scrubber"
    :class="{ 'is-active': activeIndex !== null, 'is-disabled': disabled }"
    @pointerdown="handlePointer"
    @pointermove="handlePointer"
    @pointerup="handleLeave"
    @pointerleave="handleLeave"
    @pointercancel="handleLeave"
  >
    <slot />

    <template v-if="activeIndex !== null">
      <span
        class="tx-bui-chart-scrubber__cursor"
        aria-hidden="true"
        :style="{ left: cursorLeft }"
      />
      <span
        v-if="tooltip"
        ref="anchorEl"
        class="tx-bui-chart-scrubber__anchor"
        role="tooltip"
        :style="{ left: anchorLeft }"
      >
        <slot name="tooltip" :index="activeIndex" :rows="rows">
          <span class="tx-bui-chart-scrubber__tooltip">
            <span v-if="timeLabel" class="tx-bui-chart-scrubber__time">{{ timeLabel }}</span>
            <span
              v-for="row in rows"
              :key="row.label"
              class="tx-bui-chart-scrubber__row"
            >
              <span class="tx-bui-chart-scrubber__label">
                <span
                  v-if="row.color"
                  class="tx-bui-chart-scrubber__dot"
                  :style="{ background: row.color }"
                />
                {{ row.label }}
              </span>
              <span class="tx-bui-chart-scrubber__value">{{ row.value }}</span>
            </span>
          </span>
        </slot>
      </span>
      <span class="tx-bui-chart-scrubber__announcement" aria-live="polite">{{ announcement }}</span>
    </template>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-chart-scrubber {
  @include bui-scope;

  position: relative;
  overflow: hidden;
  // Vertical scrolling must survive a drag across the stage; only the
  // horizontal axis belongs to the scrubber.
  touch-action: pan-y;
  // Crosshair, not grab: nothing is being picked up and moved. Sweeping the
  // pointer reads a value off the series, and the component draws its own
  // vertical rule to show where — the readout idiom, so the readout cursor.
  cursor: crosshair;

  &.is-disabled {
    cursor: default;
    touch-action: auto;
  }
}

.tx-bui-chart-scrubber__cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 4;
  width: 1px;
  pointer-events: none;
  background: var(--tx-bui-ink, #1f2124);
  opacity: 0.26;
}

.tx-bui-chart-scrubber__anchor {
  position: absolute;
  top: 8px;
  z-index: 5;
  pointer-events: none;
  transform: translateX(-50%);
}

.tx-bui-chart-scrubber__tooltip {
  display: block;
  min-width: 154px;
  padding: 9px 10px;
  font-size: 12px;
  color: var(--tx-bui-tooltip-fg, #f6f7f8);
  background: var(--tx-bui-tooltip-bg, #25272b);
  border: 1px solid var(--tx-bui-tooltip-border, #3a3c40);
  border-radius: 10px;
  box-shadow: var(--tx-bui-shadow-overlay, 0 0 0 1px #ecedef, 0 8px 28px #0000001a);
}

.tx-bui-chart-scrubber__time {
  display: block;
  margin-bottom: 7px;
  font-size: 11px;
  color: var(--tx-bui-tooltip-muted, #a5a8ad);
}

.tx-bui-chart-scrubber__row {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  line-height: 1.65;
}

.tx-bui-chart-scrubber__label {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  color: var(--tx-bui-tooltip-fg, #f6f7f8);
}

.tx-bui-chart-scrubber__dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tx-bui-chart-scrubber__value {
  @include bui-tabular-nums;

  font-weight: 500;
  color: var(--tx-bui-tooltip-muted, #a5a8ad);
}

.tx-bui-chart-scrubber__announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
