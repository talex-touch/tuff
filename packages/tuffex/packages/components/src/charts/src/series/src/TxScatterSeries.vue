<script setup lang="ts" generic="T">
import type { ScatterSeriesProps } from './types'
import { computed } from 'vue'
import {
  ANIMATION_THRESHOLD,
  easings,
  ENTER_DURATION,
  UPDATE_DURATION,
  useEnterProgress,
  useTweenedNumbers,
} from '../../core/animate'
import { resolveNumber } from '../../core/accessor'
import { xPosition } from '../../core/scales'
import { useCartesianSeries } from './use-series'

defineOptions({ name: 'TxScatterSeries' })

const props = withDefaults(defineProps<ScatterSeriesProps<T>>(), {
  r: 3,
  fillOpacity: 0.9,
})

const { ctx, color, points } = useCartesianSeries(props, { component: 'TxScatterSeries' })

interface Dot {
  key: number
  cx: number
  cy: number
  r: number
}

const targetDots = computed<Dot[]>(() => {
  const xs = ctx.xScale.value
  const ys = ctx.yScale.value
  if (!xs || !ys)
    return []
  return points.value.map((point) => {
    const datum = props.data[point.index] as T
    return {
      key: point.index,
      cx: xPosition(xs, point.x),
      cy: ys(point.y),
      r: typeof props.r === 'number' ? props.r : resolveNumber(datum, point.index, props.r),
    }
  })
})

// ECharts `animationThreshold` (2000): above it, render without animation.
const animated = computed(() => targetDots.value.length <= ANIMATION_THRESHOLD)

// ECharts `animationDuration` (1000ms) / `animationEasing` (cubicInOut) on the
// first render.
const enterProgress = useEnterProgress({
  duration: ENTER_DURATION,
  easing: easings.cubicInOut,
  enabled: () => animated.value,
})

// ECharts `animationDurationUpdate` (500ms): morph `[cx, cy]` per symbol.
const flatTarget = computed(() => targetDots.value.flatMap(dot => [dot.cx, dot.cy]))
const tweened = useTweenedNumbers(() => flatTarget.value, {
  duration: UPDATE_DURATION,
  easing: easings.cubicInOut,
  enabled: () => animated.value,
})

const dots = computed<Dot[]>(() => {
  const flat = tweened.value
  const progress = enterProgress.value
  return targetDots.value.map((dot, index) => {
    // ECharts `Symbol.ts` creates symbols at `scaleX/scaleY = 0` and animates
    // them, with opacity, to the target on enter.
    if (progress < 1) {
      return {
        key: dot.key,
        cx: dot.cx,
        cy: dot.cy,
        r: dot.r * progress,
      }
    }
    const offset = index * 2
    // A point that just appeared has no tweened sample yet: fall back to its
    // target rather than emitting NaN geometry for a frame.
    return {
      key: dot.key,
      cx: flat[offset] ?? dot.cx,
      cy: flat[offset + 1] ?? dot.cy,
      r: dot.r,
    }
  })
})

/** Symbol opacity: 0 → `fillOpacity` during the enter animation. */
const dotOpacity = computed(() => props.fillOpacity * enterProgress.value)
</script>

<template>
  <g class="tx-series tx-series--scatter" :clip-path="`url(#${ctx.clipId})`">
    <circle
      v-for="dot in dots"
      :key="dot.key"
      class="tx-series__dot"
      :cx="dot.cx"
      :cy="dot.cy"
      :r="dot.r"
      :fill="color"
      :fill-opacity="dotOpacity"
    />
  </g>
</template>

<style lang="scss" scoped>
.tx-series--scatter {
  // ECharts `stateAnimation` (300ms, `cubicOut`): the fallthrough `opacity`
  // callers use to dim a series fades on the same state timing.
  @media (prefers-reduced-motion: no-preference) {
    transition: opacity 300ms cubic-bezier(0.33, 1, 0.68, 1);
  }
}
</style>
