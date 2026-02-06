<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      light: '轻微震动',
      medium: '中等震动',
      heavy: '重度震动',
      error: '错误震动',
      none: '无震动',
    }
  : {
      light: 'Light haptics',
      medium: 'Medium haptics',
      heavy: 'Heavy haptics',
      error: 'Error haptics',
      none: 'No haptics',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton variant="primary" vibrate-type="light">
      {{ labels.light }}
    </TxButton>
    <TxButton variant="primary" vibrate-type="medium">
      {{ labels.medium }}
    </TxButton>
    <TxButton variant="primary" vibrate-type="heavy">
      {{ labels.heavy }}
    </TxButton>
    <TxButton variant="danger" vibrate-type="error">
      {{ labels.error }}
    </TxButton>
    <TxButton variant="secondary" :vibrate="false">
      {{ labels.none }}
    </TxButton>
  </div>
</template>
