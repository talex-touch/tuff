<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      light: '轻微震动',
      medium: '中等震动',
      heavy: '重度震动',
      error: '错误震动',
      none: '默认无震动',
    }
  }
  return {
    light: 'Light haptic',
    medium: 'Medium haptic',
    heavy: 'Heavy haptic',
    error: 'Error haptic',
    none: 'Default: no haptic',
  }
})
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton variant="primary" vibrate vibrate-type="light">
      {{ labels.light }}
    </TxButton>
    <TxButton variant="primary" vibrate vibrate-type="medium">
      {{ labels.medium }}
    </TxButton>
    <TxButton variant="primary" vibrate vibrate-type="heavy">
      {{ labels.heavy }}
    </TxButton>
    <TxButton variant="danger" vibrate vibrate-type="error">
      {{ labels.error }}
    </TxButton>
    <TxButton variant="secondary">
      {{ labels.none }}
    </TxButton>
  </div>
</template>
