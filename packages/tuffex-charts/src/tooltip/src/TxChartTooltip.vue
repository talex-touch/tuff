<script setup lang="ts">
import type { ChartTooltipProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useChartContext } from '../../core/context'
import { placeTooltip } from './position'

defineOptions({ name: 'TxChartTooltip' })

const props = withDefaults(defineProps<ChartTooltipProps>(), {
  open: 'auto',
  follow: 'both',
  offset: 12,
  fixedY: 0,
  hiddenCount: 0,
  moreLabel: (count: number) => `+${count} more`,
})

defineSlots<{
  /** Replaces the default rows body. */
  default?: (slotProps: { pointerX: number, pointerY: number }) => unknown
}>()

const ctx = useChartContext('TxChartTooltip')

const el = ref<HTMLElement | null>(null)
const size = ref({ width: 0, height: 0 })

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect)
      size.value = { width: rect.width, height: rect.height }
  })
  if (el.value)
    observer.observe(el.value)
})
onBeforeUnmount(() => observer?.disconnect())

const visible = computed(() => props.open === 'auto' ? ctx.pointer.inside : props.open)

const placement = computed(() => placeTooltip({
  pointerX: ctx.pointer.x,
  pointerY: ctx.pointer.y,
  tooltipWidth: size.value.width,
  tooltipHeight: size.value.height,
  containerWidth: ctx.width.value,
  containerHeight: ctx.height.value,
  offset: props.offset,
  follow: props.follow,
  fixedY: props.fixedY,
}))
</script>

<template>
  <div
    v-show="visible"
    ref="el"
    class="tx-chart-tooltip"
    :style="{ left: `${placement.left}px`, top: `${placement.top}px` }"
    role="presentation"
  >
    <slot :pointer-x="ctx.pointer.x" :pointer-y="ctx.pointer.y">
      <div v-if="props.title" class="tx-chart-tooltip__title">
        {{ props.title }}
      </div>
      <div
        v-for="row in props.rows ?? []"
        :key="row.name"
        class="tx-chart-tooltip__row"
      >
        <span class="tx-chart-tooltip__dot" :style="{ backgroundColor: row.color }" />
        <span class="tx-chart-tooltip__name">{{ row.name }}</span>
        <span class="tx-chart-tooltip__value">{{ row.value }}</span>
      </div>
      <div v-if="props.hiddenCount > 0" class="tx-chart-tooltip__more">
        {{ props.moreLabel(props.hiddenCount) }}
      </div>
    </slot>
  </div>
</template>

<style lang="scss" scoped>
.tx-chart-tooltip {
  position: absolute;
  z-index: 10;
  min-width: 150px;
  max-width: 20rem;
  padding: 0.5rem;
  border: 1px solid var(--tx-chart-grid-line, rgb(107 114 128 / 20%));
  border-radius: 0.5rem;
  background: var(--tx-chart-tooltip-bg, canvas);
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
  font-size: 0.75rem;
  pointer-events: none;

  &__title {
    margin-bottom: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-block: 0.125rem;
  }

  &__dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  &__name {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__value {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  &__more {
    margin-top: 0.25rem;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }
}
</style>
