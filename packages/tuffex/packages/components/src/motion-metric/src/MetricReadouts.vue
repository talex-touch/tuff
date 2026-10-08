<script setup lang="ts">
import type { MotionMetricReadout } from './types'
import TxStatCard from '../../stat-card/src/TxStatCard.vue'
import { useMetricContext } from './context'
defineProps<{ items?: MotionMetricReadout[]; compact?: boolean }>()
const ctx = useMetricContext()
</script>
<template>
  <dl v-if="compact" class="tx-mm-readouts tx-mm-readouts--compact">
    <div v-for="item in items" :key="item.id">
      <dt>{{ item.label }} <span v-if="item.grade" class="tx-mm-grade">{{ item.grade }}</span></dt>
      <dd>{{ ctx.format(item.value, item.unit) }} <small v-if="item.status">{{ item.status }}</small></dd>
      <p v-if="item.description">
{{ item.description }}
</p>
    </div>
  </dl>
  <div v-else class="tx-mm-readouts">
    <TxStatCard
v-for="item in items" :key="item.id" :label="item.label" :value="ctx.format(item.value, item.unit)" :meta="item.description || item.status"
      :progress="item.target !== undefined && typeof item.value === 'number' ? item.value / (item.target || 1) * 100 : undefined"
      :insight="item.previous !== undefined && typeof item.value === 'number' ? { from: item.previous, to: item.value, color: item.tone } : undefined"
/>
  </div>
</template>
