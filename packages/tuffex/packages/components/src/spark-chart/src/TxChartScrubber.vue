<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// The stage that wraps a chart: pointer→index mapping, the cursor hairline and
// the edge-clamped tooltip. Deliberately DOM-only — upstream paints none of
// this into the canvas either, which is what keeps the tooltip selectable and
// the cursor crisp at any device pixel ratio.

import type { ChartScrubberEmits, ChartScrubberProps } from './types'
import { computed, ref } from 'vue'
import { clampAnchorPercent, indexFromRatio, ratioFromIndex } from './geometry'

defineOptions({ name: 'TxChartScrubber' })

const props = withDefaults(defineProps<ChartScrubberProps>(), {
  activeIndex: undefined,
  rows: undefined,
  timeLabel: undefined,
  tooltip: true,
  anchorMin: 28,
  anchorMax: 72,
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

const cursorPercent = computed(() =>
  activeIndex.value === null ? 0 : ratioFromIndex(activeIndex.value, props.pointCount) * 100,
)
const anchorPercent = computed(() =>
  clampAnchorPercent(cursorPercent.value, props.anchorMin, props.anchorMax),
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

function indexFromPointer(event: PointerEvent): number {
  const stage = event.currentTarget as HTMLElement | null
  if (!stage)
    return 0
  const rect = stage.getBoundingClientRect()
  const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
  return indexFromRatio(ratio, props.pointCount)
}

function handlePointer(event: PointerEvent): void {
  if (props.disabled || props.pointCount <= 0)
    return
  commit(indexFromPointer(event))
}

function handleLeave(): void {
  commit(null)
}
</script>

<template>
  <div
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
        :style="{ left: `${cursorPercent}%` }"
      />
      <span
        v-if="tooltip"
        class="tx-bui-chart-scrubber__anchor"
        aria-hidden="true"
        :style="{ left: `${anchorPercent}%` }"
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

  &.is-disabled {
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
</style>
