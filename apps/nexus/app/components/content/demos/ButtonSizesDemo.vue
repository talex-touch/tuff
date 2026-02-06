<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { large: '大号', medium: '中号', small: '小号' }
  : { large: 'Large', medium: 'Medium', small: 'Small' }))
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
