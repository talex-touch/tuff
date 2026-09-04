<script setup lang="ts" generic="T">
import type { BarSeriesProps } from './types'
import { computed, onBeforeUnmount } from 'vue'
import { isBandScale, xPosition } from '../../core/scales'
import { nextSeriesUid, useCartesianSeries } from './use-series'

defineOptions({ name: 'TxBarSeries' })

const props = withDefaults(defineProps<BarSeriesProps<T>>(), {
  radius: 0,
})

const uid = nextSeriesUid()

const { ctx, color, points } = useCartesianSeries(props, {
  component: 'TxBarSeries',
  includeZeroY: true,
  // Stacked series contribute to the y domain via stack totals instead.
  reportY: () => props.stack === undefined,
})

const pointsMap = computed(() => {
  const map = new Map<string | number, number>()
  for (const point of points.value)
    map.set(point.x, point.y)
  return map
})

const unregisterBar = ctx.registerBar({
  uid,
  get stack() {
    return props.stack ?? null
  },
  points: () => pointsMap.value,
})
onBeforeUnmount(unregisterBar)

/** Full width available per x slot, shared by all bar lanes. */
const slotWidth = computed(() => {
  const xs = ctx.xScale.value
  if (!xs)
    return 0
  if (isBandScale(xs))
    return xs.bandwidth()
  const positions = [...new Set(points.value.map(point => xPosition(xs, point.x)))]
    .sort((a, b) => a - b)
  if (positions.length < 2)
    return Math.min(40, ctx.plot.value.width / 2)
  let minGap = Infinity
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1] as number
    const current = positions[i] as number
    minGap = Math.min(minGap, current - prev)
  }
  return minGap * 0.7
})

interface BarRect {
  key: string
  x: number
  y: number
  width: number
  height: number
}

const rects = computed<BarRect[]>(() => {
  const xs = ctx.xScale.value
  const ys = ctx.yScale.value
  if (!xs || !ys)
    return []
  const layout = ctx.barLayout.value
  const laneWidth = slotWidth.value / layout.laneCount
  const barWidth = props.barWidth ?? laneWidth
  const lane = layout.laneIndex(uid)

  return points.value.map((point) => {
    const slotX = isBandScale(xs)
      ? (xs(String(point.x)) ?? 0)
      : xPosition(xs, point.x) - slotWidth.value / 2
    const base = layout.baseline(uid, point.x)
    const y0 = ys(base)
    const y1 = ys(base + point.y)
    return {
      key: `${point.index}-${String(point.x)}`,
      x: slotX + lane * laneWidth + (laneWidth - barWidth) / 2,
      y: Math.min(y0, y1),
      width: Math.max(0, barWidth),
      height: Math.abs(y0 - y1),
    }
  })
})
</script>

<template>
  <g class="tx-series tx-series--bar" :clip-path="`url(#${ctx.clipId})`">
    <rect
      v-for="rect in rects"
      :key="rect.key"
      class="tx-series__bar"
      :x="rect.x"
      :y="rect.y"
      :width="rect.width"
      :height="rect.height"
      :rx="props.radius || undefined"
      :fill="color"
    />
  </g>
</template>
