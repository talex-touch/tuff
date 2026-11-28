<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '行内垂直分隔',
      status: '已发布',
      owner: '平台团队',
      updated: '刚刚更新',
      dashed: '虚线',
      gradient: '渐变',
    }
  : {
      title: 'Inline vertical divider',
      status: 'Published',
      owner: 'Platform team',
      updated: 'Updated just now',
      dashed: 'Dashed',
      gradient: 'Gradient',
    }))
</script>

<template>
  <div class="divider-vertical-demo">
    <strong>{{ labels.title }}</strong>
    <div class="divider-vertical-demo__line">
      <span>{{ labels.status }}</span>
      <TxDivider direction="vertical" />
      <span>{{ labels.owner }}</span>
      <TxDivider direction="vertical" dashed />
      <span>{{ labels.updated }}</span>
      <TxDivider direction="vertical" dashed />
      <span>{{ labels.dashed }}</span>
      <TxDivider direction="vertical" gradient />
      <span>{{ labels.gradient }}</span>
    </div>
  </div>
</template>

<style scoped>
.divider-vertical-demo {
  display: grid;
  gap: 12px;
  width: min(100%, 560px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 80%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 92%, transparent);
}

.divider-vertical-demo strong {
  color: var(--tx-text-color-primary);
}

.divider-vertical-demo__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  color: var(--tx-text-color-secondary);
}
</style>
