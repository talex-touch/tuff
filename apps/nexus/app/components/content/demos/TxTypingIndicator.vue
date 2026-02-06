<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="display: flex; gap: 12px; align-items: center;">
      <TxTypingIndicator />
      <TxTypingIndicator text="Thinking…" />
      <TxTypingIndicator :show-text="false" />
    </div>
  </div>
  <div v-else>
    <div style="display: flex; gap: 12px; align-items: center;">
      <TxTypingIndicator />
      <TxTypingIndicator text="Thinking…" />
      <TxTypingIndicator :show-text="false" />
    </div>
  </div>
</template>
