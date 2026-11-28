<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const indicators = computed(() => locale.value === 'zh'
  ? [
      { name: '启动速度', max: 100 },
      { name: '搜索准确', max: 100 },
      { name: '插件生态', max: 100 },
      { name: '同步稳定', max: 100 },
      { name: '内存占用', max: 100 },
    ]
  : [
      { name: 'Launch', max: 100 },
      { name: 'Search', max: 100 },
      { name: 'Plugins', max: 100 },
      { name: 'Sync', max: 100 },
      { name: 'Memory', max: 100 },
    ])

const series = computed(() => locale.value === 'zh'
  ? [
      { name: '塔芙', data: [92, 88, 74, 90, 82], area: true },
      { name: '同类平均', data: [78, 72, 86, 68, 70], area: true },
    ]
  : [
      { name: 'Tuff', data: [92, 88, 74, 90, 82], area: true },
      { name: 'Average', data: [78, 72, 86, 68, 70], area: true },
    ])
</script>

<template>
  <div class="echart-demo">
    <TxRadarChart
      :indicators="indicators"
      :series="series"
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
