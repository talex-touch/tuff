<script setup lang="ts" generic="T">
import type { ArcSeriesProps, ArcSliceDatum } from './types'
import { arc, pie } from 'd3-shape'
import { computed, ref } from 'vue'
import {
  ANIMATION_THRESHOLD,
  easings,
  ENTER_DURATION,
  UPDATE_DURATION,
  useEnterProgress,
  useTweenedNumbers,
} from '../../core/animate'
import { resolveNumber, resolveString } from '../../core/accessor'
import { useChartContext } from '../../core/context'
import { ChartPalette } from '../../palette'

defineOptions({ name: 'TxArcSeries' })

const props = withDefaults(defineProps<ArcSeriesProps<T>>(), {
  innerRadius: 0.6,
  padAngle: 0.015,
  cornerRadius: 2,
})

const emit = defineEmits<{
  /** A slice was clicked. */
  sliceClick: [slice: ArcSliceDatum<T>]
  /**
   * Pointer entered a slice, or `null` when it left the arc entirely. Hosts
   * render the tooltip from this: the arc is axis-free, so there is no chart
   * context payload to read instead.
   */
  sliceHover: [slice: ArcSliceDatum<T> | null]
}>()

const ctx = useChartContext('TxArcSeries')

const center = computed(() => {
  const plot = ctx.plot.value
  return { x: plot.x + plot.width / 2, y: plot.y + plot.height / 2 }
})

const outerRadius = computed(() => {
  const plot = ctx.plot.value
  return Math.max(0, Math.min(plot.width, plot.height) / 2)
})

/** A slice's resting geometry, before any animation is applied. */
interface ArcEntry {
  key: number
  startAngle: number
  endAngle: number
  padAngle: number | undefined
  fill: string
  slice: ArcSliceDatum<T>
}

const entries = computed<ArcEntry[]>(() => {
  const radius = outerRadius.value
  if (radius <= 0 || props.data.length === 0)
    return []

  const values = props.data.map((datum, index) => resolveNumber(datum, index, props.value))
  const layout = pie<number>().sort(null).padAngle(props.padAngle)(values)

  return layout.map((segment) => {
    const index = segment.index
    const datum = props.data[index] as T
    return {
      key: index,
      startAngle: segment.startAngle,
      endAngle: segment.endAngle,
      padAngle: segment.padAngle,
      fill: props.color !== undefined
        ? resolveString(datum, index, props.color)
        : ChartPalette.categoricalVar(index),
      slice: {
        datum,
        index,
        name: props.name !== undefined ? resolveString(datum, index, props.name) : undefined,
        value: segment.value,
      },
    }
  })
})

// ECharts `animationThreshold` (2000): above it, render without animation.
const animated = computed(() => entries.value.length <= ANIMATION_THRESHOLD)

// ECharts pie `animationType: 'expansion'` runs on `animationDuration`
// (1000ms) with `animationEasing` cubicInOut on the first render.
const enterProgress = useEnterProgress({
  duration: ENTER_DURATION,
  easing: easings.cubicInOut,
  enabled: () => animated.value,
})

// ECharts `animationDurationUpdate` (500ms): morph `[startAngle, endAngle]`.
const flatTarget = computed(() =>
  entries.value.flatMap(entry => [entry.startAngle, entry.endAngle]),
)
const tweened = useTweenedNumbers(() => flatTarget.value, {
  duration: UPDATE_DURATION,
  easing: easings.cubicInOut,
  enabled: () => animated.value,
})

/** ECharts pie `emphasis.scale` size (`emphasis.scaleSize: 5`), in pixels. */
const EMPHASIS_SCALE_SIZE = 5

/** Index of the slice the pointer is over, driving `emphasis.scale`. */
const hovered = ref<number | null>(null)

function enterSlice(slice: ArcSliceDatum<T>): void {
  hovered.value = slice.index
  emit('sliceHover', slice)
}

/**
 * Bound to the group, not the slices: moving between two neighbouring slices
 * fires `pointerleave` on the first before `pointerenter` on the second, so a
 * per-slice leave would emit a spurious `null`.
 */
function leaveSlice(): void {
  if (hovered.value === null)
    return
  hovered.value = null
  emit('sliceHover', null)
}

interface ArcGeometry {
  startAngle: number
  endAngle: number
  padAngle?: number
}

interface Slice {
  key: number
  path: string
  fill: string
  transform?: string
  slice: ArcSliceDatum<T>
}

const slices = computed<Slice[]>(() => {
  const radius = outerRadius.value
  const generator = arc<ArcGeometry>()
    .innerRadius(radius * props.innerRadius)
    .outerRadius(radius)
    .cornerRadius(props.cornerRadius)
  const flat = tweened.value
  const progress = enterProgress.value

  return entries.value.map((entry, index) => {
    const offset = index * 2
    // A slice that just appeared has no tweened sample yet: fall back to its
    // target angles rather than emitting a broken path for a frame.
    const startAngle = progress < 1 ? entry.startAngle : (flat[offset] ?? entry.startAngle)
    // ECharts pie expansion: each slice grows from its own start angle.
    const endAngle = progress < 1
      ? entry.startAngle + (entry.endAngle - entry.startAngle) * progress
      : (flat[offset + 1] ?? entry.endAngle)
    // Outward direction at the slice's mid angle, matching ECharts' emphasis
    // translation (`[cos(mid), sin(mid)] * scaleSize` in d3's angle space).
    const mid = (startAngle + endAngle) / 2
    const shift = hovered.value === entry.key ? EMPHASIS_SCALE_SIZE : 0

    return {
      key: entry.key,
      path: generator({ startAngle, endAngle, padAngle: entry.padAngle }) ?? '',
      fill: entry.fill,
      transform: shift === 0
        ? undefined
        : `translate(${Math.sin(mid) * shift}, ${-Math.cos(mid) * shift})`,
      slice: entry.slice,
    }
  })
})
</script>

<template>
  <g
    class="tx-series tx-series--arc"
    :transform="`translate(${center.x}, ${center.y})`"
    @pointerleave="leaveSlice"
  >
    <path
      v-for="slice in slices"
      :key="slice.key"
      class="tx-series__slice"
      :d="slice.path"
      :fill="slice.fill"
      :transform="slice.transform"
      @pointerenter="enterSlice(slice.slice)"
      @click="emit('sliceClick', slice.slice)"
    />
  </g>
</template>

<style lang="scss" scoped>
.tx-series__slice {
  // ECharts pie `stateAnimation` (300ms, `cubicOut`) drives `emphasis.scale`.
  @media (prefers-reduced-motion: no-preference) {
    transition: transform 300ms cubic-bezier(0.33, 1, 0.68, 1);
  }
}
</style>
