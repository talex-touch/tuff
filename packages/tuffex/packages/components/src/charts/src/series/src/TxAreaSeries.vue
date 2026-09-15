<script setup lang="ts" generic="T">
import type { AreaSeriesProps } from './types'
import { area, line } from 'd3-shape'
import { computed } from 'vue'
import {
  ANIMATION_THRESHOLD,
  ENTER_DURATION,
  UPDATE_DURATION,
  easings,
  useEnterProgress,
  useTweenedNumbers,
} from '../../core/animate'
import { xPosition } from '../../core/scales'
import { curveFactory } from './curves'
import { nextSeriesUid, useCartesianSeries } from './use-series'

defineOptions({ name: 'TxAreaSeries' })

const props = withDefaults(defineProps<AreaSeriesProps<T>>(), {
  curve: 'linear',
  strokeWidth: 2,
  gradient: true,
  fillOpacity: 0.2,
})

const { ctx, color, points } = useCartesianSeries(props, { component: 'TxAreaSeries' })

const gradientId = `tx-area-gradient-${nextSeriesUid()}`

const positioned = computed(() => {
  const xs = ctx.xScale.value
  const ys = ctx.yScale.value
  if (!xs || !ys)
    return []
  return points.value.map(point => ({
    px: xPosition(xs, point.x),
    py: ys(point.y),
  }))
})

// Area drops to the zero line when zero is inside the y domain, otherwise to
// the nearest domain edge — never outside the plot.
const baselineY = computed(() => {
  const ys = ctx.yScale.value
  if (!ys)
    return 0
  const [lo, hi] = ys.domain() as [number, number]
  return ys(Math.min(Math.max(0, lo), hi))
})

const plot = computed(() => ctx.plot.value)

// ECharts animates the area as part of the line series: a clip rectangle
// expands left→right on first render, with the line series' `linear` easing.
const enterClipId = `tx-area-enter-${nextSeriesUid()}`
const enterProgress = useEnterProgress({
  duration: ENTER_DURATION,
  easing: easings.linear,
  enabled: () => positioned.value.length <= ANIMATION_THRESHOLD,
})
const enterWidth = computed(() => plot.value.width * enterProgress.value)

// Data updates morph point positions (ECharts `animationDurationUpdate`). The
// morph stays off while the enter reveal runs, so both paths keep their final
// geometry and only the clip rides the enter animation.
const morph = useTweenedNumbers(
  () => {
    const flat: number[] = []
    for (const point of positioned.value)
      flat.push(point.px, point.py)
    return flat
  },
  {
    duration: UPDATE_DURATION,
    enabled: () => enterProgress.value >= 1 && positioned.value.length <= ANIMATION_THRESHOLD,
  },
)

const animated = computed(() => {
  const values = morph.value
  const list: Array<{ px: number, py: number }> = []
  for (let index = 0; index + 1 < values.length; index += 2)
    list.push({ px: values[index] as number, py: values[index + 1] as number })
  return list
})

const areaPath = computed(() => {
  const generator = area<{ px: number, py: number }>()
    .x(point => point.px)
    .y0(baselineY.value)
    .y1(point => point.py)
    .curve(curveFactory(props.curve))
  return generator(animated.value) ?? ''
})

const linePath = computed(() => {
  if (props.strokeWidth <= 0)
    return ''
  const generator = line<{ px: number, py: number }>()
    .x(point => point.px)
    .y(point => point.py)
    .curve(curveFactory(props.curve))
  return generator(animated.value) ?? ''
})
</script>

<template>
  <g class="tx-series tx-series--area" :clip-path="`url(#${ctx.clipId})`">
    <defs>
      <linearGradient v-if="props.gradient" :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.4" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
      <clipPath :id="enterClipId">
        <rect
          :x="plot.x"
          :y="plot.y"
          :width="enterWidth"
          :height="plot.height"
        />
      </clipPath>
    </defs>
    <g :clip-path="`url(#${enterClipId})`">
      <path
        v-if="areaPath"
        class="tx-series__fill"
        :d="areaPath"
        :fill="props.gradient ? `url(#${gradientId})` : color"
        :fill-opacity="props.gradient ? undefined : props.fillOpacity"
        stroke="none"
      />
      <path
        v-if="linePath"
        class="tx-series__stroke"
        :d="linePath"
        fill="none"
        :stroke="color"
        :stroke-width="props.strokeWidth"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </g>
  </g>
</template>

<style>
/* ECharts `stateAnimation` (300ms, cubicOut): the fallthrough `opacity`
   attribute used to dim a series eases instead of snapping. */
@media (prefers-reduced-motion: no-preference) {
  .tx-series--area {
    transition: opacity 300ms cubic-bezier(0.33, 1, 0.68, 1);
  }
}
</style>
