<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      success: '成功',
      warning: '警告',
      error: '错误',
      info: '信息',
    }
  : {
      success: 'Success',
      warning: 'Warning',
      error: 'Error',
      info: 'Info',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxStatusBadge :text="labels.success" status="success" />
    <TxStatusBadge :text="labels.warning" status="warning" />
    <TxStatusBadge :text="labels.error" status="danger" />
    <TxStatusBadge :text="labels.info" status="info" />
  </div>
</template>
