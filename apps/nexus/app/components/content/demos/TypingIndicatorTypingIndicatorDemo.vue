<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTypingIndicator />
  </div>
  <div v-else>
        <TxTypingIndicator />
  </div>
</template>
