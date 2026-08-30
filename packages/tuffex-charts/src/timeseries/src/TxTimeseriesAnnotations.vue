<script setup lang="ts">
// Marker/threshold annotation layer — the SVG equivalent of the markLine
// annotations kumo builds in timeseries-markers.ts / timeseries-thresholds.ts.

import type { TimeseriesMarkerCluster, TimeseriesThreshold } from './types'
import { computed } from 'vue'
import { useChartContext } from '../../core/context'
import { xPosition } from '../../core/scales'

defineOptions({ name: 'TxTimeseriesAnnotations' })

const props = withDefaults(defineProps<{
  clusters?: TimeseriesMarkerCluster[]
  thresholds?: TimeseriesThreshold[]
  /** Container-px x of the hover crosshair; null hides it. */
  crosshairX?: number | null
}>(), {
  clusters: () => [],
  thresholds: () => [],
  crosshairX: null,
})

const emit = defineEmits<{
  markerEnter: [cluster: TimeseriesMarkerCluster]
  markerLeave: []
}>()

const ctx = useChartContext('TxTimeseriesAnnotations')

const DASH: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '4 4',
  dotted: '1 3',
}

const markerLines = computed(() => {
  const xs = ctx.xScale.value
  if (!xs)
    return []
  return props.clusters.map((cluster, index) => ({
    key: `${cluster.timestamp}-${index}`,
    x: xPosition(xs, cluster.timestamp),
    dash: DASH[cluster.lineStyle ?? 'dashed'],
    color: cluster.color,
    label: cluster.label,
    cluster,
  }))
})

const thresholdLines = computed(() => {
  const ys = ctx.yScale.value
  if (!ys)
    return []
  return props.thresholds.map((threshold, index) => ({
    key: `${threshold.value}-${index}`,
    y: ys(threshold.value),
    color: threshold.color,
    label: threshold.label,
  }))
})

const crosshair = computed(() => {
  const x = props.crosshairX
  if (x === null)
    return null
  const plot = ctx.plot.value
  if (x < plot.x || x > plot.x + plot.width)
    return null
  return x
})
</script>

<template>
  <g class="tx-ts-annotations">
    <line
      v-if="crosshair !== null"
      class="tx-ts-annotations__crosshair"
      :x1="crosshair"
      :y1="ctx.plot.value.y"
      :x2="crosshair"
      :y2="ctx.plot.value.y + ctx.plot.value.height"
    />

    <g
      v-for="marker in markerLines"
      :key="marker.key"
      class="tx-ts-annotations__marker"
      @pointerenter="emit('markerEnter', marker.cluster)"
      @pointerleave="emit('markerLeave')"
    >
      <line
        class="tx-ts-annotations__marker-line"
        :x1="marker.x"
        :y1="ctx.plot.value.y"
        :x2="marker.x"
        :y2="ctx.plot.value.y + ctx.plot.value.height"
        :stroke="marker.color ?? undefined"
        :stroke-dasharray="marker.dash"
      />
      <line
        class="tx-ts-annotations__marker-hit"
        :x1="marker.x"
        :y1="ctx.plot.value.y"
        :x2="marker.x"
        :y2="ctx.plot.value.y + ctx.plot.value.height"
      />
      <text
        v-if="marker.label"
        class="tx-ts-annotations__marker-label"
        :x="marker.x + 4"
        :y="ctx.plot.value.y + 4"
        dominant-baseline="hanging"
        :fill="marker.color ?? undefined"
      >
        {{ marker.label }}
      </text>
    </g>

    <g
      v-for="threshold in thresholdLines"
      :key="threshold.key"
      class="tx-ts-annotations__threshold"
    >
      <line
        class="tx-ts-annotations__threshold-line"
        :x1="ctx.plot.value.x"
        :y1="threshold.y"
        :x2="ctx.plot.value.x + ctx.plot.value.width"
        :y2="threshold.y"
        :stroke="threshold.color"
      />
      <text
        v-if="threshold.label"
        class="tx-ts-annotations__threshold-label"
        :x="ctx.plot.value.x + ctx.plot.value.width - 4"
        :y="threshold.y - 4"
        text-anchor="end"
        :fill="threshold.color"
      >
        {{ threshold.label }}
      </text>
    </g>
  </g>
</template>

<style lang="scss" scoped>
.tx-ts-annotations {
  &__crosshair {
    stroke: var(--tx-chart-grid-line, rgb(107 114 128 / 20%));
    stroke-width: 1;
  }

  &__marker-line {
    stroke: var(--tx-chart-text-primary, #6b7280);
    stroke-width: 1;
  }

  &__marker:hover &__marker-line {
    stroke-width: 2;
  }

  &__marker-hit {
    stroke: transparent;
    stroke-width: 10;
    // The invisible fat line is the pointer target for the marker tooltip.
    pointer-events: stroke;
  }

  &__marker-label,
  &__threshold-label {
    font-size: 11px;
    // Halo instead of a measured pill: readable over series without layout.
    paint-order: stroke;
    stroke: var(--tx-chart-marker-label-bg, rgb(255 255 255 / 60%));
    stroke-width: 3;
    stroke-linejoin: round;
  }

  &__marker-label {
    fill: var(--tx-chart-text-primary, #6b7280);
  }

  &__threshold-line {
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
}
</style>
