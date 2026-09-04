<script setup lang="ts">
import type { AxisProps } from './types'
import { computed } from 'vue'
import { useChartContext } from '../../core/context'
import { defaultTickFormat, xPosition, xTickValues } from '../../core/scales'

defineOptions({ name: 'TxAxis' })

const props = withDefaults(defineProps<AxisProps>(), {
  ticks: 5,
  nameGap: undefined,
  line: false,
})

const ctx = useChartContext('TxAxis')

interface Tick {
  key: string
  position: number
  label: string
}

const tickItems = computed<Tick[]>(() => {
  if (props.position === 'bottom') {
    const scale = ctx.xScale.value
    if (!scale)
      return []
    const format = props.format ?? defaultTickFormat(scale, props.ticks)
    return xTickValues(scale, props.ticks).map(value => ({
      key: String(value instanceof Date ? value.getTime() : value),
      position: xPosition(scale, value instanceof Date ? value.getTime() : value),
      label: format(value),
    }))
  }
  const scale = ctx.yScale.value
  if (!scale)
    return []
  const format = props.format ?? defaultTickFormat(scale, props.ticks)
  return scale.ticks(props.ticks).map(value => ({
    key: String(value),
    position: scale(value),
    label: format(value),
  }))
})

const nameTransform = computed(() => {
  const plot = ctx.plot.value
  if (props.position === 'bottom') {
    const gap = props.nameGap ?? 30
    return { x: plot.x + plot.width / 2, y: plot.y + plot.height + gap, rotate: false }
  }
  const gap = props.nameGap ?? 40
  return { x: plot.x - gap, y: plot.y + plot.height / 2, rotate: true }
})
</script>

<template>
  <g class="tx-axis" :class="`tx-axis--${props.position}`" aria-hidden="true">
    <line
      v-if="props.line && props.position === 'bottom'"
      class="tx-axis__line"
      :x1="ctx.plot.value.x"
      :y1="ctx.plot.value.y + ctx.plot.value.height"
      :x2="ctx.plot.value.x + ctx.plot.value.width"
      :y2="ctx.plot.value.y + ctx.plot.value.height"
    />
    <line
      v-if="props.line && props.position === 'left'"
      class="tx-axis__line"
      :x1="ctx.plot.value.x"
      :y1="ctx.plot.value.y"
      :x2="ctx.plot.value.x"
      :y2="ctx.plot.value.y + ctx.plot.value.height"
    />

    <template v-if="props.position === 'bottom'">
      <text
        v-for="tick in tickItems"
        :key="tick.key"
        class="tx-axis__label"
        :x="tick.position"
        :y="ctx.plot.value.y + ctx.plot.value.height + 8"
        text-anchor="middle"
        dominant-baseline="hanging"
      >
        {{ tick.label }}
      </text>
    </template>
    <template v-else>
      <text
        v-for="tick in tickItems"
        :key="tick.key"
        class="tx-axis__label"
        :x="ctx.plot.value.x - 8"
        :y="tick.position"
        text-anchor="end"
        dominant-baseline="middle"
      >
        {{ tick.label }}
      </text>
    </template>

    <text
      v-if="props.name"
      class="tx-axis__name"
      :x="nameTransform.x"
      :y="nameTransform.y"
      text-anchor="middle"
      :dominant-baseline="props.position === 'bottom' ? 'hanging' : 'auto'"
      :transform="nameTransform.rotate ? `rotate(-90, ${nameTransform.x}, ${nameTransform.y})` : undefined"
    >
      {{ props.name }}
    </text>
  </g>
</template>

<style lang="scss" scoped>
.tx-axis {
  &__line {
    stroke: var(--tx-chart-grid-line, rgb(107 114 128 / 20%));
    stroke-width: 1;
  }

  &__label,
  &__name {
    fill: var(--tx-chart-text-primary, #6b7280);
    font-size: 12px;
  }
}
</style>
