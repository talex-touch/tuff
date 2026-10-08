<!-- Adapted from Amicro (MIT). Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
import type { MotionMetricCell } from './types'
import { computed } from 'vue'
import { useMetricContext } from './context'
const props = withDefaults(defineProps<{ cells?: MotionMetricCell[]; columns?: number; calendar?: boolean; monochrome?: boolean }>(), { columns: 7 })
const ctx = useMetricContext()
const maximum = computed(() => Math.max(1, ...(props.cells ?? []).map(cell => cell.value)))
</script>
<template>
  <div class="tx-mm-matrix" :class="{ 'tx-mm-matrix--calendar': calendar, 'tx-mm-matrix--mono': monochrome }" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <button v-for="(cell, index) in cells" :key="cell.id" type="button" :disabled="ctx.disabled.value" :title="`${cell.label}: ${ctx.format(cell.value)}${cell.description ? ` · ${cell.description}` : ''}`" :aria-label="`${cell.label}: ${ctx.format(cell.value)}`" :aria-pressed="cell.selected || ctx.index.value === index" :style="{ '--tx-mm-intensity': String(cell.value > 0 ? 0.25 + 0.75 * cell.value / maximum : 0.08) }" @click="ctx.select(index, cell.id)">
      <span v-if="calendar">{{ cell.label }}</span>
    </button>
  </div>
</template>
