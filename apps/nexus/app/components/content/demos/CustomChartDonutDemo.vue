<script setup lang="ts">
import { TxArcSeries, TxChart } from '@talex-touch/tuffex-charts'
import { ref } from 'vue'

interface Slice { label: string, count: number }

const data: Slice[] = [
  { label: 'Desktop', count: 4820 },
  { label: 'Mobile', count: 3160 },
  { label: 'Tablet', count: 940 },
  { label: 'Other', count: 310 },
]

const picked = ref<string | null>(null)
</script>

<template>
  <div class="donut-demo">
    <TxChart :height="260" :padding="8">
      <TxArcSeries
        :data="data"
        value="count"
        name="label"
        :inner-radius="0.65"
        @slice-click="picked = $event.name ?? null"
      />
    </TxChart>
    <p class="donut-demo__readout">
      {{ picked ? `Clicked: ${picked}` : 'Click a slice.' }}
    </p>
  </div>
</template>

<style scoped>
.donut-demo {
  width: 100%;
  max-width: 360px;
}

.donut-demo__readout {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
  text-align: center;
}
</style>
