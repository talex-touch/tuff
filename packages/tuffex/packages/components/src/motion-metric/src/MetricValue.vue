<script setup lang="ts">
import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'
import { useMetricContext } from './context'
defineProps<{ value?: number | string; unit?: string; target?: number; previous?: number }>()
const ctx = useMetricContext()
</script>
<template>
  <div class="tx-mm-value">
    <TxTextMorph :text="ctx.format(value, unit)" :disabled="!ctx.active.value" numbers />
    <span v-if="target !== undefined" class="tx-mm-target">/ {{ ctx.format(target, unit) }}</span>
    <small v-if="previous !== undefined && typeof value === 'number'">{{ ctx.format(value - previous) }} {{ previous !== 0 ? `(${((value - previous) / Math.abs(previous) * 100).toFixed(1)}%)` : '' }}</small>
  </div>
</template>
