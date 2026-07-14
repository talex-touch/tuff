<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '未选择条目',
      description: '从左侧列表选择一个项目后，这里会显示详情。',
      action: '新建项目',
    }
  : {
      title: 'No item selected',
      description: 'Select an item from the left list to inspect its details.',
      action: 'Create item',
    }))
</script>

<template>
  <TxNoSelection
    surface="card"
    :title="labels.title"
    :description="labels.description"
    :primary-action="{ label: labels.action, type: 'primary' }"
  />
</template>
