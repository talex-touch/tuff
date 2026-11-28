<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      ai: 'AI 推荐',
      sync: '已同步',
      locked: '受保护',
    }
  : {
      ai: 'AI Pick',
      sync: 'Synced',
      locked: 'Protected',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTag :label="labels.ai" icon="i-carbon-ai" color="#8b5cf6" />
    <TxTag :label="labels.sync" icon="i-carbon-checkmark-filled" color="var(--tx-color-success)" />
    <TxTag
      :label="labels.locked"
      icon="i-carbon-locked"
      color="#f59e0b"
      background="rgba(245, 158, 11, 0.14)"
      border="rgba(245, 158, 11, 0.36)"
    />
  </div>
</template>
