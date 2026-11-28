<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '创建第一个工作区',
      description: '工作区帮助你整理项目、成员和自动化流程。按照引导完成初始配置。',
      action: '创建工作区',
    }
  : {
      title: 'Create your first workspace',
      description: 'Workspaces help you organize projects, members, and automations. Follow the guide to finish setup.',
      action: 'Create Workspace',
    }))
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 16px;">
    <TxGuideState
      :title="labels.title"
      :description="labels.description"
      surface="card"
      size="large"
      :primary-action="{ label: labels.action, type: 'primary' }"
    />
  </div>
</template>
