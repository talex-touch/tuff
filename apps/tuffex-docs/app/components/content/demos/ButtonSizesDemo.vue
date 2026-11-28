<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return { large: '大', medium: '中', small: '小' }
  }
  return { large: 'Large', medium: 'Medium', small: 'Small' }
})
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton size="lg">
      {{ labels.large }}
    </TxButton>
    <TxButton size="md">
      {{ labels.medium }}
    </TxButton>
    <TxButton size="sm">
      {{ labels.small }}
    </TxButton>
  </div>
</template>
