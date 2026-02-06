<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffProgress :percentage="60" />
        <TxStatusBadge text="进行中" status="warning" />
  </div>
  <div v-else>
        <TuffProgress :percentage="60" />
        <TxStatusBadge text="Running" status="warning" />
  </div>
</template>
