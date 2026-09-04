<script setup lang="ts">
import type { ChartPadding } from '../../core/types'
import type { ChartProps } from './types'
import { computed, onBeforeUnmount, onMounted, provide, ref, toRef } from 'vue'
import { chartContextKey, createChartContext } from '../../core/context'

defineOptions({ name: 'TxChart' })

const props = withDefaults(defineProps<ChartProps>(), {
  height: 350,
  padding: 24,
  xType: 'linear',
  yNice: true,
})

defineSlots<{
  /** SVG layers: axes, grid, series. Rendered inside the chart's <svg>. */
  default?: () => unknown
  /** DOM overlay above the SVG (tooltips, annotations). */
  overlay?: () => unknown
}>()

const container = ref<HTMLElement | null>(null)
const measuredWidth = ref(0)
const measuredHeight = ref(0)

// Measure the container, not the svg — the svg's own size follows the styles
// this component sets, so observing it reports back our writes, not layout.
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!container.value)
    return
  measuredWidth.value = container.value.clientWidth
  measuredHeight.value = container.value.clientHeight
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (!rect)
      return
    measuredWidth.value = rect.width
    measuredHeight.value = rect.height
  })
  observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())

const width = computed(() => props.width ?? measuredWidth.value)
const height = computed(() =>
  props.aspectRatio !== undefined ? measuredHeight.value : props.height,
)
const ready = computed(() => width.value > 0 && height.value > 0)

const padding = computed<ChartPadding>(() => {
  const raw = props.padding
  if (typeof raw === 'number')
    return { top: raw, right: raw, bottom: raw, left: raw }
  return { top: raw.top ?? 24, right: raw.right ?? 24, bottom: raw.bottom ?? 24, left: raw.left ?? 24 }
})

const context = createChartContext({
  width,
  height,
  padding,
  xType: toRef(props, 'xType'),
  xDomain: toRef(props, 'xDomain'),
  yDomain: toRef(props, 'yDomain'),
  yNice: toRef(props, 'yNice'),
  container,
})
provide(chartContextKey, context)

function onPointerMove(event: PointerEvent): void {
  const el = container.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  context.pointer.x = event.clientX - rect.left
  context.pointer.y = event.clientY - rect.top
  context.pointer.inside = true
}

function onPointerLeave(): void {
  context.pointer.inside = false
}

defineExpose({
  /** The chart context, for advanced consumers building custom layers. */
  context,
})
</script>

<template>
  <div
    ref="container"
    class="tx-chart"
    :style="props.aspectRatio !== undefined
      ? { aspectRatio: String(props.aspectRatio) }
      : { height: `${props.height}px` }"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <svg
      v-if="ready"
      class="tx-chart__svg"
      :viewBox="`0 0 ${width} ${height}`"
      :role="props.ariaDescription ? 'img' : undefined"
      :aria-label="props.ariaDescription"
      :tabindex="props.ariaDescription ? 0 : undefined"
    >
      <defs>
        <clipPath :id="context.clipId">
          <rect
            :x="context.plot.value.x"
            :y="context.plot.value.y"
            :width="context.plot.value.width"
            :height="context.plot.value.height"
          />
        </clipPath>
      </defs>
      <slot />
    </svg>
    <div class="tx-chart__overlay">
      <slot name="overlay" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-chart {
  position: relative;
  width: 100%;

  &__svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  &__overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
}
</style>
