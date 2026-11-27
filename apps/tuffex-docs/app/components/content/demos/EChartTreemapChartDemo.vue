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

const hint = computed(() => locale.value === 'zh'
  ? '拖拽平移；⌘/Ctrl + 滚轮或双指捏合缩放；双击复位。'
  : 'Drag to pan; ⌘/Ctrl + scroll or pinch to zoom; double-click to reset.')
</script>

<template>
  <div class="echart-demo not-prose">
    <TxTreemapChart :data="data" :unit="unit" :height="260" />
    <p class="echart-demo__hint">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.echart-demo {
  width: 100%;
  max-width: 560px;
}

.echart-demo__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
}
</style>
