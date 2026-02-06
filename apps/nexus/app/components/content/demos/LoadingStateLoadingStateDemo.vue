<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxLoadingState description="Loading official plugins..." />
  </div>
  <div v-else>
        <TxLoadingState description="Loading official plugins..." />
  </div>
</template>
