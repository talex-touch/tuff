<script setup lang="ts" generic="T">
// API surface modeled on Cloudflare kumo's ChoroplethMap (MIT); d3-geo + SVG.
// Continuous shading interpolates the theme ramp with CSS color-mix, so fills
// follow light/dark with no JS color parsing.

import type { ChoroplethMapProps } from './types'
import { computed, ref, shallowRef } from 'vue'
import { resolveAccessor } from './accessor'
import { rampColor, rampGradient } from './color'
import { useMapBase, useMapEmphasis } from './use-map-base'

defineOptions({ name: 'TxChoroplethMap' })

const props = withDefaults(defineProps<ChoroplethMapProps<T>>(), {
  zoom: 1.25,
  roam: false,
  nameProperty: 'name',
  showTooltip: true,
  showLegend: false,
  valueFormat: (value: number) => value.toLocaleString(),
})

const emit = defineEmits<{
  /** Pointer entered/left a region with data (undefined on leave). */
  regionHover: [row: T | undefined]
  /** A region with data was clicked. */
  regionClick: [row: T]
}>()

defineSlots<{
  /** Replaces the default tooltip body. */
  tooltip?: (slotProps: { row: T, regionName: string, value: number }) => unknown
}>()

/**
 * Rows reserved below the plot for the colour legend. The legend is a normal
 * row in the container (not an overlay), and the projection gets the same
 * inset, so a country can never end up underneath it. Mirrored into CSS through
 * the `--tx-map-legend-inset` custom property.
 */
const LEGEND_INSET = 22

const base = useMapBase(props, {
  heightInset: () => props.showLegend ? LEGEND_INSET : 0,
})

const joined = computed(() => {
  const map = new Map<string, { row: T, value: number }>()
  for (const row of props.data) {
    map.set(resolveAccessor<T, string>(row, props.name), {
      row,
      value: resolveAccessor<T, number>(row, props.value),
    })
  }
  return map
})

const extent = computed<[number, number]>(() => {
  const values = [...joined.value.values()].map(entry => entry.value)
  const lo = props.min ?? (values.length ? Math.min(...values) : 0)
  const hi = props.max ?? (values.length ? Math.max(...values) : 1)
  return [lo, hi]
})

interface Region {
  key: string
  path: string
  fill: string
  data: { row: T, value: number } | null
  displayName: string
}

const regions = computed<Region[]>(() => {
  if (!base.ready.value)
    return []
  const [lo, hi] = extent.value
  const span = hi - lo

  return props.geoJson.features.map((feature, index) => {
    const featureName = String(
      feature.properties?.[props.nameProperty] ?? feature.id ?? index,
    )
    const data = joined.value.get(featureName) ?? null
    let fill = props.noDataColor ?? 'var(--tx-chart-map-area, #e5e7eb)'
    if (data) {
      const t = span > 0 ? (data.value - lo) / span : 0.5
      fill = rampColor(t, props.colorRange)
    }
    return {
      key: `${featureName}-${index}`,
      path: base.featurePath(feature),
      fill,
      data,
      displayName: featureName,
    }
  })
})

// shallowRef: a deep ref would unwrap the generic row type (UnwrapRef<T> ≠ T).
const hovered = shallowRef<Region | null>(null)
const tooltipEl = ref<HTMLElement | null>(null)

// kumo region emphasis: `focus: 'self'` keeps the hovered region's ramp colour
// while `blur.itemStyle.opacity` 0.45 dims every other region, over
// `stateAnimation`.
const emphasisState = useMapEmphasis<string>()

const BLUR_OPACITY = 0.45

/** Region opacity while another region carries emphasis (ECharts `blur`). */
function regionOpacity(region: Region): number {
  const active = emphasisState.activeKey.value
  if (active === null || active === region.key)
    return 1
  // Interpolate down from full opacity so both endpoints stay exact.
  return BLUR_OPACITY + (1 - BLUR_OPACITY) * (1 - emphasisState.progress.value)
}

function onEnter(region: Region): void {
  if (!region.data)
    return
  hovered.value = region
  emphasisState.enter(region.key)
  emit('regionHover', region.data.row)
}

function onLeave(region: Region): void {
  if (!region.data)
    return
  hovered.value = null
  emphasisState.leave()
  emit('regionHover', undefined)
}

function onClick(region: Region): void {
  if (region.data)
    emit('regionClick', region.data.row)
}

const legendGradient = computed(() => rampGradient(props.colorRange))
</script>

<template>
  <div
    :ref="base.container"
    class="tx-map tx-map--choropleth"
    :style="base.rootStyle.value"
    @wheel="base.onWheel"
    @pointerdown="base.onPointerDown"
    @pointermove="base.onPointerMove"
    @pointerup="base.onPointerUp"
  >
    <svg
      v-if="base.ready.value"
      class="tx-map__svg"
      :viewBox="`0 0 ${base.width.value} ${base.height.value}`"
    >
      <g :transform="base.transform.value">
        <path
          v-for="region in regions"
          :key="region.key"
          class="tx-map__region"
          :class="{ 'has-data': !!region.data }"
          :d="region.path"
          :fill="region.fill"
          :fill-opacity="regionOpacity(region)"
          :stroke-width="0.5 / base.scaleFactor.value"
          @pointerenter="onEnter(region)"
          @pointerleave="onLeave(region)"
          @click="onClick(region)"
        />
      </g>
    </svg>

    <div
      v-if="props.showTooltip && hovered && hovered.data"
      ref="tooltipEl"
      class="tx-map__tooltip"
      :style="base.tooltipStyle(tooltipEl)"
      role="presentation"
    >
      <slot
        name="tooltip"
        :row="hovered.data.row"
        :region-name="hovered.displayName"
        :value="hovered.data.value"
      >
        <strong>{{ hovered.displayName }}</strong>
        <span class="tx-map__tooltip-value">{{ props.valueFormat(hovered.data.value) }}</span>
      </slot>
    </div>

    <div
      v-if="props.showLegend"
      class="tx-map__legend"
      :style="{ '--tx-map-legend-inset': `${LEGEND_INSET}px` }"
      aria-hidden="true"
    >
      <span>{{ props.valueFormat(extent[0]) }}</span>
      <span class="tx-map__legend-bar" :style="{ background: legendGradient }" />
      <span>{{ props.valueFormat(extent[1]) }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use './map-shared';
</style>
