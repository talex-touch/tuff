<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '没有匹配结果',
      description: '调整筛选条件或清空关键字后再试。',
    }
  : {
      title: 'No matching results',
      description: 'Adjust filters or clear the search keyword.',
    }))
</script>

<template>
  <TxEmpty :title="labels.title" :description="labels.description" icon-class="i-carbon-search" compact />
</template>
