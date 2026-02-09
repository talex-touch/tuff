<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      placeholder: '搜索...',
      action: '搜索',
    }
  : {
      placeholder: 'Search...',
      action: 'Go',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TuffInput :placeholder="labels.placeholder" />
    <TxButton size="sm">
      {{ labels.action }}
    </TxButton>
  </div>
</template>
