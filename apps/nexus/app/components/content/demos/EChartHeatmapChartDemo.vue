<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const columns = computed(() => locale.value === 'zh'
  ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

const rows = ['00-04', '04-08', '08-12', '12-16', '16-20']

const values = computed(() => locale.value === 'zh'
  ? [
      [12, 9, 14, 11, 8, 26, 31],
      [7, 6, 9, 8, 5, 14, 18],
      [42, 48, 45, 52, 58, 36, 29],
      [55, 61, 58, 64, 72, 44, 38],
      [38, 44, 41, 47, 66, 52, 33],
    ]
  : [
      [10, 8, 12, 9, 7, 22, 27],
      [6, 5, 8, 7, 4, 12, 15],
      [38, 43, 40, 47, 52, 32, 26],
      [50, 55, 52, 58, 65, 40, 34],
      [34, 40, 37, 42, 60, 47, 30],
    ])

const unit = computed(() => locale.value === 'zh' ? '次' : '')
</script>

<template>
  <div class="echart-demo">
    <TxHeatmapChart
      :values="values"
      :rows="rows"
      :columns="columns"
      :unit="unit"
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
