<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      default: '默认按钮',
      primary: 'Primary',
      secondary: 'Secondary',
      ghost: 'Ghost',
      danger: 'Danger',
    }
  }
  return {
    default: 'Default',
    primary: 'Primary',
    secondary: 'Secondary',
    ghost: 'Ghost',
    danger: 'Danger',
  }
})
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton disabled>
      {{ labels.default }}
    </TxButton>
    <TxButton variant="primary" disabled>
      {{ labels.primary }}
    </TxButton>
    <TxButton variant="secondary" disabled>
      {{ labels.secondary }}
    </TxButton>
    <TxButton variant="ghost" disabled>
      {{ labels.ghost }}
    </TxButton>
    <TxButton variant="danger" disabled>
      {{ labels.danger }}
    </TxButton>
  </div>
</template>
