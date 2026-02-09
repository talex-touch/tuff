<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      default: '默认',
      success: '成功',
      warning: '警告',
      danger: '危险',
    }
  : {
      default: 'Default',
      success: 'Success',
      warning: 'Warning',
      danger: 'Danger',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTag :label="labels.default" />
    <TxTag :label="labels.success" color="var(--tx-color-success)" />
    <TxTag :label="labels.warning" color="var(--tx-color-warning)" />
    <TxTag :label="labels.danger" color="var(--tx-color-danger)" />
  </div>
</template>
