<script setup lang="ts">
import { TxArcSeries, TxChart } from '@talex-touch/tuffex/charts'
import { computed, ref } from 'vue'
import { CHART_ZH_LABELS } from './chart-demo-locale'

interface Slice { label: string, count: number }

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      devices: ['桌面端', '移动端', '平板', '其他'],
      clicked: (name: string) => `点了：${name}`,
      hint: '点一下某个扇区。',
      labels: CHART_ZH_LABELS,
    }
  : {
      devices: ['Desktop', 'Mobile', 'Tablet', 'Other'],
      clicked: (name: string) => `Clicked: ${name}`,
      hint: 'Click a slice.',
      labels: undefined,
    })

const counts = [4820, 3160, 940, 310]
const data = computed<Slice[]>(() => copy.value.devices.map((label, index) => ({ label, count: counts[index]! })))

const picked = ref<string | null>(null)
</script>

<template>
  <div class="donut-demo">
    <TxChart :height="260" :padding="8" :labels="copy.labels">
      <TxArcSeries
        :data="data"
        value="count"
        name="label"
        :inner-radius="0.65"
        @slice-click="picked = $event.name ?? null"
      />
    </TxChart>
    <p class="donut-demo__readout">
      {{ picked ? copy.clicked(picked) : copy.hint }}
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
