<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '暂无记录',
      description: '创建第一条记录后，表格会在这里显示数据。',
      action: '创建记录',
    }
  : {
      title: 'No records yet',
      description: 'Create the first record to populate this table.',
      action: 'Create record',
    }))
</script>

<template>
  <TxNoData
    surface="card"
    :title="labels.title"
    :description="labels.description"
    :primary-action="{ label: labels.action, type: 'primary' }"
  />
</template>
