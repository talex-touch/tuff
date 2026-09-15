<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const data = computed(() => locale.value === 'zh'
  ? [
      { name: '桌面端', children: [
        { name: '工作台', value: 46 },
        { name: '插件市场', value: 28 },
        { name: '设置', value: 14 },
      ] },
      { name: '移动端', children: [
        { name: '首页', value: 38 },
        { name: '消息', value: 22 },
        { name: '我的', value: 12 },
      ] },
    ]
  : [
      { name: 'Desktop', children: [
        { name: 'Workbench', value: 46 },
        { name: 'Marketplace', value: 28 },
        { name: 'Settings', value: 14 },
      ] },
      { name: 'Mobile', children: [
        { name: 'Home', value: 38 },
        { name: 'Messages', value: 22 },
        { name: 'Profile', value: 12 },
      ] },
    ])

const unit = computed(() => locale.value === 'zh' ? '次' : 'visits')
</script>

<template>
  <div class="echart-demo">
    <TxTreemapChart :data="data" :unit="unit" :height="260" />
  </div>
</template>

<style scoped>
.echart-demo {
  width: 100%;
  max-width: 560px;
}
</style>
