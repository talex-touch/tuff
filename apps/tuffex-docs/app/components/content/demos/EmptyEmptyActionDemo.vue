<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '还没有项目',
      description: '创建第一个项目后，可以在这里统一管理。',
      action: '新建项目',
    }
  : {
      title: 'No items yet',
      description: 'Create the first item to start managing this list.',
      action: 'New item',
    }))
</script>

<template>
  <TxEmpty :title="labels.title" :description="labels.description">
    <template #action>
      <TxButton type="primary">
        {{ labels.action }}
      </TxButton>
    </template>
  </TxEmpty>
</template>
