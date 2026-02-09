<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxLoadingState description="Loading official plugins..." />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxLoadingState description="Loading official plugins..." />
    </div>
  </div>
</template>
