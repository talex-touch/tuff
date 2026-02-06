<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; gap: 12px; align-items: center;">
        <TxSpinner :size="12" />
        <TxSpinner :size="16" />
        <TxSpinner :size="24" />
        <TxSpinner :size="32" />
      </div>
  </div>
  <div v-else>
      <div style="display: flex; gap: 12px; align-items: center;">
        <TxSpinner :size="12" />
        <TxSpinner :size="16" />
        <TxSpinner :size="24" />
        <TxSpinner :size="32" />
      </div>
  </div>
</template>
