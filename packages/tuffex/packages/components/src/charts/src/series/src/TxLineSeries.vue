<script setup lang="ts" generic="T">
import type { LineSeriesProps } from './types'
import { line } from 'd3-shape'
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

defineOptions({ name: 'TxLineSeries' })

const props = withDefaults(defineProps<LineSeriesProps<T>>(), {
  curve: 'linear',
  strokeWidth: 2,
  showSymbol: false,
  dashed: false,
})

const { ctx, color, points } = useCartesianSeries(props, { component: 'TxLineSeries' })

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

const plot = computed(() => ctx.plot.value)

// ECharts' line series reveals on first render by expanding a clip rectangle
// left→right, and overrides the global easing to `linear` (LineSeries).
const enterClipId = `tx-line-enter-${nextSeriesUid()}`
const enterProgress = useEnterProgress({
  duration: ENTER_DURATION,
  easing: easings.linear,
  enabled: () => positioned.value.length <= ANIMATION_THRESHOLD,
})
const enterWidth = computed(() => plot.value.width * enterProgress.value)

// Data updates morph point positions (ECharts `animationDurationUpdate`). The
// morph stays off while the enter reveal runs, so the path is already at its
// final geometry and only the clip rides the enter animation.
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

const path = computed(() => {
  const generator = line<{ px: number, py: number }>()
    .x(point => point.px)
    .y(point => point.py)
    .curve(curveFactory(props.curve))
  return generator(animated.value) ?? ''
})
</script>

<template>
  <g class="tx-series tx-series--line" :clip-path="`url(#${ctx.clipId})`">
    <defs>
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
        v-if="path"
        class="tx-series__stroke"
        :d="path"
        fill="none"
        :stroke="color"
        :stroke-width="props.strokeWidth"
        :stroke-dasharray="props.dashed ? '5 5' : undefined"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <template v-if="props.showSymbol">
        <circle
          v-for="(point, index) in animated"
          :key="index"
          class="tx-series__symbol"
          :cx="point.px"
          :cy="point.py"
          :r="props.strokeWidth + 1"
          :fill="color"
        />
      </template>
    </g>
  </g>
</template>

<style>
/* ECharts `stateAnimation` (300ms, cubicOut): the fallthrough `opacity`
   attribute used to dim a series eases instead of snapping. */
@media (prefers-reduced-motion: no-preference) {
  .tx-series--line {
    transition: opacity 300ms cubic-bezier(0.33, 1, 0.68, 1);
  }
}
</style>
