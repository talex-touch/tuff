<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

/** Latency (ms) against throughput (req/s) for two model pools. */
const onDevice = [
  [12, 140], [14, 132], [16, 155], [18, 148], [20, 170], [22, 162],
  [24, 186], [26, 178], [28, 205], [30, 198], [34, 221], [38, 214],
] as Array<[number, number]>

const cloud = [
  [42, 305], [46, 332], [50, 318], [54, 356], [58, 341], [62, 389],
  [66, 372], [70, 415], [76, 402], [82, 448], [88, 431], [96, 476],
] as Array<[number, number]>

const series = computed(() => locale.value === 'zh'
  ? [
      { name: '本地模型', data: onDevice },
      { name: '云端模型', data: cloud },
    ]
  : [
      { name: 'On-device', data: onDevice },
      { name: 'Cloud', data: cloud },
    ])

const xAxisName = computed(() => locale.value === 'zh' ? '延迟 (ms)' : 'Latency (ms)')
const yAxisName = computed(() => locale.value === 'zh' ? '吞吐 (req/s)' : 'Throughput (req/s)')
</script>

<template>
  <div class="echart-demo">
    <TxScatterChart
      :series="series"
      :x-axis-name="xAxisName"
      :y-axis-name="yAxisName"
      :height="260"
    />
  </div>
</template>

<style scoped>
.echart-demo {
  width: 100%;
  max-width: 560px;
}
</style>
