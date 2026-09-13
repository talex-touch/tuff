<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const categories = computed(() => locale.value === 'zh'
  ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

const series = computed(() => locale.value === 'zh'
  ? [
      { name: '新增安装', data: [420, 468, 512, 494, 548, 610, 586] },
      { name: '会话数', data: [820, 932, 901, 934, 1290, 1330, 1320] },
    ]
  : [
      { name: 'Installs', data: [420, 468, 512, 494, 548, 610, 586] },
      { name: 'Sessions', data: [820, 932, 901, 934, 1290, 1330, 1320] },
    ])

const yAxisName = computed(() => locale.value === 'zh' ? '次数' : 'Count')
</script>

<template>
  <div class="echart-demo">
    <TxBarChart
      :series="series"
      :categories="categories"
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
