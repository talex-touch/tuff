<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '创建第一个项目',
      description: '先创建项目，用于组织文档、审阅和自动化流程。',
      primary: '创建项目',
      secondary: '查看指南',
    }
  : {
      title: 'Create your first project',
      description: 'Start with a project to organize docs, reviews, and automation.',
      primary: 'Create project',
      secondary: 'View guide',
    }))
</script>

<template>
  <TxBlankSlate
    :title="labels.title"
    :description="labels.description"
    :primary-action="{ label: labels.primary, type: 'primary' }"
    :secondary-action="{ label: labels.secondary }"
  />
</template>
