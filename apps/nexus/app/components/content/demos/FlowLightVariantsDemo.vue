<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const variants = computed(() => [
  { value: 'corners' as const, label: zh.value ? '双角柔光 corners' : 'Corners' },
  { value: 'rim' as const, label: zh.value ? '顶缘流光带 rim' : 'Rim' },
  { value: 'aurora' as const, label: zh.value ? '极光漫射 aurora' : 'Aurora' },
])
const rows = computed(() => zh.value ? ['新建对话', '重命名', '归档'] : ['New chat', 'Rename', 'Archive'])
</script>

<template>
  <div class="flow-light-variants-demo not-prose">
    <!-- The same three panels on a light tile and on a dark one (`data-theme="dark"`). -->
    <div v-for="theme in ['light', 'dark']" :key="theme" class="flow-light-variants-demo__tile" :data-theme="theme === 'dark' ? 'dark' : undefined">
      <figure v-for="item in variants" :key="item.value" class="flow-light-variants-demo__item">
        <div class="flow-light-variants-demo__panel">
          <TxFlowLight :variant="item.value" />
          <span v-for="row in rows" :key="row" class="flow-light-variants-demo__row">{{ row }}</span>
        </div>
        <figcaption>{{ item.label }}</figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.flow-light-variants-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.flow-light-variants-demo__tile {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 20px;
  border-radius: 16px;
  background: var(--tx-bg-color-page, #f2f3f5);
}

.flow-light-variants-demo__tile[data-theme='dark'] {
  background: #161618;
}

.flow-light-variants-demo__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.flow-light-variants-demo__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 14px;
  background: var(--tx-bg-color-overlay, #fff);
}

[data-theme='dark'] .flow-light-variants-demo__panel {
  border-color: rgb(255 255 255 / 10%);
  background: #1f1f22;
}

.flow-light-variants-demo__row {
  position: relative;
  padding: 7px 10px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

[data-theme='dark'] .flow-light-variants-demo__row {
  color: #e5e5e7;
}

figcaption {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-align: center;
}

[data-theme='dark'] figcaption {
  color: #8e8e93;
}
</style>
