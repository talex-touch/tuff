<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="success" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="warning" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="error" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="info" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="loading" />
  </div>
  <div v-else>
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="success" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="warning" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="error" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="info" />
        <TxStatusIcon name="i-ri-translate-2" :size="22" tone="loading" />
  </div>
</template>
