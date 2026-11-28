<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '需要访问权限',
      description: '当前账号没有查看此工作区的权限，请向管理员申请访问。',
      action: '申请权限',
    }
  : {
      title: 'Permission required',
      description: 'Your account cannot view this workspace yet. Request access from an admin.',
      action: 'Request access',
    }))
</script>

<template>
  <TxPermissionState
    surface="card"
    :title="labels.title"
    :description="labels.description"
    :primary-action="{ label: labels.action, type: 'primary' }"
  />
</template>
