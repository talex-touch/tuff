<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '网络不可用',
      description: '检查连接后重试，离线期间不会覆盖当前草稿。',
      action: '重试连接',
    }
  : {
      title: 'Network unavailable',
      description: 'Check your connection and retry. Drafts stay untouched while offline.',
      action: 'Retry connection',
    }))
</script>

<template>
  <TxOfflineState
    surface="card"
    :title="labels.title"
    :description="labels.description"
    :primary-action="{ label: labels.action, type: 'primary' }"
  />
</template>
