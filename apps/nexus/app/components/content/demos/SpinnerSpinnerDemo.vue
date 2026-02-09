<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <TxSpinner />
  </div>
  <div v-else>
      <TxSpinner />
  </div>
</template>
