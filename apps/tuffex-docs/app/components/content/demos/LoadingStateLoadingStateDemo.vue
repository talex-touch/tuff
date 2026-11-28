<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '正在加载插件',
      description: '正在同步官方插件、权限和启用状态。',
    }
  }

  return {
    title: 'Loading plugins',
    description: 'Syncing official plugins, permissions, and enabled state.',
  }
})
</script>

<template>
  <TxLoadingState
    :title="copy.title"
    :description="copy.description"
    surface="card"
    size="medium"
  />
</template>
