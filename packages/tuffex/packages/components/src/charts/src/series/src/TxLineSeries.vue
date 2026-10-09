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
  enter: 'clip',
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
// `draw` traces the stroke itself instead, decelerating as a hand would; a
// dashed stroke already spends its dash array, so it keeps the clip. The enter
// runs once, so the choice made at mount is the one that plays.
const enterClipId = `tx-line-enter-${nextSeriesUid()}`
const draws = props.enter === 'draw' && !props.dashed
const enterProgress = useEnterProgress({
  duration: ENTER_DURATION,
  easing: draws ? easings.cubicOut : easings.linear,
  enabled: () => positioned.value.length <= ANIMATION_THRESHOLD,
})
const enterWidth = computed(() => (draws ? plot.value.width : plot.value.width * enterProgress.value))
const drawing = computed(() => draws && enterProgress.value < 1)

// Where along the line each point sits, 0 to 1, so a symbol shows once the
// stroke has reached it. Measured on the straight segments between points:
// exact for `linear`, close enough for a curve to land each symbol as the
// stroke passes it.
const reach = computed(() => {
  const list = positioned.value
  const lengths = [0]
  for (let index = 1; index < list.length; index++) {
    const a = list[index - 1]!
    const b = list[index]!
    lengths.push(lengths[index - 1]! + Math.hypot(b.px - a.px, b.py - a.py))
  }
  const total = lengths[lengths.length - 1] ?? 0
  return lengths.map(length => (total > 0 ? length / total : 0))
})

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
        :pathLength="drawing ? 1 : undefined"
        :stroke-dasharray="drawing ? '1 1' : props.dashed ? '5 5' : undefined"
        :stroke-dashoffset="drawing ? 1 - enterProgress : undefined"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <template v-if="props.showSymbol">
        <circle
          v-for="(point, index) in animated"
          :key="index"
          class="tx-series__symbol"
          :class="{ 'is-pending': drawing && enterProgress < (reach[index] ?? 0) }"
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

  /* `enter: 'draw'`: a symbol the stroke has not reached yet. */
  .tx-series__symbol {
    transition: opacity 160ms ease-out;
  }
}

.tx-series__symbol.is-pending {
  opacity: 0;
}
</style>
