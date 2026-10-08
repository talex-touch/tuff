<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import type { MotionMetricReadout } from './types'
import { computed } from 'vue'
import { ratio, toneColor, useMetricContext } from './context'
import MetricValue from './MetricValue.vue'
const props = withDefaults(defineProps<{ value?: number; target?: number; min?: number; mode?: 'segments' | 'arc' | 'ring' | 'rings'; items?: MotionMetricReadout[]; unit?: string; label?: string; count?: number }>(), { target: 100, min: 0, mode: 'segments', count: 16 })
const ctx = useMetricContext()
const fraction = computed(() => ratio(props.value, props.target, props.min))
const segmentedColors = computed(() => {
  let end = 0
  return (props.items ?? []).map((item, index) => {
    const start = end
    end += typeof item.value === 'number' ? ratio(item.value, props.target) : 0
    return { start, end, color: toneColor(item.tone, index) }
  })
})
function segmentColor(index: number): string {
  const part = segmentedColors.value.find(item => index / props.count >= item.start && index / props.count < item.end)
  return part?.color ?? (index / props.count < fraction.value ? 'var(--tx-color-primary)' : 'var(--tx-fill-color-dark)')
}
</script>
<template>
  <figure class="tx-mm-gauge" :class="`tx-mm-gauge--${mode}`" :aria-label="`${label || ''} ${ctx.format(value, unit)} / ${target}`">
    <svg v-if="mode === 'segments' || mode === 'arc'" viewBox="0 0 220 125" aria-hidden="true">
      <template v-if="mode === 'segments'">
        <rect v-for="n in count" :key="n" x="18" y="100" width="27" height="12" rx="3" :transform="`rotate(${(n - 1) * 180 / (count - 1)} 110 110)`" :fill="segmentColor(n - 1)" />
      </template>
      <template v-else>
        <path d="M 20 110 A 90 90 0 0 1 200 110" pathLength="100" class="tx-mm-gauge__track" />
        <path d="M 20 110 A 90 90 0 0 1 200 110" pathLength="100" :stroke-dasharray="`${fraction * 100} 100`" class="tx-mm-gauge__fill" />
      </template>
    </svg>
    <svg v-else viewBox="0 0 120 120" aria-hidden="true">
      <template v-if="mode === 'rings'">
        <g v-for="(item, i) in items" :key="item.id" transform="rotate(-90 60 60)">
          <circle cx="60" cy="60" :r="Math.max(12, 50 - i * 11)" pathLength="100" class="tx-mm-gauge__track" />
          <circle cx="60" cy="60" :r="Math.max(12, 50 - i * 11)" pathLength="100" :stroke="toneColor(item.tone, i)" :stroke-dasharray="`${ratio(typeof item.value === 'number' ? item.value : undefined, item.target) * 100} 100`" class="tx-mm-gauge__fill" />
        </g>
      </template>
      <g v-else transform="rotate(-90 60 60)">
        <circle cx="60" cy="60" r="48" pathLength="100" class="tx-mm-gauge__track" />
        <circle cx="60" cy="60" r="48" pathLength="100" :stroke-dasharray="`${fraction * 100} 100`" class="tx-mm-gauge__fill" />
      </g>
    </svg>
    <figcaption><MetricValue :value="value" :unit="unit" /><span>{{ label }}</span></figcaption>
  </figure>
</template>
