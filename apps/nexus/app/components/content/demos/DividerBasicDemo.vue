<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '基础分组',
      before: '主要配置区域',
      after: '高级配置区域',
      advanced: '高级选项',
      dashed: '虚线分割',
    }
  : {
      title: 'Basic grouping',
      before: 'Primary configuration area',
      after: 'Advanced configuration area',
      advanced: 'Advanced options',
      dashed: 'Dashed divider',
    }))
</script>

<template>
  <div class="divider-demo-card">
    <strong>{{ labels.title }}</strong>
    <p>{{ labels.before }}</p>
    <TxDivider />
    <p>{{ labels.after }}</p>
    <TxDivider text-placement="left">
      {{ labels.advanced }}
    </TxDivider>
    <p>{{ labels.after }}</p>
    <TxDivider dashed text-placement="right">
      {{ labels.dashed }}
    </TxDivider>
  </div>
</template>

<style scoped>
.divider-demo-card {
  display: grid;
  gap: 8px;
  width: min(100%, 560px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 80%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 92%, transparent);
}

.divider-demo-card strong {
  color: var(--tx-text-color-primary);
}

.divider-demo-card p {
  margin: 0;
  color: var(--tx-text-color-secondary);
}
</style>
