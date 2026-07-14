<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '没有匹配结果',
      description: '换一个关键词、清空筛选条件，或扩大搜索范围。',
      action: '重置筛选',
    }
  }

  return {
    title: 'No matches found',
    description: 'Try another keyword, clear filters, or broaden the search scope.',
    action: 'Reset filters',
  }
})
</script>

<template>
  <TxSearchEmpty
    :title="copy.title"
    :description="copy.description"
    surface="card"
    :primary-action="{ label: copy.action, type: 'primary', icon: 'i-carbon-reset' }"
  />
</template>

